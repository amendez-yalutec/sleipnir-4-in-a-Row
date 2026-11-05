/**
 * Propiedades de la búsqueda (PLAN_BACKEND.md §9):
 * - en 1,000 posiciones al azar la jugada siempre es legal;
 * - alfa-beta (con y sin tabla) da el mismo valor que un minimax sin poda a profundidad ≤ 4. El
 *   minimax de referencia está escrito aparte, sobre `rules.ts` y no sobre el bitboard.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Bitboard } from './bitboard.ts';
import { evaluate } from './eval.ts';
import {
  type Board,
  type Player,
  type Position,
  emptyBoard,
  isFull,
  isWinningMove,
  legalMoves,
  play,
  winner,
} from './rules.ts';
import { WIN, negamaxValue, search } from './search.ts';

// En GitHub Actions la comparación contra minimax tarda ~55 s; 60 s no dejaba margen.
const SLOW_CI_TIMEOUT_MS = 180_000;

/** Posición al azar de una partida en curso. */
const position = fc
  .tuple(fc.array(fc.nat(), { minLength: 56, maxLength: 56 }), fc.nat({ max: 50 }))
  .map(([picks, length]): Position | null => {
    let board: Board = emptyBoard();
    let toMove: Player = 1;
    for (const pick of picks.slice(0, length)) {
      const legal = legalMoves(board);
      const column = legal[pick % legal.length];
      board = play(board, column, toMove);
      toMove = toMove === 1 ? 2 : 1;
      if (winner(board) !== null || isFull(board)) return null;
    }
    return { board, toMove };
  })
  .filter((p): p is Position => p !== null);

/** Minimax sin poda con las mismas reglas por nodo que negamax, escrito sobre rules.ts. */
function minimax(board: Board, toMove: Player, depth: number, ply: number): number {
  if (isFull(board)) return 0;
  const rival: Player = toMove === 1 ? 2 : 1;
  const legal = legalMoves(board);
  if (legal.some((column) => isWinningMove(board, column, toMove))) return WIN - ply - 1;

  const forced = legal.filter((column) => isWinningMove(board, column, rival));
  if (forced.length > 1) return -(WIN - ply - 2);
  const candidates = (forced.length === 1 ? forced : legal).filter((column) => {
    const next = play(board, column, toMove);
    return !(legalMoves(next).includes(column) && isWinningMove(next, column, rival));
  });
  if (candidates.length === 0) return -(WIN - ply - 2);
  if (depth === 0) return evaluate(Bitboard.fromBoard(board, toMove));

  return Math.max(
    ...candidates.map((column) => -minimax(play(board, column, toMove), rival, depth - 1, ply + 1)),
  );
}

describe('propiedades de la búsqueda', () => {
  it(
    'en 1,000 posiciones al azar la jugada siempre es legal',
    () => {
      fc.assert(
        fc.property(position, fc.integer({ min: 1, max: 5 }), (p, depth) => {
          expect(legalMoves(p.board)).toContain(search(p, { maxDepth: depth }).column);
        }),
        { numRuns: 1_000 },
      );
    },
    SLOW_CI_TIMEOUT_MS,
  );

  it(
    'alfa-beta = minimax sin poda, a profundidad 1 a 4, con y sin tabla',
    () => {
      fc.assert(
        fc.property(position, fc.integer({ min: 1, max: 4 }), (p, depth) => {
          const reference = minimax(p.board, p.toMove, depth, 0);
          expect(negamaxValue(p, depth, false)).toBe(reference);
          expect(negamaxValue(p, depth, true)).toBe(reference);
        }),
        { numRuns: 300 },
      );
    },
    SLOW_CI_TIMEOUT_MS,
  );
});
