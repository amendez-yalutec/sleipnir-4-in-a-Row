/**
 * Tabla de transposición en arreglos tipados (sin objetos por entrada, para no generar basura):
 * guarda, por posición, el valor, si es exacto o una cota, la profundidad y la mejor jugada.
 * Con 2^20 entradas ocupa ≈ 13 MB. Se reemplaza siempre (la entrada más nueva gana).
 */
export const BOUND_EXACT = 1;
export const BOUND_LOWER = 2;
export const BOUND_UPPER = 3;

export class TranspositionTable {
  readonly size: number;
  private readonly shift: number;
  private readonly keysLo: Uint32Array;
  private readonly keysHi: Uint32Array;
  private readonly values: Int16Array;
  private readonly depths: Int8Array;
  private readonly bounds: Uint8Array;
  private readonly moves: Int8Array;

  constructor(bits = 20) {
    this.size = 2 ** bits;
    this.shift = 32 - bits;
    this.keysLo = new Uint32Array(this.size);
    this.keysHi = new Uint32Array(this.size);
    this.values = new Int16Array(this.size);
    this.depths = new Int8Array(this.size);
    this.bounds = new Uint8Array(this.size);
    this.moves = new Int8Array(this.size);
  }

  private index(lo: number, hi: number): number {
    const mixed = Math.imul(lo ^ Math.imul(hi ^ (hi >>> 15), 0x85ebca6b), 0x9e3779b1);
    return mixed >>> this.shift;
  }

  /** Índice de la entrada de esa posición, o -1 si no está. */
  probe(lo: number, hi: number): number {
    const i = this.index(lo, hi);
    return this.bounds[i] !== 0 && this.keysLo[i] === lo && this.keysHi[i] === hi ? i : -1;
  }

  value(i: number): number {
    return this.values[i];
  }

  depth(i: number): number {
    return this.depths[i];
  }

  bound(i: number): number {
    return this.bounds[i];
  }

  move(i: number): number {
    return this.moves[i];
  }

  store(lo: number, hi: number, depth: number, value: number, bound: number, move: number): void {
    const i = this.index(lo, hi);
    this.keysLo[i] = lo;
    this.keysHi[i] = hi;
    this.values[i] = value;
    this.depths[i] = depth;
    this.bounds[i] = bound;
    this.moves[i] = move;
  }

  clear(): void {
    this.bounds.fill(0);
  }
}
