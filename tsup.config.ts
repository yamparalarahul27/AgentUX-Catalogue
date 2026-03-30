import { defineConfig } from 'tsup';

export default defineConfig([
  // Browser component entry (no Babel, no Node fs)
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom'],
    treeshake: true,
    onSuccess: 'node scripts/patch-browser-entry.mjs',
  },
  // Node.js analysis entry (includes Babel for AST parsing)
  {
    entry: ['src/analysis/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    outDir: 'dist/analysis',
    platform: 'node',
    external: ['react', 'react-dom'],
  },
  // Node.js CLI entry for project setup
  {
    entry: {
      cli: 'src/cli/index.ts',
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    platform: 'node',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
