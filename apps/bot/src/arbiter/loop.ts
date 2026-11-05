/**
 * Ciclo del torneo (PLAN_BACKEND.md §5): long polling a `next`, jugar el turno y volver a preguntar.
 * Un solo ciclo por token (invariante 7) y siempre con pausa ante errores (invariante 8).
 */
import type { MoveChooser } from '../chooser/types.ts';
import type { Logger } from '../log.ts';
import type { LoopEvent } from './monitor.ts';
import { AUTH_STEPS_MS, NETWORK_STEPS_MS, createBackoff } from './backoff.ts';
import { ArbiterHttpError, type ArbiterClient } from './client.ts';
import { playTurn } from './play-turn.ts';
import { type NextResult, parseNext } from './schema.ts';

export interface LoopOptions {
  readonly client: Pick<ArbiterClient, 'next' | 'move'>;
  readonly chooser: MoveChooser;
  readonly log: Logger;
  readonly signal: AbortSignal;
  readonly waitS?: number;
  readonly thinkSoftMs?: number;
  readonly thinkHardMs?: number;
  /** Reloj monótono en ms. */
  readonly now?: () => number;
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /**
   * Hora (en el reloj `now`) a la que el ciclo deja de pedir turnos. Solo corta entre turnos: el long
   * polling se acorta para terminar antes de esta hora y un turno recibido siempre se juega. Lo usa
   * el cron de Vercel, que corre el ciclo por ventanas. Sin `until`, el ciclo sigue hasta `signal`.
   */
  readonly until?: number;
  /** Para `GET /api/health`: turnos, esperas, problemas y fin del ciclo. */
  readonly onEvent?: (event: LoopEvent) => void;
}

export interface LoopStats {
  turns: number;
  accepted: number;
  rejected: number;
  problems: number;
}

/** Si `next` responde `idle` antes de esto, el servidor no está reteniendo: pausa para no martillar. */
export const MIN_IDLE_INTERVAL_MS = 500;

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

export async function runArbiterLoop(options: LoopOptions): Promise<LoopStats> {
  const { client, log, signal } = options;
  const now = options.now ?? (() => performance.now());
  const pause = (ms: number) => (options.sleep ?? sleep)(ms, signal);
  const network = createBackoff(NETWORK_STEPS_MS);
  const auth = createBackoff(AUTH_STEPS_MS);
  const stats: LoopStats = { turns: 0, accepted: 0, rejected: 0, problems: 0 };
  const turnDeps = {
    client,
    chooser: options.chooser,
    log,
    signal,
    now,
    thinkSoftMs: options.thinkSoftMs ?? 1_400,
    thinkHardMs: options.thinkHardMs ?? 1_800,
  };

  const emit = options.onEvent ?? (() => undefined);
  const problem = async (event: string, delay: number, data: Record<string, unknown> = {}) => {
    stats.problems++;
    emit({ type: 'problem' });
    log('error', event, { ...data, pausa_ms: delay });
    await pause(delay);
  };

  const waitS = options.waitS ?? 20;
  /** Segundos de long polling que caben antes de `until`; `null` si ya no cabe ninguno. */
  const allowedWait = (): number | null => {
    if (options.until === undefined) return waitS;
    const left = Math.floor((options.until - now()) / 1000);
    return left >= 1 ? Math.min(waitS, left) : null;
  };

  while (!signal.aborted) {
    const wait = allowedWait();
    if (wait === null) break;
    const askedAt = now();
    let next: NextResult;
    try {
      next = parseNext(await client.next(wait, signal));
    } catch (error) {
      if (signal.aborted) break;
      const reason = error instanceof ArbiterHttpError ? error.reason : 'network';
      const backoff = reason === 'redirect' ? auth : network;
      await problem('next_fallo', backoff.next(), { reason, detalle: (error as Error).message });
      continue;
    }

    switch (next.kind) {
      case 'turn': {
        stats.turns++;
        const result = await playTurn(turnDeps, next.turn, now());
        emit({ type: 'turn', gameId: next.turn.gameId });
        if (result?.kind === 'accepted') {
          stats.accepted++;
          network.reset();
          auth.reset();
        } else if (result?.kind === 'rejected') stats.rejected++;
        else if (result?.kind === 'unauthorized') {
          await problem('token_invalido', auth.next(), { en: 'move' });
        } else if (result?.kind !== 'not_your_turn') {
          // Jugada sin confirmar (ya se registró en el log): pausa antes de volver a preguntar,
          // para no martillar al árbitro si el problema persiste.
          stats.problems++;
          await pause(network.next());
        }
        break;
      }
      case 'idle':
        network.reset();
        auth.reset();
        emit({ type: 'idle' });
        if (now() - askedAt < MIN_IDLE_INTERVAL_MS) await pause(MIN_IDLE_INTERVAL_MS);
        break;
      case 'unauthorized':
        await problem('token_invalido', auth.next(), { en: 'next' });
        break;
      case 'unexpected':
        await problem('next_respuesta_inesperada', auth.next(), {
          status: next.status,
          error: next.error,
        });
        break;
      case 'server_error':
        await problem('next_error_del_servidor', network.next(), { status: next.status });
        break;
      case 'invalid':
        await problem('next_respuesta_invalida', network.next(), { detalle: next.reason });
        break;
    }
  }
  emit({ type: 'stopped' });
  return stats;
}
