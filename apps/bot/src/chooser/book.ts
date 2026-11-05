/**
 * Libro de posiciones conocidas: jugadas que el motor no encuentra con el tiempo del torneo pero que
 * el análisis con más tiempo demostró. Cada entrada vale también en espejo (columna c ↔ 7 − c).
 *
 * - 5 nov.: Odd Times nos ganó tres amistosos con la misma línea (`g_f7ea9774` y sus espejos
 *   `g_5dc8ef68`, `g_e572f8e2`). En la jugada 18 el motor elegía la columna 3 (índice 0–7), una
 *   derrota demostrada a 29 jugadas; las columnas 0, 1 y 7 son victoria demostrada a 34 jugadas
 *   (análisis con 9 s por jugada). El libro juega la 1.
 */
import { type Position, replay } from '@equipo6/engine';

interface Entry {
  /** Jugadas desde el tablero vacío (columnas 0–7). */
  readonly moves: readonly number[];
  readonly play: number;
}

const ENTRIES: readonly Entry[] = [
  { moves: [3, 3, 3, 3, 3, 4, 4, 4, 4, 6, 7, 1, 4, 4, 3, 1, 4], play: 1 },
];

const COLUMNS = 8;

function keyOf(board: readonly (readonly number[])[], toMove: number): string {
  return `${toMove}:${board.map((row) => row.join('')).join('/')}`;
}

function build(): Map<string, number> {
  const book = new Map<string, number>();
  for (const entry of ENTRIES) {
    const state = replay(entry.moves);
    book.set(keyOf(state.board, state.toMove), entry.play);
    const mirrored = state.board.map((row) => [...row].reverse());
    book.set(keyOf(mirrored, state.toMove), COLUMNS - 1 - entry.play);
  }
  return book;
}

const BOOK = build();

/** La jugada del libro para esta posición, si existe y es legal; si no, `null`. */
export function bookMove(position: Position, legalMoves: readonly number[]): number | null {
  const column = BOOK.get(keyOf(position.board, position.toMove));
  return column !== undefined && legalMoves.includes(column) ? column : null;
}
