/**
 * Pruebas E2E con Playwright (paso Q3 de PLAN_CALIDAD_SEGURIDAD.md). Dos modos:
 * - `npm run test:e2e`: automático, sin ventana, rápido (el del CI).
 * - `npm run test:e2e:demo`: navegador visible, más lento y con pausas entre pasos para verlo.
 * Cada corrida guarda capturas, reporte y videos en evidencias/e2e/<día>/<hora>_<modo>/.
 */
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { currentRun } from './e2e/run.ts';

const run = currentRun();
const demo = run.mode === 'demora';
const PORT = Number(process.env.E2E_PORT ?? 8181);

export default defineConfig({
  testDir: 'e2e',
  outputDir: join(run.dir, 'resultados'),
  fullyParallel: false,
  // Pocas a la vez: cada partida pide jugadas al mismo servidor y el modo demora se mira de a una.
  workers: demo ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: demo ? 15 * 60_000 : 90_000,
  expect: { timeout: demo ? 20_000 : 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: join(run.dir, 'reporte'), open: 'never' }],
    ['./e2e/reporter-evidencias.ts'],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: !demo,
    launchOptions: { slowMo: demo ? 300 : 0 },
    // En automático, sin animaciones: capturas estables. En demora se ven las fichas caer.
    contextOptions: { reducedMotion: demo ? 'no-preference' : 'reduce' },
    locale: 'es-GT',
    trace: 'retain-on-failure',
    video: demo ? 'on' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // La app tal como se sirve en la demo: build de la web + API, sin torneo y con la CSP real.
    command: 'npm run build && node apps/bot/src/main.ts',
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: {
      ARBITRO_ENABLED: 'false',
      HOST: '127.0.0.1',
      PORT: String(PORT),
      RATE_LIMIT_PER_MIN: '10000',
      BOT_MOVE_PER_MIN: '10000',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
  },
});
