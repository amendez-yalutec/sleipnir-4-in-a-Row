// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const PURE_ENGINE =
  'packages/engine es puro: sin red, sin fs, sin procesos (AGENTS.md, invariante 1).';
const INJECTED =
  'En el motor, el reloj y el azar se inyectan para poder probar (AGENTS.md, invariante 1).';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    'spec/',
    'evidencias/',
    'playwright-report/',
    'test-results/',
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Web: hooks de React, globals del navegador y nada de HTML crudo (AGENTS.md, invariante 9).
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'Prohibido: los datos del árbitro son texto no confiable (AGENTS.md, invariante 9).',
        },
      ],
    },
  },

  // El motor no toca red, disco, procesos, reloj ni azar globales.
  {
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'fs/*',
                'http',
                'https',
                'net',
                'child_process',
                'worker_threads',
              ],
              message: PURE_ENGINE,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: PURE_ENGINE },
        { name: 'fetch', message: PURE_ENGINE },
        { name: 'setTimeout', message: INJECTED },
        { name: 'setInterval', message: INJECTED },
        { name: 'performance', message: INJECTED },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: INJECTED },
        { object: 'Date', property: 'now', message: INJECTED },
      ],
    },
  },

  prettier,
]);
