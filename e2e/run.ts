/**
 * Identidad de una corrida E2E: modo y carpeta de evidencias, ordenada por día y hora:
 *   evidencias/e2e/2026-11-04/21-45-12_automatico/
 * Se calcula una sola vez y viaja por variables de entorno, para que el proceso principal y los
 * workers de Playwright escriban en la misma carpeta.
 */
import { join } from 'node:path';

export type E2eMode = 'automatico' | 'demora';

export interface E2eRun {
  readonly mode: E2eMode;
  readonly id: string;
  readonly dir: string;
  /** Pausa entre pasos en modo demora (ms). */
  readonly delayMs: number;
}

export const EVIDENCE_ROOT = join('evidencias', 'e2e');

const pad = (n: number) => String(n).padStart(2, '0');

export function runId(now: Date, mode: E2eMode): { day: string; id: string } {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return { day, id: `${day}_${time}_${mode}` };
}

/** Lee la corrida de las variables de entorno o crea una nueva (y la deja en el entorno). */
export function currentRun(env: NodeJS.ProcessEnv = process.env, now = new Date()): E2eRun {
  const mode: E2eMode = env.E2E_MODE === 'demora' ? 'demora' : 'automatico';
  if (!env.E2E_RUN_DIR || !env.E2E_RUN_ID) {
    const { day, id } = runId(now, mode);
    env.E2E_RUN_ID = id;
    env.E2E_RUN_DIR = join(EVIDENCE_ROOT, day, id.slice(day.length + 1));
  }
  env.E2E_MODE = mode;
  const delayMs = Number(env.E2E_DELAY_MS ?? (mode === 'demora' ? 1500 : 0));
  return { mode, id: env.E2E_RUN_ID, dir: env.E2E_RUN_DIR, delayMs };
}
