/**
 * Búsqueda (paso B6): negamax con poda alfa-beta, profundización iterativa, tabla de transposición,
 * ordenamiento de jugadas y control de tiempo (PLAN_BACKEND.md §4.2 y §4.4).
 *
 * Valores desde el punto de vista del que mueve: victoria = WIN − ply (prefiere ganar pronto y perder
 * tarde), empate = 0, y en las hojas la heurística (|h| < 900).
 * El reloj se inyecta (`now`): el motor no lee la hora por su cuenta (invariante 1).
 */
import {
  Bitboard,
  columnsOf,
  lastSpotsHi,
  popcount,
  shiftHi,
  shiftLo,
  winningSpotsLo,
} from './bitboard.ts';
import { evaluate } from './eval.ts';
import { CELLS, CENTER_ORDER, COLUMNS } from './geometry.ts';
import type { Position } from './rules.ts';
import { BOUND_EXACT, BOUND_LOWER, BOUND_UPPER, TranspositionTable } from './tt.ts';

export const WIN = 1_000;
const INFINITY = 10_000;
/** Por encima de esto, el valor es una victoria o derrota demostrada. */
const PROVEN = WIN - 100;
/** Cada cuántos nodos se mira el reloj. */
const CLOCK_EVERY = 2_048;

export interface SearchOptions {
  /** Columnas que el árbitro permite; por defecto, todas las que no están llenas. */
  readonly legalMoves?: readonly number[];
  readonly maxDepth?: number;
  /** No empieza una profundidad nueva si ya usó la mitad de esto. */
  readonly softMs?: number;
  /** Corte duro: aborta la profundidad en curso y responde con la última completa. */
  readonly hardMs?: number;
  readonly now?: () => number;
  /** Tabla para conservar entre turnos; si falta, se crea una chica. */
  readonly table?: TranspositionTable;
  /** Avisa al terminar cada profundidad (el worker reporta su mejor jugada hasta el momento). */
  readonly onDepth?: (result: SearchResult) => void;
}

export interface SearchResult {
  readonly column: number;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly elapsedMs: number;
  /** El valor es exacto: victoria, derrota o empate demostrados. */
  readonly solved: boolean;
}

const toTable = (value: number, ply: number) =>
  value > PROVEN ? value + ply : value < -PROVEN ? value - ply : value;
const fromTable = (value: number, ply: number) =>
  value > PROVEN ? value - ply : value < -PROVEN ? value + ply : value;
const CENTER_RANK = CENTER_ORDER.reduce<number[]>((rank, column, i) => {
  rank[column] = COLUMNS - i;
  return rank;
}, []);

class Searcher {
  nodes = 0;
  aborted = false;
  private readonly order = Array.from({ length: CELLS }, () => new Int8Array(COLUMNS));
  private readonly scores = Array.from({ length: CELLS }, () => new Int32Array(COLUMNS));

  readonly board: Bitboard;
  readonly table: TranspositionTable | null;
  private readonly now: () => number;
  private readonly hardDeadline: number;

  constructor(
    board: Bitboard,
    table: TranspositionTable | null,
    now: () => number,
    hardDeadline: number,
  ) {
    this.board = board;
    this.table = table;
    this.now = now;
    this.hardDeadline = hardDeadline;
  }

  /** Ordena `columns` (conjunto de bits) en `this.order[ply]` y devuelve cuántas son. */
  sortMoves(columns: number, ply: number, first: number): number {
    const b = this.board;
    const order = this.order[ply] as Int8Array;
    const scores = this.scores[ply] as Int32Array;
    let count = 0;
    for (let column = 0; column < COLUMNS; column++) {
      if ((columns & (1 << column)) === 0) continue;
      // Jugadas que crean más amenazas propias primero; luego las del centro.
      const shift = 8 * (column & 3) + b.heights[column];
      const bit = (1 << shift) >>> 0;
      const low = column < 4;
      const pLo = low ? (b.curLo | bit) >>> 0 : b.curLo;
      const pHi = low ? b.curHi : (b.curHi | bit) >>> 0;
      const mLo = low ? (b.maskLo | bit) >>> 0 : b.maskLo;
      const mHi = low ? b.maskHi : (b.maskHi | bit) >>> 0;
      const threats = popcount(winningSpotsLo(pLo, pHi, mLo, mHi)) + popcount(lastSpotsHi());
      let score = threats * 16 + CENTER_RANK[column];
      if (column === first) score += 10_000;
      let i = count++;
      while (i > 0 && scores[i - 1] < score) {
        order[i] = order[i - 1];
        scores[i] = scores[i - 1];
        i--;
      }
      order[i] = column;
      scores[i] = score;
    }
    return count;
  }

  negamax(depth: number, alphaIn: number, betaIn: number, ply: number): number {
    this.nodes++;
    if ((this.nodes & (CLOCK_EVERY - 1)) === 0 && this.now() > this.hardDeadline) {
      this.aborted = true;
    }
    if (this.aborted) return 0;
    const b = this.board;
    if (b.moves >= CELLS) return 0;

    // 1. ¿Gano ahora?
    const playLo = b.playableLo();
    const playHi = b.playableHi();
    const mineLo = winningSpotsLo(b.curLo, b.curHi, b.maskLo, b.maskHi);
    if ((mineLo & playLo) !== 0 || (lastSpotsHi() & playHi) !== 0) return WIN - ply - 1;

    // 2. ¿El rival amenaza ganar? Solo valen los bloqueos; dos amenazas = derrota.
    const theirsLo = winningSpotsLo(b.curLo ^ b.maskLo, b.curHi ^ b.maskHi, b.maskLo, b.maskHi);
    const theirsHi = lastSpotsHi();
    let candLo = playLo;
    let candHi = playHi;
    const forcedLo = playLo & theirsLo;
    const forcedHi = playHi & theirsHi;
    if ((forcedLo | forcedHi) !== 0) {
      if (popcount(forcedLo) + popcount(forcedHi) > 1) return -(WIN - ply - 2);
      candLo = forcedLo;
      candHi = forcedHi;
    }
    // 3. No jugar justo debajo de una casilla que le da la victoria al rival.
    candLo &= ~shiftLo(theirsLo, theirsHi, -1);
    candHi &= ~shiftHi(theirsLo, theirsHi, -1);
    if ((candLo | candHi) === 0) return -(WIN - ply - 2);

    if (depth === 0) return evaluate(b);

    // Lo mejor posible ahora es ganar en la próxima jugada propia.
    let alpha = alphaIn;
    let beta = Math.min(betaIn, WIN - ply - 3);
    if (alpha >= beta) return beta;

    let first = -1;
    const keyLo = b.keyLo();
    const keyHi = b.keyHi();
    if (this.table) {
      const i = this.table.probe(keyLo, keyHi);
      if (i >= 0) {
        first = this.table.move(i);
        if (this.table.depth(i) >= depth) {
          const value = fromTable(this.table.value(i), ply);
          const bound = this.table.bound(i);
          if (bound === BOUND_EXACT) return value;
          if (bound === BOUND_LOWER) alpha = Math.max(alpha, value);
          else beta = Math.min(beta, value);
          if (alpha >= beta) return value;
        }
      }
    }

    const windowAlpha = alpha;
    const count = this.sortMoves(columnsOf(candLo, candHi), ply, first);
    const order = this.order[ply] as Int8Array;
    let best = -INFINITY;
    let bestMove = -1;
    for (let i = 0; i < count; i++) {
      const column = order[i];
      b.play(column);
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      b.undo();
      if (this.aborted) return 0;
      if (score > best) {
        best = score;
        bestMove = column;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
    }

    if (this.table) {
      let bound = BOUND_EXACT;
      if (best <= windowAlpha) bound = BOUND_UPPER;
      else if (best >= beta) bound = BOUND_LOWER;
      this.table.store(keyLo, keyHi, depth, toTable(best, ply), bound, bestMove);
    }
    return best;
  }

  /** Raíz: todas las columnas permitidas, ordenadas, con la mejor de la vuelta anterior primero. */
  root(depth: number, allowed: number, previous: number) {
    const b = this.board;
    const count = this.sortMoves(allowed, 0, previous);
    const order = Array.from(this.order[0] as Int8Array).slice(0, count);
    let alpha = -INFINITY;
    let bestMove = order[0];
    for (const column of order) {
      b.play(column);
      const score = b.lastMoverWon() ? WIN - 1 : -this.negamax(depth - 1, -INFINITY, -alpha, 1);
      b.undo();
      if (this.aborted) return null;
      if (score > alpha) {
        alpha = score;
        bestMove = column;
      }
    }
    return { column: bestMove, score: alpha };
  }
}

function allowedColumns(board: Bitboard, legalMoves: readonly number[] | undefined): number {
  const playable = board.playableColumns();
  if (!legalMoves) return playable;
  return legalMoves.reduce((set, column) => set | (1 << column), 0) & playable;
}

/**
 * Elige la jugada para `position`. Sin `softMs`/`hardMs` busca hasta `maxDepth` (para pruebas
 * deterministas). Lanza un error si no hay ninguna columna jugable.
 */
export function search(position: Position, options: SearchOptions = {}): SearchResult {
  const now = options.now ?? (() => 0);
  const started = now();
  const board = Bitboard.fromBoard(position.board, position.toMove);
  const allowed = allowedColumns(board, options.legalMoves);
  if (allowed === 0) throw new Error('No hay columnas jugables.');

  const hardDeadline = options.hardMs === undefined ? Infinity : started + options.hardMs;
  const softLimit = options.softMs === undefined ? Infinity : options.softMs / 2;
  const searcher = new Searcher(
    board,
    options.table ?? new TranspositionTable(16),
    now,
    hardDeadline,
  );
  const remaining = CELLS - board.moves;
  const maxDepth = Math.min(options.maxDepth ?? remaining, remaining);
  const result = (column: number, score: number, depth: number): SearchResult => ({
    column,
    score,
    depth,
    nodes: searcher.nodes,
    elapsedMs: now() - started,
    solved: Math.abs(score) > PROVEN || depth >= remaining,
  });

  const columns = CENTER_ORDER.filter((column) => (allowed & (1 << column)) !== 0);
  // Salidas inmediatas: ganar ya, o la única jugada posible.
  const winning = columns.find((column) => board.isWinningMove(column));
  if (winning !== undefined) return result(winning, WIN - 1, 1);
  if (columns.length === 1) return result(columns[0], 0, 0);

  let best = result(columns[0], 0, 0);
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (depth > 1 && now() - started >= softLimit) break;
    const found = searcher.root(depth, allowed, best.column);
    if (!found) break; // se acabó el tiempo: vale la última profundidad completa
    best = result(found.column, found.score, depth);
    options.onDepth?.(best);
    if (best.solved) break;
  }
  return { ...best, nodes: searcher.nodes, elapsedMs: now() - started };
}

/** Valor de negamax a profundidad fija, sin profundización iterativa. Para pruebas (alfa-beta = minimax). */
export function negamaxValue(position: Position, depth: number, useTable: boolean): number {
  const board = Bitboard.fromBoard(position.board, position.toMove);
  const table = useTable ? new TranspositionTable(16) : null;
  return new Searcher(board, table, () => 0, Infinity).negamax(depth, -INFINITY, INFINITY, 0);
}
