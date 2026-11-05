import { replay } from '@equipo6/engine';
import { describe, expect, it } from 'vitest';
import { bookMove } from './book.ts';

const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
const at = (moves: number[]) => {
  const state = replay(moves);
  return { board: state.board, toMove: state.toMove };
};
/** Las 17 jugadas de `g_f7ea9774` antes de nuestra jugada 18 (perdida contra Odd Times). */
const ODD_TIMES = [3, 3, 3, 3, 3, 4, 4, 4, 4, 6, 7, 1, 4, 4, 3, 1, 4];

describe('libro de posiciones conocidas', () => {
  it('en la línea de Odd Times juega la victoria demostrada y no la derrota', () => {
    expect(bookMove(at(ODD_TIMES), ALL)).toBe(1);
  });

  it('vale en espejo (las partidas g_5dc8ef68 y g_e572f8e2)', () => {
    expect(bookMove(at(ODD_TIMES.map((c) => 7 - c)), ALL)).toBe(6);
  });

  it('fuera del libro, o si la jugada no es legal, no decide', () => {
    expect(bookMove(at([3, 3]), ALL)).toBeNull();
    expect(bookMove(at(ODD_TIMES), [0, 7])).toBeNull();
  });
});
