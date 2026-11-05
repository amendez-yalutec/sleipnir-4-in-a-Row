import { type Position, replay } from '@equipo6/engine';
import { describe, expect, it } from 'vitest';
import { fallbackChooser, fallbackMove } from './fallback.ts';

const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
const at = (moves: number[]): Position => {
  const state = replay(moves);
  return { board: state.board, toMove: state.toMove };
};

describe('jugada de respaldo', () => {
  it('gana en 1 si puede', () => {
    expect(fallbackMove(at([0, 0, 1, 1, 2, 2]), ALL)).toBe(3);
  });

  it('si no gana, bloquea el cuatro inmediato del rival', () => {
    expect(fallbackMove(at([0, 6, 1, 6, 2]), ALL)).toBe(3);
  });

  it('prefiere ganar a bloquear', () => {
    expect(fallbackMove(at([0, 7, 1, 7, 2, 7]), ALL)).toBe(3);
  });

  it('si no hay nada urgente, la más central de legal_moves', () => {
    expect(fallbackMove(at([]), ALL)).toBe(3);
    expect(fallbackMove(at([]), [0, 6])).toBe(6);
  });

  it('ignora columnas que legal_moves dice libres pero el tablero tiene llenas', () => {
    const full = at([3, 3, 3, 3, 3, 3, 3]);
    expect(fallbackMove(full, [3, 7])).toBe(3); // la más central según legal_moves; no rompe
  });

  it('el chooser de respaldo responde la misma jugada y falla sin jugadas legales', async () => {
    const budget = { softMs: 10, hardMs: 20 };
    await expect(fallbackChooser.choose(at([0, 0, 1, 1, 2, 2]), ALL, budget)).resolves.toEqual({
      column: 3,
    });
    await expect(fallbackChooser.choose(at([]), [], budget)).rejects.toThrow();
  });
});
