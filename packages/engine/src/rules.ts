/**
 * Reglas de Cuatro en línea 8×7 en una representación legible (56 casillas). Es la referencia: el
 * bitboard de la búsqueda (B5) se prueba contra este módulo.
 */
import {
  COLUMNS,
  ROWS,
  WINNING_WINDOWS,
  type CellPosition,
  type WinningWindow,
} from './geometry.ts';

export type Player = 1 | 2;
/** 0 vacío, 1 jugador que abrió la partida, 2 el otro (igual que el árbitro). */
export type Cell = 0 | Player;
/** `board[fila][columna]`, fila 0 abajo. */
export type Board = readonly (readonly Cell[])[];

export type GameStatus = 'playing' | 'won' | 'draw';

export interface GameState {
  readonly board: Board;
  readonly moves: readonly number[];
  /** A quién le toca; si la partida terminó, a quién le tocaría. */
  readonly toMove: Player;
  /** Vacío si la partida terminó. */
  readonly legalMoves: readonly number[];
  readonly status: GameStatus;
  readonly winner: Player | null;
  /** Todas las casillas de las líneas ganadoras, ordenadas por fila y columna. */
  readonly winningCells: readonly CellPosition[];
}

export interface Position {
  readonly board: Board;
  readonly toMove: Player;
}

export type IllegalMoveReason = 'out_of_range' | 'column_full' | 'game_over';

export class IllegalMoveError extends Error {
  override readonly name = 'IllegalMoveError';
  readonly reason: IllegalMoveReason;
  readonly column: number;
  /** Posición de la jugada en la lista, cuando viene de `replay`. */
  readonly index: number | undefined;

  constructor(reason: IllegalMoveReason, column: number, index?: number) {
    super(
      `Jugada ilegal (${reason}): columna ${column}${index === undefined ? '' : `, jugada ${index}`}`,
    );
    this.reason = reason;
    this.column = column;
    this.index = index;
  }
}

export type InvalidBoardReason = 'shape' | 'cell_value' | 'floating_piece' | 'two_winners';

export class InvalidBoardError extends Error {
  override readonly name = 'InvalidBoardError';
  readonly reason: InvalidBoardReason;

  constructor(reason: InvalidBoardReason) {
    super(`Tablero imposible (${reason})`);
    this.reason = reason;
  }
}

// ── Tablero ──────────────────────────────────────────────────────────────────────────────────────

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLUMNS).fill(0));
}

function isColumn(column: number): boolean {
  return Number.isInteger(column) && column >= 0 && column < COLUMNS;
}

export function isFull(board: Board): boolean {
  return board[ROWS - 1].every((cell) => cell !== 0);
}

/** Columnas que no están llenas, de menor a mayor. */
export function legalMoves(board: Board): number[] {
  const moves: number[] = [];
  for (let column = 0; column < COLUMNS; column++) {
    if (board[ROWS - 1][column] === 0) moves.push(column);
  }
  return moves;
}

function drop(board: Board, column: number, player: Player, index?: number) {
  if (!isColumn(column)) throw new IllegalMoveError('out_of_range', column, index);
  const row = board.findIndex((cells) => cells[column] === 0);
  if (row === -1) throw new IllegalMoveError('column_full', column, index);

  const next = board.map((cells, r) =>
    r === row ? cells.map((cell, c) => (c === column ? player : cell)) : cells,
  );
  return { next, row };
}

/** La ficha cae a la fila libre más baja. Devuelve un tablero nuevo; el anterior no cambia. */
export function play(board: Board, column: number, player: Player): Board {
  return drop(board, column, player).next;
}

// ── Líneas de cuatro ─────────────────────────────────────────────────────────────────────────────

const cellKey = (cell: CellPosition) => cell.row * COLUMNS + cell.column;

/** Para cada casilla, las ventanas de 4 que pasan por ella (a lo sumo 16). */
const WINDOWS_BY_CELL: readonly (readonly WinningWindow[])[] = (() => {
  const byCell = Array.from({ length: ROWS * COLUMNS }, (): WinningWindow[] => []);
  for (const window of WINNING_WINDOWS) {
    for (const cell of window.cells) byCell[cellKey(cell)].push(window);
  }
  return byCell;
})();

interface Lines {
  readonly winner: Player | null;
  readonly cells: CellPosition[];
}

function ownerOf(board: Board, window: WinningWindow): Player | null {
  const [first, ...rest] = window.cells;
  const owner = board[first.row][first.column];
  if (owner === 0) return null;
  return rest.every((cell) => board[cell.row][cell.column] === owner) ? owner : null;
}

function findLines(board: Board, candidates: readonly WinningWindow[]): Lines {
  let winner: Player | null = null;
  const keys = new Set<number>();
  for (const window of candidates) {
    const owner = ownerOf(board, window);
    if (owner === null) continue;
    if (winner !== null && owner !== winner) throw new InvalidBoardError('two_winners');
    winner = owner;
    for (const cell of window.cells) keys.add(cellKey(cell));
  }
  const cells = [...keys]
    .sort((a, b) => a - b)
    .map((key) => ({ row: Math.floor(key / COLUMNS), column: key % COLUMNS }));
  return { winner, cells };
}

/** Casillas de todas las líneas de cuatro, ordenadas por fila y columna; vacío si no hay ganador. */
export function winningCells(board: Board): CellPosition[] {
  return findLines(board, WINNING_WINDOWS).cells;
}

export function winner(board: Board): Player | null {
  return findLines(board, WINNING_WINDOWS).winner;
}

export function isDraw(board: Board): boolean {
  return isFull(board) && winner(board) === null;
}

/**
 * ¿Gana `player` si juega en `column`? Solo revisa las ventanas que pasan por la casilla donde cae la
 * ficha. Lanza `IllegalMoveError` si la columna no es jugable.
 */
export function isWinningMove(board: Board, column: number, player: Player): boolean {
  const { next, row } = drop(board, column, player);
  return findLines(next, WINDOWS_BY_CELL[row * COLUMNS + column]).winner === player;
}

// ── Partida completa ─────────────────────────────────────────────────────────────────────────────

const playerFor = (index: number): Player => (index % 2 === 0 ? 1 : 2);

function statusOf(board: Board, lines: Lines): GameStatus {
  if (lines.winner !== null) return 'won';
  return isFull(board) ? 'draw' : 'playing';
}

/**
 * Estado completo a partir de la lista de columnas jugadas (abre el jugador 1). Es lo que usa la API
 * sin estado de la app. Lanza `IllegalMoveError` con el índice de la primera jugada inválida.
 */
export function replay(moves: readonly number[]): GameState {
  let board = emptyBoard();
  let lines: Lines = { winner: null, cells: [] };

  for (const [index, column] of moves.entries()) {
    if (statusOf(board, lines) !== 'playing') {
      throw new IllegalMoveError('game_over', column, index);
    }
    const { next, row } = drop(board, column, playerFor(index), index);
    board = next;
    // La partida termina con la primera línea: basta revisar las ventanas de la última ficha.
    lines = findLines(board, WINDOWS_BY_CELL[row * COLUMNS + column]);
  }

  const status = statusOf(board, lines);
  return {
    board,
    moves: [...moves],
    toMove: playerFor(moves.length),
    legalMoves: status === 'playing' ? legalMoves(board) : [],
    status,
    winner: lines.winner,
    winningCells: lines.cells,
  };
}

// ── Tablero del árbitro ──────────────────────────────────────────────────────────────────────────

function toCell(value: number): Cell {
  if (value === 0 || value === 1 || value === 2) return value;
  throw new InvalidBoardError('cell_value');
}

function assertGravity(board: Board): void {
  for (let column = 0; column < COLUMNS; column++) {
    const firstEmpty = board.findIndex((cells) => cells[column] === 0);
    if (firstEmpty === -1) continue;
    if (board.slice(firstEmpty).some((cells) => cells[column] !== 0)) {
      throw new InvalidBoardError('floating_piece');
    }
  }
}

/**
 * Posición a partir de `board` y `you` de un turno del árbitro, que son la fuente de verdad
 * (PLAN_BACKEND.md §5.1). Copia el tablero y rechaza los físicamente imposibles. No exige que la
 * paridad de fichas coincida con `you`: el ejemplo del OpenAPI 0.9.0 no la cumple.
 */
export function fromArbiterBoard(cells: readonly (readonly number[])[], you: Player): Position {
  if (cells.length !== ROWS || cells.some((row) => row.length !== COLUMNS)) {
    throw new InvalidBoardError('shape');
  }
  const board = cells.map((row) => row.map(toCell));
  assertGravity(board);
  return { board, toMove: you };
}
