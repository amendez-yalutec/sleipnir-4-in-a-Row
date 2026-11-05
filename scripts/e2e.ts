/**
 * `npm run test:e2e` (automático) y `npm run test:e2e:demo` (con pausas, navegador visible).
 * Fija el modo y la carpeta de evidencias de la corrida y lanza Playwright. Funciona igual en
 * macOS, Linux y Windows. Argumentos extra pasan a Playwright, p. ej. `-- --project=escritorio`.
 */
import { spawn } from 'node:child_process';
import { currentRun } from '../e2e/run.ts';

const [mode = 'automatico', ...extra] = process.argv.slice(2);
process.env.E2E_MODE = mode === 'demora' ? 'demora' : 'automatico';
const run = currentRun();
console.log(`Corrida ${run.id} → ${run.dir}`);
if (run.mode === 'demora') {
  console.log(`Modo demora: navegador visible y ${run.delayMs} ms entre pasos (E2E_DELAY_MS).`);
}

const child = spawn('npx', ['playwright', 'test', ...extra], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
