/**
 * Cliente falso con la misma interfaz que el real (PLAN_FRONTEND.md §5): usa las reglas reales de
 * `packages/engine` y una búsqueda corta y determinista. Sirve para probar la pantalla sin servidor.
 * No entra al build de producción: solo lo importan las pruebas.
 */
import type { ControlStatus, GameState, Health } from '@equipo6/contracts';
import { IllegalMoveError, replay, search } from '@equipo6/engine';
import type { ApiClient, ApiResult } from './types.ts';

function toState(moves: readonly number[]): GameState {
  const state = replay(moves);
  return {
    moves: [...state.moves],
    board: state.board.map((row) => [...row]),
    toMove: state.toMove,
    legalMoves: [...state.legalMoves],
    status: state.status,
    winner: state.winner,
    winningCells: state.winningCells.map(({ row, column }): [number, number] => [row, column]),
  };
}

export interface FakeClient extends ApiClient {
  /** La próxima llamada falla como si se cayera la red. */
  failNext(): void;
  readonly calls: string[];
}

export function createFakeClient(options: { depth?: number; control?: boolean } = {}): FakeClient {
  let fail = false;
  // Bot del torneo simulado: solo existe si `control` (como el servidor de la laptop).
  let listening: { host: string } | null = null;
  const controlStatus = (): ControlStatus => ({
    running: listening !== null,
    arbiterHost: listening?.host ?? null,
    arbiter: {
      enabled: listening !== null,
      state: listening ? 'waiting' : 'disabled',
      lastTurnAt: null,
      gamesPlayed: 0,
    },
  });
  const noControl = <T>(): ApiResult<T> => ({
    ok: false,
    kind: 'failed',
    code: 'not_found',
    message: 'El servidor no reconoce esa petición.',
  });
  const calls: string[] = [];
  const failure = <T>(): ApiResult<T> | null => {
    if (!fail) return null;
    fail = false;
    return { ok: false, kind: 'failed', message: 'No hay conexión con el bot.' };
  };

  return {
    calls,
    failNext: () => {
      fail = true;
    },
    state(moves) {
      calls.push(`state ${moves.join(',')}`);
      const failed = failure<GameState>();
      if (failed) return Promise.resolve(failed);
      try {
        return Promise.resolve({ ok: true, data: toState(moves) });
      } catch (error) {
        if (!(error instanceof IllegalMoveError)) throw error;
        return Promise.resolve({
          ok: false,
          kind: 'rejected',
          code: 'illegal_move',
          message: 'Esa jugada no se puede hacer.',
        });
      }
    },
    botMove(moves, level) {
      calls.push(`bot ${moves.join(',')} ${level}`);
      const failed = failure<GameState>();
      if (failed) return Promise.resolve(failed);
      const before = replay(moves);
      const result = search(
        { board: before.board, toMove: before.toMove },
        { maxDepth: options.depth ?? 3 },
      );
      const bot = {
        column: result.column,
        depth: result.depth,
        nodes: result.nodes,
        ms: 12,
        score: result.score,
        level,
      };
      return Promise.resolve({ ok: true, data: { ...toState([...moves, result.column]), bot } });
    },
    health() {
      const health: Health = {
        ok: true,
        version: 'fake',
        arbiter: { enabled: false, state: 'disabled', lastTurnAt: null, gamesPlayed: 0 },
      };
      return Promise.resolve({ ok: true, data: health });
    },
    control() {
      return Promise.resolve(options.control ? { ok: true, data: controlStatus() } : noControl());
    },
    startListening(url) {
      calls.push(`start ${url}`);
      if (!options.control) return Promise.resolve(noControl());
      listening = { host: new URL(url).host };
      return Promise.resolve({ ok: true, data: controlStatus() });
    },
    stopListening() {
      calls.push('stop');
      if (!options.control) return Promise.resolve(noControl());
      listening = null;
      return Promise.resolve({ ok: true, data: controlStatus() });
    },
  };
}
