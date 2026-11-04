import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Cada carpeta de packages/, apps/ y tools/ es un proyecto de pruebas.
    projects: ['packages/*', 'apps/*', 'tools/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}', 'tools/*/src/**/*.ts'],
      // search-worker.ts corre en otro hilo (sin instrumentar); se prueba vía worker-chooser.test.ts.
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/cli.ts',
        '**/main.ts',
        '**/main.tsx',
        '**/search-worker.ts',
        '**/test-setup.ts',
        '**/vite-env.d.ts',
      ],
      thresholds: {
        // Las bases piden ≥ 70 % en reglas y algoritmo; nos exigimos 90 %.
        'packages/engine/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        // Criterio de listo de B2: las reglas son la referencia de todo lo demás.
        // Criterio de listo de F3: la tabla de estados de PLAN_FRONTEND.md §6, completa.
        'apps/web/src/game/reducer.ts': {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 100,
        },
        'packages/engine/src/rules.ts': {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 100,
        },
      },
    },
  },
});
