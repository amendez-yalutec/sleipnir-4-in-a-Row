/**
 * Único lugar que convierte coordenadas (invariante 5 de AGENTS.md):
 * - columnas 0–7 en la API y en el código ↔ 1–8 en lo que ve la persona;
 * - fila 0 abajo (formato del árbitro) ↔ orden de filas en pantalla, de arriba hacia abajo.
 */
export const COLUMNS = 8;
export const ROWS = 7;

/** Columnas de la API, de izquierda a derecha. */
export const API_COLUMNS: readonly number[] = Array.from({ length: COLUMNS }, (_, c) => c);

/** Filas del tablero en el orden en que se dibujan: la 6 arriba y la 0 abajo. */
export const SCREEN_ROWS: readonly number[] = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i);

/** Columna de la API (0–7) → número que ve la persona (1–8). */
export function toDisplayColumn(column: number): number {
  return column + 1;
}

/** Número que ve la persona (1–8) → columna de la API (0–7); `null` si no existe. */
export function fromDisplayColumn(display: number): number | null {
  return Number.isInteger(display) && display >= 1 && display <= COLUMNS ? display - 1 : null;
}

/** Tecla "1"…"8" → columna de la API; cualquier otra tecla, `null`. */
export function columnFromKey(key: string): number | null {
  return /^[1-8]$/.test(key) ? fromDisplayColumn(Number(key)) : null;
}

/** Casillas libres de una columna (para el texto de accesibilidad). */
export function freeSpaces(board: readonly (readonly number[])[], column: number): number {
  return board.filter((row) => row[column] === 0).length;
}

/** Fila donde quedó la última ficha de una columna (la ocupada más alta), o `null`. */
export function topRow(board: readonly (readonly number[])[], column: number): number | null {
  for (let row = ROWS - 1; row >= 0; row--) if (board[row]?.[column] !== 0) return row;
  return null;
}
