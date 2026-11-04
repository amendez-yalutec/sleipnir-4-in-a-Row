/**
 * Reglas del juego, escritas a partir del texto de las bases antes de implementar `rules.ts` (paso B2).
 * Tablero 8 columnas × 7 filas, `board[fila][columna]`, fila 0 abajo; gana quien alinea cuatro en
 * horizontal, vertical o diagonal; tablero lleno sin ganador = empate.
 */
import { describe, expect, it } from 'vitest';
import type { CellPosition } from './geometry.ts';
import {
  type Board,
  type Player,
  IllegalMoveError,
  InvalidBoardError,
  emptyBoard,
  fromArbiterBoard,
  isDraw,
  isFull,
  isWinningMove,
  legalMoves,
  play,
  replay,
  winner,
  winningCells,
} from './rules.ts';

const ALL_COLUMNS = [0, 1, 2, 3, 4, 5, 6, 7];

/** 56 jugadas sin cuatro en línea en ningún momento: termina en empate. */
const DRAW_GAME = [
  3, 5, 4, 0, 7, 1, 0, 3, 3, 0, 2, 3, 4, 6, 4, 0, 6, 0, 5, 1, 2, 4, 0, 0, 2, 7, 6, 7, 4, 7, 3, 5, 5,
  3, 4, 5, 7, 3, 6, 2, 5, 4, 5, 1, 1, 2, 7, 1, 1, 6, 7, 6, 2, 6, 1, 2,
];

/** 56 jugadas donde la última ficha (del jugador 2) completa el primer cuatro en línea. */
const LAST_MOVE_WINS = [
  7, 0, 1, 5, 4, 7, 0, 5, 7, 6, 7, 6, 0, 1, 4, 1, 5, 1, 3, 7, 6, 6, 7, 7, 5, 3, 6, 4, 4, 2, 0, 3, 6,
  0, 0, 6, 3, 4, 5, 0, 4, 2, 3, 5, 2, 2, 3, 2, 1, 5, 4, 3, 1, 2, 1, 2,
];

/** Ejemplo de turno del OpenAPI 0.9.0 (igual al de la pág. 7 de las bases): `moves` no reconstruye `board`. */
const OPENAPI_TURN_EXAMPLE = {
  you: 2 as Player,
  board: [
    [0, 0, 1, 2, 1, 0, 0, 0],
    [0, 0, 2, 1, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  moves: [3, 2, 3, 2, 4, 3, 2, 3],
};

const cells = (...pairs: [number, number][]): CellPosition[] =>
  pairs.map(([row, column]) => ({ row, column }));

function expectIllegal(fn: () => unknown, reason: IllegalMoveError['reason'], index?: number) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(IllegalMoveError);
    expect((error as IllegalMoveError).reason).toBe(reason);
    if (index !== undefined) expect((error as IllegalMoveError).index).toBe(index);
    return;
  }
  expect.fail(`se esperaba IllegalMoveError (${reason})`);
}

function expectInvalidBoard(fn: () => unknown, reason: InvalidBoardError['reason']) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidBoardError);
    expect((error as InvalidBoardError).reason).toBe(reason);
    return;
  }
  expect.fail(`se esperaba InvalidBoardError (${reason})`);
}

function emptyRows(): number[][] {
  return Array.from({ length: 7 }, () => Array<number>(8).fill(0));
}

describe('caída de fichas', () => {
  it('la ficha cae a la fila libre más baja de la columna', () => {
    const first = play(emptyBoard(), 3, 1);
    expect(first[0]?.[3]).toBe(1);

    const second = play(first, 3, 2);
    expect(second[0]?.[3]).toBe(1);
    expect(second[1]?.[3]).toBe(2);
  });

  it('una columna admite 7 fichas; la octava se rechaza por columna llena', () => {
    let board: Board = emptyBoard();
    for (let i = 0; i < 7; i++) board = play(board, 0, i % 2 === 0 ? 1 : 2);

    expect(board.map((row) => row[0])).toEqual([1, 2, 1, 2, 1, 2, 1]);
    expectIllegal(() => play(board, 0, 2), 'column_full');
  });

  it.each([-1, 8, 2.5, Number.NaN])('rechaza la columna %s (fuera de 0–7)', (column) => {
    expectIllegal(() => play(emptyBoard(), column, 1), 'out_of_range');
  });

  it('jugar no modifica el tablero anterior', () => {
    const before = emptyBoard();
    play(before, 4, 1);
    expect(before.flat().every((cell) => cell === 0)).toBe(true);
  });
});

describe('jugadas legales', () => {
  it('en el tablero vacío las 8 columnas son legales', () => {
    expect(legalMoves(emptyBoard())).toEqual(ALL_COLUMNS);
  });

  it('excluye las columnas llenas', () => {
    const { board } = replay([3, 3, 3, 3, 3, 3, 3]);
    expect(legalMoves(board)).toEqual([0, 1, 2, 4, 5, 6, 7]);
  });

  it('con el tablero lleno no hay jugadas legales', () => {
    const { board } = replay(DRAW_GAME);
    expect(isFull(board)).toBe(true);
    expect(legalMoves(board)).toEqual([]);
  });

  it('una partida terminada no tiene jugadas legales aunque queden columnas libres', () => {
    const state = replay([0, 0, 1, 1, 2, 2, 3]);
    expect(state.status).toBe('won');
    expect(state.legalMoves).toEqual([]);
  });
});

describe('victoria en las 4 direcciones', () => {
  it('horizontal en la esquina inferior izquierda', () => {
    const state = replay([0, 0, 1, 1, 2, 2, 3]);
    expect(state.status).toBe('won');
    expect(state.winner).toBe(1);
    expect(state.winningCells).toEqual(cells([0, 0], [0, 1], [0, 2], [0, 3]));
  });

  it('horizontal contra el borde derecho', () => {
    const state = replay([7, 7, 6, 6, 5, 5, 4]);
    expect(state.winner).toBe(1);
    expect(state.winningCells).toEqual(cells([0, 4], [0, 5], [0, 6], [0, 7]));
  });

  it('vertical que toca la fila de arriba (gana el jugador 2)', () => {
    const state = replay([7, 7, 7, 7, 0, 7, 1, 7, 0, 7]);
    expect(state.status).toBe('won');
    expect(state.winner).toBe(2);
    expect(state.winningCells).toEqual(cells([3, 7], [4, 7], [5, 7], [6, 7]));
  });

  it('diagonal ↗ desde la esquina inferior izquierda', () => {
    const state = replay([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    expect(state.winner).toBe(1);
    expect(state.winningCells).toEqual(cells([0, 0], [1, 1], [2, 2], [3, 3]));
  });

  it('diagonal ↘ hasta la esquina inferior derecha', () => {
    const state = replay([7, 6, 6, 5, 5, 4, 5, 4, 4, 1, 4]);
    expect(state.winner).toBe(1);
    expect(state.winningCells).toEqual(cells([0, 7], [1, 6], [2, 5], [3, 4]));
  });

  it('tres en línea no gana', () => {
    const state = replay([0, 0, 1, 1, 2, 2]);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.winningCells).toEqual([]);
  });

  it('con cinco en línea, winningCells marca las cinco', () => {
    const state = replay([0, 0, 1, 1, 3, 3, 4, 7, 2]);
    expect(state.winner).toBe(1);
    expect(state.winningCells).toEqual(cells([0, 0], [0, 1], [0, 2], [0, 3], [0, 4]));
  });

  it('la partida termina con el primer cuatro: no se aceptan más jugadas', () => {
    expectIllegal(() => replay([0, 0, 1, 1, 2, 2, 3, 4]), 'game_over', 7);
  });

  it('winner y winningCells también funcionan sobre un tablero suelto', () => {
    const { board } = replay([7, 6, 6, 5, 5, 4, 5, 4, 4, 1, 4]);
    expect(winner(board)).toBe(1);
    expect(winningCells(board)).toEqual(cells([0, 7], [1, 6], [2, 5], [3, 4]));
    expect(winner(emptyBoard())).toBeNull();
  });
});

describe('isWinningMove', () => {
  it('detecta la jugada que gana sin revisar todo el tablero', () => {
    const { board } = replay([0, 0, 1, 1, 2, 2]);
    expect(isWinningMove(board, 3, 1)).toBe(true);
    expect(isWinningMove(board, 4, 1)).toBe(false);
    expect(isWinningMove(board, 3, 2)).toBe(false);
  });

  it('una columna llena no es jugable', () => {
    const { board } = replay([3, 3, 3, 3, 3, 3, 3]);
    expectIllegal(() => isWinningMove(board, 3, 2), 'column_full');
  });
});

describe('empate', () => {
  it('56 fichas sin cuatro en línea es empate', () => {
    const state = replay(DRAW_GAME);
    expect(state.moves).toHaveLength(56);
    expect(state.status).toBe('draw');
    expect(state.winner).toBeNull();
    expect(state.winningCells).toEqual([]);
    expect(isDraw(state.board)).toBe(true);
  });

  it('si la ficha 56 completa cuatro, es victoria y no empate', () => {
    const state = replay(LAST_MOVE_WINS);
    expect(isFull(state.board)).toBe(true);
    expect(state.status).toBe('won');
    expect(state.winner).toBe(2);
    expect(isDraw(state.board)).toBe(false);
  });

  it('con una casilla libre todavía no es empate', () => {
    const state = replay(DRAW_GAME.slice(0, 55));
    expect(state.status).toBe('playing');
    expect(isDraw(state.board)).toBe(false);
    expect(state.legalMoves).toEqual([DRAW_GAME[55]]);
  });
});

describe('replay: estado completo a partir de la lista de jugadas', () => {
  it('sin jugadas: abre el jugador 1 y todo es legal', () => {
    const state = replay([]);
    expect(state.status).toBe('playing');
    expect(state.toMove).toBe(1);
    expect(state.legalMoves).toEqual(ALL_COLUMNS);
    expect(state.board.flat().every((cell) => cell === 0)).toBe(true);
  });

  it('los jugadores se alternan empezando por el 1', () => {
    const state = replay([3, 3, 4]);
    expect(state.board[0]?.[3]).toBe(1);
    expect(state.board[1]?.[3]).toBe(2);
    expect(state.board[0]?.[4]).toBe(1);
    expect(state.toMove).toBe(2);
  });

  it('indica qué jugada de la lista es ilegal', () => {
    expectIllegal(() => replay([0, 0, 0, 0, 0, 0, 0, 0]), 'column_full', 7);
    expectIllegal(() => replay([3, 9]), 'out_of_range', 1);
  });
});

describe('fromArbiterBoard: posición a partir de board + you del árbitro', () => {
  it('acepta el ejemplo inconsistente del OpenAPI 0.9.0: mandan board y you, no moves', () => {
    const position = fromArbiterBoard(OPENAPI_TURN_EXAMPLE.board, OPENAPI_TURN_EXAMPLE.you);
    expect(position.toMove).toBe(2);
    expect(position.board).toEqual(OPENAPI_TURN_EXAMPLE.board);
    expect(legalMoves(position.board)).toEqual(ALL_COLUMNS);

    // Documenta la inconsistencia (PLAN_BACKEND.md §5.1): las 8 jugadas de moves no dan ese tablero.
    expect(replay(OPENAPI_TURN_EXAMPLE.moves).board).not.toEqual(OPENAPI_TURN_EXAMPLE.board);
  });

  it('acepta columnas llenas y un tablero completo', () => {
    const full = replay(DRAW_GAME).board;
    const position = fromArbiterBoard(full, 1);
    expect(position.board).toEqual(full);
    expect(legalMoves(position.board)).toEqual([]);
  });

  it('no comparte memoria con el arreglo recibido', () => {
    const rows = emptyRows();
    const position = fromArbiterBoard(rows, 1);
    rows[0][0] = 1;
    expect(position.board[0]?.[0]).toBe(0);
  });

  it('rechaza tableros que no son de 7 × 8', () => {
    expectInvalidBoard(() => fromArbiterBoard(emptyRows().slice(1), 1), 'shape');
    const shortRow = emptyRows();
    shortRow[2] = [0, 0, 0, 0, 0, 0, 0];
    expectInvalidBoard(() => fromArbiterBoard(shortRow, 1), 'shape');
  });

  it.each([3, -1, 1.5])('rechaza el valor de casilla %s', (value) => {
    const rows = emptyRows();
    rows[0][0] = value;
    expectInvalidBoard(() => fromArbiterBoard(rows, 1), 'cell_value');
  });

  it('rechaza fichas flotando sobre una casilla vacía', () => {
    const rows = emptyRows();
    rows[1][4] = 1;
    expectInvalidBoard(() => fromArbiterBoard(rows, 2), 'floating_piece');
  });

  it('un tablero con cuatro en línea de los dos jugadores es imposible', () => {
    const rows = emptyRows();
    rows[0] = [1, 1, 1, 1, 2, 2, 2, 2];
    const { board } = fromArbiterBoard(rows, 1);
    expectInvalidBoard(() => winner(board), 'two_winners');
  });
});
