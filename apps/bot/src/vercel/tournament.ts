/**
 * El bot del torneo en Vercel. Vercel no mantiene procesos vivos, así que un cron lo despierta cada
 * minuto y esta función corre el mismo ciclo del bot (`runArbiterLoop`) durante una ventana de
 * ~50 s. El ciclo solo se corta entre turnos (`until`): nunca deja un turno servido sin jugar. Entre
 * ventanas quedan unos segundos sin nadie preguntando, muy por debajo de los 30 s de ausencia.
 *
 * Seguridad: solo corre si la llamada trae `CRON_SECRET` (Vercel lo manda en sus crons) y si
 * `ARBITRO_ENABLED=true`. El token sale de `TEAM_TOKEN` y nunca se escribe en logs ni respuestas.
 * Invariante 7: un solo ciclo por token, así que si el bot corre aquí, la laptop va con
 * `ARBITRO_ENABLED=false` (y al revés).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ArbiterClient } from '../arbiter/client.ts';
import { type LoopStats, runArbiterLoop } from '../arbiter/loop.ts';
import { createSearchChooser } from '../chooser/search.ts';
import type { MoveChooser } from '../chooser/types.ts';
import { type Logger, createJsonLogger } from '../log.ts';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Ventana de juego por invocación. Con el cron cada 60 s quedan ~7-10 s sin preguntar (50 s más un
 * último turno de hasta ~3 s): un turno que aparece ahí espera a la siguiente ventana, lejos de los
 * 30 s de ausencia aunque el cron se atrase unos segundos. La función tiene `maxDuration` de 60 s.
 */
export const WINDOW_MS = 50_000;

export type WindowResult =
  | { readonly ran: false; readonly reason: string }
  | { readonly ran: true; readonly stats: LoopStats; readonly ms: number };

export interface WindowDeps {
  readonly client?: Pick<ArbiterClient, 'next' | 'move'>;
  readonly chooser?: MoveChooser;
  readonly log?: Logger;
  readonly now?: () => number;
  readonly windowMs?: number;
}

const positiveInt = (env: Env, name: string, fallback: number) => {
  const value = Number(env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

/** Corre una ventana del ciclo del torneo si la configuración lo permite. */
export async function runTournamentWindow(env: Env, deps: WindowDeps = {}): Promise<WindowResult> {
  if (env.ARBITRO_ENABLED !== 'true') return { ran: false, reason: 'ARBITRO_ENABLED no es true' };
  const url = env.ARBITRO_URL?.trim();
  const token = env.TEAM_TOKEN?.trim();
  if (!url || !token) return { ran: false, reason: 'faltan ARBITRO_URL o TEAM_TOKEN' };

  const now = deps.now ?? (() => performance.now());
  const log = deps.log ?? createJsonLogger();
  const started = now();
  const client = deps.client ?? new ArbiterClient({ baseUrl: url, token });
  log('info', 'ventana_inicio', { arbitro: new URL(url).host, token: 'configurado' });
  const stats = await runArbiterLoop({
    client,
    chooser: deps.chooser ?? createSearchChooser(),
    log,
    signal: new AbortController().signal,
    now,
    waitS: positiveInt(env, 'LONGPOLL_WAIT_S', 20),
    thinkSoftMs: positiveInt(env, 'THINK_SOFT_MS', 1400),
    thinkHardMs: positiveInt(env, 'THINK_HARD_MS', 1800),
    until: started + (deps.windowMs ?? WINDOW_MS),
  });
  const ms = Math.round(now() - started);
  log('info', 'ventana_fin', { ...stats, ms });
  return { ran: true, stats, ms };
}

/** Compara sin filtrar por tiempo cuántos caracteres coinciden. */
function sameSecret(given: string, expected: string): boolean {
  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.max(given.length, expected.length); i++) {
    diff |= (given.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Punto de entrada del cron (`/api/cron/torneo`). */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const secret = process.env.CRON_SECRET?.trim();
  const header = req.headers.authorization ?? '';
  if (!secret || !header.startsWith('Bearer ') || !sameSecret(header.slice(7), secret)) {
    send(401, { error: 'unauthorized', message: 'Solo el cron de Vercel puede correr el bot.' });
    return;
  }
  send(200, await runTournamentWindow(process.env));
}
