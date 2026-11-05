/**
 * Geometría del tablero 8×7, con la misma convención del árbitro:
 * `board[fila][columna]`, fila 0 abajo, columnas 0 a 7.
 */

export const COLUMNS = 8;
export const ROWS = 7;
export const CELLS = COLUMNS * ROWS;
export const WIN_LENGTH = 4;

export type Direction = 'horizontal' | 'vertical' | 'diagonal-up' | 'diagonal-down';

export interface CellPosition {
  readonly row: number;
  readonly column: number;
}

/** Cuatro casillas consecutivas en línea: quien ocupe las cuatro, gana. */
export interface WinningWindow {
  readonly direction: Direction;
  readonly cells: readonly CellPosition[];
}

/** Paso (fila, columna) para recorrer cada dirección. */
export const DIRECTION_STEPS: Readonly<Record<Direction, readonly [number, number]>> = {
  horizontal: [0, 1],
  vertical: [1, 0],
  'diagonal-up': [1, 1], // ↗
  'diagonal-down': [-1, 1], // ↘
};

const DIRECTIONS = Object.keys(DIRECTION_STEPS) as Direction[];

export function isInside(row: number, column: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(column) &&
    row >= 0 &&
    row < ROWS &&
    column >= 0 &&
    column < COLUMNS
  );
}

function windowFrom(row: number, column: number, direction: Direction): WinningWindow | null {
  const [rowStep, columnStep] = DIRECTION_STEPS[direction];
  const last = WIN_LENGTH - 1;
  if (!isInside(row + rowStep * last, column + columnStep * last)) return null;

  const cells = Array.from({ length: WIN_LENGTH }, (_, i) => ({
    row: row + rowStep * i,
    column: column + columnStep * i,
  }));
  return { direction, cells };
}

function buildWindows(): readonly WinningWindow[] {
  const windows: WinningWindow[] = [];
  for (const direction of DIRECTIONS) {
    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const window = windowFrom(row, column, direction);
        if (window) windows.push(window);
      }
    }
  }
  return windows;
}

/** Las 107 ventanas de 4 del tablero 8×7: 35 horizontales, 32 verticales y 20 por cada diagonal. */
export const WINNING_WINDOWS: readonly WinningWindow[] = buildWindows();

function distanceToCenter(column: number): number {
  return Math.abs(column - (COLUMNS - 1) / 2);
}

/**
 * Columnas del centro hacia los bordes: 3, 4, 2, 5, 1, 6, 0, 7.
 * Es el orden en que la búsqueda prueba jugadas: las del centro participan en más líneas de cuatro.
 */
export const CENTER_ORDER: readonly number[] = Array.from({ length: COLUMNS }, (_, c) => c).sort(
  (a, b) => distanceToCenter(a) - distanceToCenter(b) || a - b,
);
