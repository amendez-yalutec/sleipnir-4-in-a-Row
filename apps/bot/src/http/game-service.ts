/**
 * Lógica de la API de la app, sin HTTP. Sin estado: el navegador manda la lista de jugadas y aquí se
 * valida con las reglas del motor (el frontend no implementa reglas, invariante 4).
 */
import type { BotInsight, GameState, Level } from '@equipo6/contracts';
import {
  type GameState as EngineState,
  IllegalMoveError,
  type Player,
  isWinningMove,
  legalMoves,
  play,
  replay,
} from '@equipo6/engine';
import { guardColumn } from '../arbiter/guard.ts';
import { fallbackMove } from '../chooser/fallback.ts';
import type { Budget, Choice, MoveChooser } from '../chooser/types.ts';
import { BusyError } from '../chooser/worker-chooser.ts';

/** Presupuestos por nivel (PLAN_BACKEND.md §7). Difícil = el mismo bot del torneo. */
export function levelBudget(level: Level, think: { softMs: number; hardMs: number }): Budget {
  if (level === 'easy') return { softMs: 100, hardMs: 150, maxDepth: 2 };
  if (level === 'medium') return { softMs: 150, hardMs: 150 };
  return think;
}

/** Probabilidad de que Fácil juegue al azar (entre las jugadas que no pierden de inmediato). */
export const EASY_RANDOM_RATE = 0.3;

export function toGameState(state: EngineState): GameState {
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

/** Azar con semilla derivada de las jugadas: misma posición, misma decisión (se puede probar). */
function seededRandom(moves: readonly number[]): () => number {
  let seed = 2166136261;
  for (const column of moves) seed = Math.imul(seed ^ (column + 1), 16777619);
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Jugadas tras las cuales el rival no puede ganar en la siguiente. */
export function safeMoves(state: EngineState): number[] {
  const rival: Player = state.toMove === 1 ? 2 : 1;
  const safe = state.legalMoves.filter((column) => {
    const next = play(state.board, column, state.toMove);
    return !legalMoves(next).some((reply) => isWinningMove(next, reply, rival));
  });
  return safe.length > 0 ? safe : [...state.legalMoves];
}

/** Fácil: el 30 % de las veces, una jugada al azar que no pierde de inmediato. */
export function easyRandomMove(state: EngineState): number | null {
  const random = seededRandom(state.moves);
  if (random() >= EASY_RANDOM_RATE) return null;
  const options = safeMoves(state);
  return options[Math.floor(random() * options.length)] ?? null;
}

export interface BotMoveDeps {
  readonly chooser: Pick<MoveChooser, 'choose'>;
  readonly think: { softMs: number; hardMs: number };
  readonly now: () => number;
}

/**
 * Juega el turno del bot y devuelve el estado nuevo con `bot`. Lanza `IllegalMoveError` si las
 * jugadas no son válidas o la partida ya terminó, y deja pasar `BusyError` (la API responde 429).
 * Si la búsqueda falla por otra causa, juega el respaldo (ganar en 1 → bloquear → centro).
 */
export async function botMove(
  moves: readonly number[],
  level: Level,
  deps: BotMoveDeps,
): Promise<GameState> {
  const state = replay(moves);
  if (state.status !== 'playing') throw new IllegalMoveError('game_over', -1, moves.length);
  const started = deps.now();
  const position = { board: state.board, toMove: state.toMove };

  let choice: Choice;
  const random = level === 'easy' ? easyRandomMove(state) : null;
  if (random === null) {
    try {
      choice = await deps.chooser.choose(
        position,
        state.legalMoves,
        levelBudget(level, deps.think),
      );
    } catch (error) {
      if (error instanceof BusyError) throw error;
      choice = { column: fallbackMove(position, state.legalMoves) ?? -1, depth: 0, nodes: 0 };
    }
  } else {
    choice = { column: random, depth: 0, nodes: 0, score: 0 };
  }

  // Hay al menos una jugada legal porque la partida sigue: la guardia siempre devuelve columna.
  const column = guardColumn(choice.column, state.legalMoves).column as number;
  const bot: BotInsight = {
    column,
    depth: choice.depth ?? 0,
    nodes: choice.nodes ?? 0,
    ms: Math.max(0, Math.round(deps.now() - started)),
    score: Math.round(choice.score ?? 0),
    level,
  };
  return { ...toGameState(replay([...moves, column])), bot };
}
