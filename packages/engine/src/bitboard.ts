/**
 * Representación rápida del tablero para la búsqueda (paso B5).
 *
 * - Columna c, fila r → bit `8c + r`. Cada columna usa 7 casillas y un bit **centinela** (fila 7)
 *   siempre en 0, que corta las líneas para que no "den la vuelta" a la columna vecina.
 * - 8 columnas × 8 bits = 64 bits. JavaScript no tiene enteros de 64 bits rápidos (BigInt es lento),
 *   así que se parten en dos `uint32`: `lo` = columnas 0–3 y `hi` = columnas 4–7.
 * - Cuatro en línea en la dirección `s` (1 vertical, 8 horizontal, 9 ↗, 7 ↘):
 *   `m = x & (x >> s)`; hay cuatro si `m & (m >> 2s) ≠ 0`.
 *
 * Fuente: Pascal Pons, "Solving Connect 4: how to build a perfect AI" (blog.gamesolver.org).
 * Adaptación nuestra: de 7×6 (49 bits) a 8×7 (64 bits) en dos palabras de 32 bits.
 * Se prueba contra `rules.ts` con miles de partidas al azar (bitboard.property.test.ts).
 */
import { CELLS, COLUMNS, ROWS } from './geometry.ts';
import type { Board, Cell, Player } from './rules.ts';

/** Las 56 casillas reales (sin centinelas): 0x7F en cada columna. */
const BOARD_WORD = 0x7f7f7f7f;
/** La casilla de abajo de cada columna. */
const BOTTOM_WORD = 0x01010101;
/** Desplazamientos de las cuatro direcciones: vertical, ↘, horizontal, ↗. */
const DIRECTIONS = [1, 7, 8, 9] as const;

// ── Operaciones de 64 bits sobre dos palabras ────────────────────────────────────────────────────
// `s` entre -31 y 31: positivo desplaza hacia bits altos (<<), negativo hacia bits bajos (>>).

export function shiftLo(lo: number, hi: number, s: number): number {
  return s > 0 ? (lo << s) >>> 0 : ((lo >>> -s) | (hi << (32 + s))) >>> 0;
}

export function shiftHi(lo: number, hi: number, s: number): number {
  return s > 0 ? ((hi << s) | (lo >>> (32 - s))) >>> 0 : hi >>> -s;
}

export function popcount(word: number): number {
  let x = word - ((word >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/** ¿Las fichas `lo/hi` tienen cuatro en línea en alguna dirección? */
export function hasFour(lo: number, hi: number): boolean {
  for (const s of DIRECTIONS) {
    const mLo = lo & shiftLo(lo, hi, -s);
    const mHi = hi & shiftHi(lo, hi, -s);
    if ((mLo & shiftLo(mLo, mHi, -2 * s)) !== 0 || (mHi & shiftHi(mLo, mHi, -2 * s)) !== 0) {
      return true;
    }
  }
  return false;
}

/**
 * Registro de salida para la palabra alta: JavaScript no devuelve dos números sin crear un objeto,
 * y la búsqueda llama a esto millones de veces. Se lee justo después de llamar a `winningSpotsLo`.
 */
let spotsHi = 0;

/**
 * Casillas **vacías** que completarían un cuatro para las fichas `p`, dada la máscara `m` de todas
 * las fichas (amenazas, jugables o no). Devuelve la palabra baja; la alta queda en `lastSpotsHi()`.
 */
export function winningSpotsLo(pLo: number, pHi: number, mLo: number, mHi: number): number {
  // Vertical: tres fichas justo debajo.
  let rLo = shiftLo(pLo, pHi, 1) & shiftLo(pLo, pHi, 2) & shiftLo(pLo, pHi, 3);
  let rHi = shiftHi(pLo, pHi, 1) & shiftHi(pLo, pHi, 2) & shiftHi(pLo, pHi, 3);

  for (let i = 1; i < DIRECTIONS.length; i++) {
    const s = DIRECTIONS[i] as number;
    const l1 = shiftLo(pLo, pHi, s);
    const h1 = shiftHi(pLo, pHi, s);
    const l2 = shiftLo(pLo, pHi, 2 * s);
    const h2 = shiftHi(pLo, pHi, 2 * s);
    const r1 = shiftLo(pLo, pHi, -s);
    const g1 = shiftHi(pLo, pHi, -s);
    const r2 = shiftLo(pLo, pHi, -2 * s);
    const g2 = shiftHi(pLo, pHi, -2 * s);
    // XXX_ y XX_X: dos fichas de un lado y una más del mismo lado o del otro.
    rLo |= l1 & l2 & (shiftLo(pLo, pHi, 3 * s) | r1);
    rHi |= h1 & h2 & (shiftHi(pLo, pHi, 3 * s) | g1);
    // _XXX y X_XX, en espejo.
    rLo |= r1 & r2 & (shiftLo(pLo, pHi, -3 * s) | l1);
    rHi |= g1 & g2 & (shiftHi(pLo, pHi, -3 * s) | h1);
  }
  spotsHi = (rHi & BOARD_WORD & ~mHi) >>> 0;
  return (rLo & BOARD_WORD & ~mLo) >>> 0;
}

/** Palabra alta del último `winningSpotsLo`. */
export function lastSpotsHi(): number {
  return spotsHi;
}

/** Conjunto de columnas (bit c = columna c) que tienen alguna casilla marcada en `lo/hi`. */
export function columnsOf(lo: number, hi: number): number {
  let set = 0;
  for (let c = 0; c < 4; c++) {
    if ((lo >>> (8 * c)) & 0xff) set |= 1 << c;
    if ((hi >>> (8 * c)) & 0xff) set |= 1 << (c + 4);
  }
  return set;
}

// ── Posición mutable con deshacer, para la búsqueda ──────────────────────────────────────────────

export class Bitboard {
  /** Fichas del jugador al que le toca. */
  curLo = 0;
  curHi = 0;
  /** Todas las fichas. */
  maskLo = 0;
  maskHi = 0;
  /** Jugador al que le toca (solo para volver a la representación legible). */
  toMove: Player = 1;
  moves = 0;
  readonly heights = new Uint8Array(COLUMNS);
  private readonly history = new Uint8Array(CELLS);

  static fromBoard(board: Board, toMove: Player): Bitboard {
    const position = new Bitboard();
    position.toMove = toMove;
    for (let column = 0; column < COLUMNS; column++) {
      for (let row = 0; row < ROWS; row++) {
        const cell = board[row]?.[column] ?? 0;
        if (cell === 0) break;
        position.setBit(column, row, cell === toMove);
        position.heights[column] = row + 1;
        position.moves++;
      }
    }
    return position;
  }

  private setBit(column: number, row: number, mine: boolean): void {
    const bit = (1 << (8 * (column & 3) + row)) >>> 0;
    if (column < 4) {
      this.maskLo = (this.maskLo | bit) >>> 0;
      if (mine) this.curLo = (this.curLo | bit) >>> 0;
    } else {
      this.maskHi = (this.maskHi | bit) >>> 0;
      if (mine) this.curHi = (this.curHi | bit) >>> 0;
    }
  }

  canPlay(column: number): boolean {
    return (this.heights[column] ?? ROWS) < ROWS;
  }

  /** Columnas jugables como conjunto de bits (bit c = columna c). */
  playableColumns(): number {
    let set = 0;
    for (let column = 0; column < COLUMNS; column++) if (this.canPlay(column)) set |= 1 << column;
    return set;
  }

  /** Juega en la columna (que debe ser jugable). Después, `cur` son las fichas del rival. */
  play(column: number): void {
    const row = this.heights[column];
    // cur ^= mask: las fichas del que movía pasan a ser "las del otro".
    this.curLo = (this.curLo ^ this.maskLo) >>> 0;
    this.curHi = (this.curHi ^ this.maskHi) >>> 0;
    this.setBit(column, row, false);
    this.heights[column] = row + 1;
    this.history[this.moves] = column;
    this.moves++;
    this.toMove = this.toMove === 1 ? 2 : 1;
  }

  undo(): void {
    this.moves--;
    const column = this.history[this.moves];
    const row = this.heights[column] - 1;
    this.heights[column] = row;
    const bit = (1 << (8 * (column & 3) + row)) >>> 0;
    if (column < 4) this.maskLo = (this.maskLo & ~bit) >>> 0;
    else this.maskHi = (this.maskHi & ~bit) >>> 0;
    this.curLo = (this.curLo ^ this.maskLo) >>> 0;
    this.curHi = (this.curHi ^ this.maskHi) >>> 0;
    this.toMove = this.toMove === 1 ? 2 : 1;
  }

  /** ¿Gana el que mueve si juega en esta columna (jugable)? */
  isWinningMove(column: number): boolean {
    const bit = (1 << (8 * (column & 3) + this.heights[column])) >>> 0;
    return column < 4
      ? hasFour(this.curLo | bit, this.curHi)
      : hasFour(this.curLo, this.curHi | bit);
  }

  /** ¿Ganó el que acaba de jugar? */
  lastMoverWon(): boolean {
    return hasFour(this.curLo ^ this.maskLo, this.curHi ^ this.maskHi);
  }

  /** Casillas donde se puede jugar ahora (la libre más baja de cada columna). */
  playableLo(): number {
    return ((this.maskLo + BOTTOM_WORD) & BOARD_WORD) >>> 0;
  }

  playableHi(): number {
    return ((this.maskHi + BOTTOM_WORD) & BOARD_WORD) >>> 0;
  }

  /**
   * Clave única de la posición para la tabla de transposición: `cur + mask` (truco de Pons). Con 8
   * bits por columna la suma nunca pasa a la columna vecina, así que cada palabra se suma aparte.
   */
  keyLo(): number {
    return (this.curLo + this.maskLo) >>> 0;
  }

  keyHi(): number {
    return (this.curHi + this.maskHi) >>> 0;
  }

  toBoard(): Cell[][] {
    const other: Player = this.toMove === 1 ? 2 : 1;
    return Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLUMNS }, (_, column): Cell => {
        const shift = 8 * (column & 3) + row;
        const mask = column < 4 ? this.maskLo : this.maskHi;
        const cur = column < 4 ? this.curLo : this.curHi;
        if (((mask >>> shift) & 1) === 0) return 0;
        return ((cur >>> shift) & 1) === 1 ? this.toMove : other;
      }),
    );
  }
}
