import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
  plugins: [spaFallback(), react()],
  base: '/designer/',
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
    },
  },
});
