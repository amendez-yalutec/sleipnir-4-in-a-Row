import { describe, expect, it } from 'vitest';
import {
  CELLS,
  CENTER_ORDER,
  COLUMNS,
  DIRECTION_STEPS,
  ROWS,
  WINNING_WINDOWS,
  isInside,
  type Direction,
} from './geometry.ts';

const windowsIn = (direction: Direction) =>
  WINNING_WINDOWS.filter((window) => window.direction === direction);

describe('tablero 8×7', () => {
  it('tiene 8 columnas, 7 filas y 56 casillas', () => {
    expect(COLUMNS).toBe(8);
    expect(ROWS).toBe(7);
    expect(CELLS).toBe(56);
  });

  it('isInside acepta solo casillas del tablero', () => {
    expect(isInside(0, 0)).toBe(true);
    expect(isInside(6, 7)).toBe(true);
    expect(isInside(-1, 0)).toBe(false);
    expect(isInside(7, 0)).toBe(false);
    expect(isInside(0, 8)).toBe(false);
    expect(isInside(0, -1)).toBe(false);
    expect(isInside(1.5, 2)).toBe(false);
  });
});

describe('ventanas de cuatro', () => {
  it('son 107: 35 horizontales, 32 verticales y 20 en cada diagonal', () => {
    expect(WINNING_WINDOWS).toHaveLength(107);
    expect(windowsIn('horizontal')).toHaveLength(35);
    expect(windowsIn('vertical')).toHaveLength(32);
    expect(windowsIn('diagonal-up')).toHaveLength(20);
    expect(windowsIn('diagonal-down')).toHaveLength(20);
  });

  it('cada ventana son 4 casillas consecutivas, dentro del tablero, en su dirección', () => {
    for (const { direction, cells } of WINNING_WINDOWS) {
      const [rowStep, columnStep] = DIRECTION_STEPS[direction];
      expect(cells).toHaveLength(4);
      cells.forEach((cell, i) => {
        expect(isInside(cell.row, cell.column)).toBe(true);
        expect(cell.row).toBe(cells[0].row + rowStep * i);
        expect(cell.column).toBe(cells[0].column + columnStep * i);
      });
    }
  });

  it('no hay ventanas repetidas', () => {
    const keys = WINNING_WINDOWS.map(({ cells }) =>
      cells.map((cell) => `${cell.row},${cell.column}`).join('|'),
    );
    expect(new Set(keys).size).toBe(WINNING_WINDOWS.length);
  });

  it('en una fila, las columnas del centro están en 4 ventanas horizontales y los bordes en 1', () => {
    const horizontalsInRow0 = windowsIn('horizontal').filter(({ cells }) => cells[0].row === 0);
    const countFor = (column: number) =>
      horizontalsInRow0.filter(({ cells }) => cells.some((cell) => cell.column === column)).length;

    expect([0, 1, 2, 3, 4, 5, 6, 7].map(countFor)).toEqual([1, 2, 3, 4, 4, 3, 2, 1]);
  });
});

describe('orden de columnas para la búsqueda', () => {
  it('va del centro hacia los bordes: 3, 4, 2, 5, 1, 6, 0, 7', () => {
    expect(CENTER_ORDER).toEqual([3, 4, 2, 5, 1, 6, 0, 7]);
  });
});
