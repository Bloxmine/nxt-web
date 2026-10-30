import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Browser globals that core packages must not touch (see CLAUDE.md, dependency rules).
const browserOnlyGlobals = ['window', 'document', 'navigator', 'indexedDB', 'localStorage'].map(
  (name) => ({
    name,
    message: 'Core packages must stay free of DOM and browser APIs. Use apps/web instead.',
  }),
);

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Pure core packages. nxt-transport is excluded: its WebUSB and Web Serial
    // implementations are the one place outside apps/web allowed to use browser APIs.
    files: ['packages/!(nxt-transport)/**/*.ts'],
    languageOptions: { globals: globals.es2022 },
    rules: { 'no-restricted-globals': ['error', ...browserOnlyGlobals] },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.{js,mjs}', '**/vite.config.ts', '**/vitest.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
