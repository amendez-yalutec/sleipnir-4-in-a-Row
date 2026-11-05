import type { Position } from '@equipo6/engine';

/** Presupuesto de búsqueda en ms, medido desde que se recibe el turno (PLAN_BACKEND.md §4.4). */
export interface Budget {
  readonly softMs: number;
  readonly hardMs: number;
  /** Tope de profundidad (nivel Fácil de la app). */
  readonly maxDepth?: number;
}

export interface Choice {
  readonly column: number;
  readonly depth?: number;
  readonly nodes?: number;
  readonly score?: number;
}

/** Quien elige la jugada: en B4 la de respaldo; desde B6/B8 la búsqueda en un worker. */
export interface MoveChooser {
  choose(position: Position, legalMoves: readonly number[], budget: Budget): Promise<Choice>;
}
