/**
 * Arranca y detiene el ciclo del torneo mientras el servidor sigue corriendo, para manejarlo desde la
 * web ("Iniciar escucha" / "Detener escucha") sin reiniciar `npm run bot`. Corre un solo ciclo a la
 * vez (invariante 7). La URL y el token viven solo en memoria mientras el ciclo corre: no se guardan
 * en disco ni se escriben en logs.
 */
import type { ControlStatus, Health } from '@equipo6/contracts';
import type { MoveChooser } from '../chooser/types.ts';
import type { Logger } from '../log.ts';
import { ArbiterClient } from './client.ts';
import { type LoopStats, runArbiterLoop } from './loop.ts';
import { ArbiterMonitor } from './monitor.ts';

export type LoopClient = Pick<ArbiterClient, 'next' | 'move'>;

export interface ControllerOptions {
  readonly chooser: MoveChooser;
  readonly log: Logger;
  readonly waitS: number;
  readonly think: { readonly softMs: number; readonly hardMs: number };
  /** Solo para pruebas: cliente del árbitro falso. */
  readonly makeClient?: (url: string, token: string) => LoopClient;
}

interface Run {
  readonly abort: AbortController;
  readonly done: Promise<LoopStats>;
  readonly host: string;
}

/** Valida la URL del árbitro: HTTPS, o HTTP solo para el mock en esta computadora. */
export function arbiterHost(raw: string): string | null {
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
    if (url.username || url.password) return null;
    return url.host;
  } catch {
    return null;
  }
}

export class TournamentController {
  readonly #options: ControllerOptions;
  #run: Run | null = null;
  #monitor = new ArbiterMonitor(false);

  constructor(options: ControllerOptions) {
    this.#options = options;
  }

  get running(): boolean {
    return this.#run !== null;
  }

  /** Arranca el ciclo; `false` si ya hay uno corriendo (un solo ciclo por servidor). */
  start(url: string, token: string): { ok: true } | { ok: false; reason: 'running' | 'url' } {
    if (this.#run) return { ok: false, reason: 'running' };
    const host = arbiterHost(url);
    if (!host) return { ok: false, reason: 'url' };
    const { chooser, log, waitS, think } = this.#options;
    const client =
      this.#options.makeClient?.(url, token) ?? new ArbiterClient({ baseUrl: url, token });
    const monitor = new ArbiterMonitor(true);
    const abort = new AbortController();
    this.#monitor = monitor;
    log('info', 'arranque', {
      arbitro: host,
      token: 'configurado',
      origen: 'control',
      wait_s: waitS,
    });
    const done = runArbiterLoop({
      client,
      chooser,
      log,
      signal: abort.signal,
      waitS,
      thinkSoftMs: think.softMs,
      thinkHardMs: think.hardMs,
      onEvent: monitor.onEvent,
    }).then((stats) => {
      log('info', 'detenido', { ...stats });
      if (this.#run?.abort === abort) this.#run = null;
      return stats;
    });
    this.#run = { abort, done, host };
    return { ok: true };
  }

  /** Detiene el ciclo y espera a que termine; `false` si no había ninguno. */
  async stop(): Promise<boolean> {
    const run = this.#run;
    if (!run) return false;
    run.abort.abort();
    await run.done;
    return true;
  }

  /** Para `GET /api/health`. */
  snapshot(): Health['arbiter'] {
    return this.#monitor.snapshot();
  }

  /** Para `GET /api/control`. */
  status(): ControlStatus {
    return {
      running: this.#run !== null,
      arbiterHost: this.#run?.host ?? null,
      arbiter: this.#monitor.snapshot(),
    };
  }
}
