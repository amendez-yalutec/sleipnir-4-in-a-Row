/**
 * Propiedades de las reglas sobre cientos de partidas al azar (fast-check). El detector de victoria se
 * compara contra un oráculo ingenuo escrito aparte, que recorre casilla por casilla sin usar las
 * ventanas precalculadas de geometry.ts.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Board,
  type Player,
  IllegalMoveError,
  emptyBoard,
  legalMoves,
  play,
  replay,
  winner,
} from './rules.ts';

const RUNS = 500;

function naiveWinner(board: Board): Player | null {
  const at = (row: number, column: number) => board[row]?.[column];
  const steps = [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1],
  ] as const;
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 8; column++) {
      const owner = at(row, column);
      if (owner !== 1 && owner !== 2) continue;
      for (const [dr, dc] of steps) {
        let length = 1;
        while (length < 4 && at(row + dr * length, column + dc * length) === owner) length++;
        if (length === 4) return owner;
      }
    }
  }
  return null;
}

function hasGravity(board: Board): boolean {
  for (let column = 0; column < 8; column++) {
    let seenEmpty = false;
    for (let row = 0; row < 7; row++) {
      if (board[row]?.[column] === 0) seenEmpty = true;
      else if (seenEmpty) return false;
    }
  }
  return true;
}

/** Partida legal al azar: en cada turno elige una de las jugadas legales. */
// 56 elecciones: la partida se juega hasta que alguien gana o se llena el tablero.
const legalGame = fc.array(fc.nat(), { minLength: 56, maxLength: 56 }).map((choices) => {
  const moves: number[] = [];
  let board: Board = emptyBoard();
  for (const choice of choices) {
    const legal = legalMoves(board);
    if (legal.length === 0 || winner(board) !== null) break;
    const column = legal[choice % legal.length];
    board = play(board, column, moves.length % 2 === 0 ? 1 : 2);
    moves.push(column);
  }
  return moves;
});

describe('propiedades de las reglas', () => {
  it('en cada paso de una partida al azar el estado es coherente', () => {
    fc.assert(
      fc.property(legalGame, (moves) => {
        for (let n = 0; n <= moves.length; n++) {
          const state = replay(moves.slice(0, n));
          const pieces = state.board.flat().filter((cell) => cell !== 0).length;

          expect(pieces).toBe(n);
          expect(hasGravity(state.board)).toBe(true);
          expect(state.winner).toBe(naiveWinner(state.board));
          expect(winner(state.board)).toBe(state.winner);
          if (state.status === 'playing') {
            expect(state.legalMoves).toEqual(legalMoves(state.board));
            expect(state.toMove).toBe(n % 2 === 0 ? 1 : 2);
          } else {
            expect(state.legalMoves).toEqual([]);
          }
          // Solo puede terminar la última jugada de la lista.
          if (n < moves.length) expect(state.status).toBe('playing');
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('replay acepta la lista hasta la primera jugada ilegal y señala exactamente esa', () => {
    const anyColumns = fc.array(fc.integer({ min: -1, max: 8 }), { maxLength: 70, size: 'max' });
    fc.assert(
      fc.property(anyColumns, (moves) => {
        try {
          const state = replay(moves);
          expect(state.moves).toEqual(moves);
        } catch (error) {
          expect(error).toBeInstanceOf(IllegalMoveError);
          const { index } = error as IllegalMoveError;
          expect(index).toBeDefined();
          expect(() => replay(moves.slice(0, index))).not.toThrow();
        }
      }),
      { numRuns: RUNS },
    );
  });
});
