// Minimal ESLint config — scoped to catching the bug class that took
// down production via PR #222/#223: Rules-of-Hooks violations. Any rule
// not pinned to that goal is intentionally OFF for now to keep this
// setup PR small + noise-free. Add more rules in follow-up PRs as the
// team chooses what's worth enforcing.

import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // The rule that would have caught PR #223's regression: hooks must
      // be called in the same order every render — i.e. before any
      // conditional early return.
      'react-hooks/rules-of-hooks': 'error',
      // Sibling rule: hook dependency arrays must list everything the
      // closure reads. Kept as `warn` (not `error`) so the existing
      // codebase doesn't fail the gate; we can tighten to `error` once
      // the existing warnings are triaged in a follow-up.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/assets/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
];
