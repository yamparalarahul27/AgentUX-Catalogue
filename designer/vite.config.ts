import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

import { injectOverlay } from '../api/_prototype-overlay';

// Build-time identifier baked into the bundle + written as a sibling
// JSON file. The runtime app polls /designer/build-id.json and
// compares to the constant — when they diverge, a new build is live
// and the App-update toast surfaces. Stable per `vite build` run.
const BUILD_ID = String(Date.now());

function writeBuildIdJson(): Plugin {
  return {
    name: 'write-build-id-json',
    apply: 'build',
    closeBundle() {
      const outFile = path.resolve(__dirname, '../site/designer/build-id.json');
      fs.writeFileSync(outFile, JSON.stringify({ id: BUILD_ID }) + '\n');
    },
  };
}

function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url || '';
        const accept = req.headers.accept || '';
        const isNavigation = accept.includes('text/html');
        // Only inspect the pathname for the "looks like a file" check —
        // query strings often contain dots (emails, file names, URLs)
        // that shouldn't disqualify the navigation from the SPA fallback.
        const pathname = url.split('?')[0];
        const looksLikeFile = pathname.includes('.');
        if (isNavigation && pathname.startsWith('/designer/') && !looksLikeFile) {
          req.url = '/designer/catalogue.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [spaFallback(), writeBuildIdJson(), react()],
  base: '/designer/',
  // Local dev proxy for the prototype HTML files. Production routes
  // mockups.hirahul.xyz/<path> through a Vercel edge function that
  // strips Supabase Storage's `text/plain` Content-Type + `nosniff`
  // header + CSP-sandbox header (see api/prototype-proxy.ts). Locally
  // there's no edge function, so the iframe rendering inside the
  // Prototypes tab would otherwise show as plain text. This proxy
  // mirrors the edge function so local previews render as HTML too.
  server: {
    proxy: {
      '/local-prototypes-proxy': {
        target: 'https://lpigdsgeqkhycvxsfpxe.supabase.co',
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/local-prototypes-proxy/, '/storage/v1/object/public/prototypes'),
        // selfHandleResponse lets us buffer the upstream body and
        // inject the branded loading overlay before forwarding — same
        // behavior as the production edge function (api/prototype-proxy.ts).
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const status = proxyRes.statusCode ?? 502;
              if (status >= 400) {
                res.writeHead(status, { 'content-type': 'text/plain' });
                res.end(Buffer.concat(chunks));
                return;
              }
              const html = Buffer.concat(chunks).toString('utf-8');
              const modified = injectOverlay(html);
              res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
              });
              res.end(modified);
            });
          });
        },
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  // Tegaki's font bundles use `import fontUrl from './foo.ttf' with { type: 'url' }`,
  // which Vite's pre-bundler (esbuild) doesn't emit alongside the JS — the
  // runtime fetch 404s. Excluding tegaki keeps font URLs resolving via Vite's
  // normal asset pipeline. But that also makes Vite miss the dynamic
  // `import('harfbuzzjs/hb.js')` inside tegaki's source — harfbuzzjs is plain
  // CJS (`module.exports = …`), so without pre-bundling the ESM default is
  // undefined and shaper-harfbuzz crashes with "hbMod.default is not a function".
  // Explicitly including the two harfbuzzjs subpaths forces Vite to pre-bundle
  // (CJS → ESM) those without re-pre-bundling tegaki itself.
  optimizeDeps: {
    exclude: ['tegaki'],
    include: ['harfbuzzjs/hb.js', 'harfbuzzjs/hbjs.js'],
  },
  build: {
    outDir: '../site/designer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        catalogue: path.resolve(__dirname, 'catalogue.html'),
      },
      output: {
        // Split the large, eager, rarely-changing vendor libs into their
        // own chunks so app-code deploys (frequent — the build-id toast
        // ships often) don't bust their cache. Deliberately NOT a blanket
        // `node_modules → vendor` rule: that would drag tegaki/harfbuzz
        // (used only by the lazy WelcomeModal chunk) into an eager vendor
        // bundle and undo that split. lucide-react is also left out — it's
        // tree-shaken per-icon across both eager and lazy chunks, so Rollup
        // dedupes it better on its own than a forced eager chunk would.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
