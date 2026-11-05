/** Estado del ciclo del torneo para `GET /api/health`, a partir de los eventos del ciclo. */
import type { Health } from '@equipo6/contracts';

export type LoopEvent =
  | { readonly type: 'turn'; readonly gameId: string }
  | { readonly type: 'idle' }
  | { readonly type: 'problem' }
  | { readonly type: 'stopped' };

export class ArbiterMonitor {
  readonly #enabled: boolean;
  readonly #now: () => Date;
  readonly #games = new Set<string>();
  #state: Health['arbiter']['state'];
  #lastTurnAt: string | null = null;

  constructor(enabled: boolean, now: () => Date = () => new Date()) {
    this.#enabled = enabled;
    this.#now = now;
    this.#state = enabled ? 'starting' : 'disabled';
  }

  readonly onEvent = (event: LoopEvent): void => {
    if (event.type === 'turn') {
      this.#games.add(event.gameId);
      this.#lastTurnAt = this.#now().toISOString();
      this.#state = 'playing';
    } else if (event.type === 'idle') this.#state = 'waiting';
    else if (event.type === 'problem') this.#state = 'error';
    else this.#state = 'stopped';
  };

  snapshot(): Health['arbiter'] {
    return {
      enabled: this.#enabled,
      state: this.#state,
      lastTurnAt: this.#lastTurnAt,
      gamesPlayed: this.#games.size,
    };
  }
}
