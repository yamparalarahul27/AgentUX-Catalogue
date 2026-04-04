import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url || '';
        if (url.startsWith('/designer/catalogue')) {
          req.url = '/designer/catalogue.html';
        } else if (url.startsWith('/designer/cd') || url.startsWith('/cd')) {
          req.url = '/designer/cd.html';
        } else if (url.startsWith('/designer/project/')) {
          req.url = '/designer/index.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [spaFallback(), react()],
  base: '/designer/',
  build: {
    outDir: '../site/designer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        catalogue: path.resolve(__dirname, 'catalogue.html'),
        cd: path.resolve(__dirname, 'cd.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../src'),
    },
  },
});
