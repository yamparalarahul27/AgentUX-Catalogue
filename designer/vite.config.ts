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
