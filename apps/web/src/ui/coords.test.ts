import { describe, expect, it } from 'vitest';
import {
  API_COLUMNS,
  SCREEN_ROWS,
  columnFromKey,
  freeSpaces,
  fromDisplayColumn,
  toDisplayColumn,
  topRow,
} from './coords.ts';

/** Tablero del ejemplo del OpenAPI: asimétrico, sirve para detectar un tablero dibujado al revés. */
const OPENAPI_BOARD = [
  [0, 0, 1, 2, 1, 0, 0, 0],
  [0, 0, 2, 1, 0, 0, 0, 0],
  [0, 0, 0, 2, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

describe('coordenadas (único lugar de conversión)', () => {
  it('columnas 0–7 de la API ↔ 1–8 en pantalla', () => {
    expect(API_COLUMNS.map(toDisplayColumn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([1, 8].map(fromDisplayColumn)).toEqual([0, 7]);
    expect([0, 9, 2.5].map(fromDisplayColumn)).toEqual([null, null, null]);
  });

  it('en pantalla la fila 6 va arriba y la 0 abajo', () => {
    expect(SCREEN_ROWS).toEqual([6, 5, 4, 3, 2, 1, 0]);
    // La primera fila dibujada (arriba) del ejemplo está vacía; la última (abajo) es la fila 0.
    expect(OPENAPI_BOARD[SCREEN_ROWS[0]]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(OPENAPI_BOARD[SCREEN_ROWS.at(-1) as number]).toEqual([0, 0, 1, 2, 1, 0, 0, 0]);
  });

  it('teclas 1–8 → columnas 0–7; otras teclas no hacen nada', () => {
    expect(['1', '4', '8'].map(columnFromKey)).toEqual([0, 3, 7]);
    expect(['0', '9', 'a', 'Enter', '12'].map(columnFromKey)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('espacios libres y fila de la última ficha de una columna', () => {
    expect(freeSpaces(OPENAPI_BOARD, 3)).toBe(4);
    expect(freeSpaces(OPENAPI_BOARD, 0)).toBe(7);
    expect(topRow(OPENAPI_BOARD, 3)).toBe(2);
    expect(topRow(OPENAPI_BOARD, 0)).toBeNull();
  });
});
