/**
 * Búsqueda: puzzles tácticos y tableros límite (PLAN_BACKEND.md §9). Profundidad fija y sin reloj,
 * para que sean deterministas.
 */
import { describe, expect, it } from 'vitest';
import { type Cell, type Position, fromArbiterBoard, legalMoves, replay } from './rules.ts';
import { WIN, search } from './search.ts';
import { TranspositionTable } from './tt.ts';

const DRAW_GAME = [
  3, 5, 4, 0, 7, 1, 0, 3, 3, 0, 2, 3, 4, 6, 4, 0, 6, 0, 5, 1, 2, 4, 0, 0, 2, 7, 6, 7, 4, 7, 3, 5, 5,
  3, 4, 5, 7, 3, 6, 2, 5, 4, 5, 1, 1, 2, 7, 1, 1, 6, 7, 6, 2, 6, 1, 2,
];
const LAST_MOVE_WINS = [
  7, 0, 1, 5, 4, 7, 0, 5, 7, 6, 7, 6, 0, 1, 4, 1, 5, 1, 3, 7, 6, 6, 7, 7, 5, 3, 6, 4, 4, 2, 0, 3, 6,
  0, 0, 6, 3, 4, 5, 0, 4, 2, 3, 5, 2, 2, 3, 2, 1, 5, 4, 3, 1, 2, 1, 2,
];

const at = (moves: readonly number[]): Position => {
  const state = replay(moves);
  return { board: state.board, toMove: state.toMove };
};

const EMPTY_ROW = [0, 0, 0, 0, 0, 0, 0, 0];

describe('puzzles tácticos', () => {
  it('gana en 1', () => {
    const result = search(at([0, 0, 1, 1, 2, 2]), { maxDepth: 6 });
    expect(result).toMatchObject({ column: 3, score: WIN - 1, solved: true });
  });

  it('bloquea en 1', () => {
    expect(search(at([0, 6, 1, 6, 2]), { maxDepth: 6 }).column).toBe(3);
  });

  it('gana en 3: arma dos amenazas a la vez en la fila de abajo', () => {
    // Fila 0: el 1 tiene las columnas 2 y 3, con 1, 4 y 5 libres. Jugar 1 o 4 deja dos amenazas.
    const result = search(at([2, 2, 3, 3]), { maxDepth: 8 });
    expect([1, 4]).toContain(result.column);
    expect(result.score).toBe(WIN - 3); // gana en la tercera jugada desde ahora (ply 3)
    expect(result.solved).toBe(true);
  });

  it('no juega debajo de una casilla que le da la victoria al rival', () => {
    // El 2 tiene la fila 1 en 4, 5 y 6: si el 1 juega en la columna 3, el 2 gana encima.
    const { board } = fromArbiterBoard(
      [
        [0, 0, 0, 0, 1, 1, 2, 2],
        [0, 0, 0, 0, 2, 2, 2, 1],
        EMPTY_ROW,
        EMPTY_ROW,
        EMPTY_ROW,
        EMPTY_ROW,
        EMPTY_ROW,
      ],
      1,
    );
    for (const depth of [1, 2, 4, 8]) {
      expect(search({ board, toMove: 1 }, { maxDepth: depth }).column).not.toBe(3);
    }
  });

  it('si ya perdió, retrasa la derrota todo lo posible', () => {
    // El 2 tiene dos amenazas jugables (columnas 3 y 7 de la fila 0): el 1 no puede tapar las dos.
    const { board } = fromArbiterBoard(
      [[0, 1, 1, 0, 2, 2, 2, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW, EMPTY_ROW, EMPTY_ROW, EMPTY_ROW],
      1,
    );
    const result = search({ board, toMove: 1 }, { maxDepth: 4 });
    expect([3, 7]).toContain(result.column);
    expect(result.score).toBe(-(WIN - 2));
  });
});

describe('tableros límite', () => {
  it('una sola columna disponible: la juega sin buscar', () => {
    const position = at(DRAW_GAME.slice(0, 55));
    expect(search(position)).toMatchObject({ column: DRAW_GAME[55], depth: 0, nodes: 0 });
  });

  it('el árbitro permite menos columnas que el tablero: respeta legalMoves', () => {
    const result = search(at([]), { maxDepth: 4, legalMoves: [0, 7] });
    expect([0, 7]).toContain(result.column);
  });

  it('a punto de llenarse, con victoria en la última casilla', () => {
    const position = at(LAST_MOVE_WINS.slice(0, 55));
    expect(search(position)).toMatchObject({ column: LAST_MOVE_WINS[55], score: WIN - 1 });
  });

  it('a punto de llenarse, sin victoria: resuelve el empate exacto', () => {
    const position = at(DRAW_GAME.slice(0, 50));
    const result = search(position);
    expect(legalMoves(position.board)).toContain(result.column);
    expect(result.solved).toBe(true);
  });

  it('sin columnas jugables lanza un error claro', () => {
    expect(() => search(at(DRAW_GAME))).toThrow('No hay columnas jugables');
    expect(() => search(at([3, 3, 3, 3, 3, 3, 3]), { legalMoves: [3] })).toThrow();
  });
});

describe('opciones', () => {
  it('reporta cada profundidad terminada y conserva la tabla entre búsquedas', () => {
    const depths: number[] = [];
    const table = new TranspositionTable(16);
    const first = search(at([]), { maxDepth: 6, table, onDepth: (r) => depths.push(r.depth) });
    expect(depths).toEqual([1, 2, 3, 4, 5, 6]);
    const again = search(at([]), { maxDepth: 6, table });
    expect(again.column).toBe(first.column);
    expect(again.nodes).toBeLessThan(first.nodes);
  });

  it('el reloj inyectado corta la búsqueda (sin leer la hora del sistema)', () => {
    let clock = 0;
    // Cada lectura del reloj "avanza" 1 ms: el corte llega tras ~50 lecturas (~100,000 nodos).
    const result = search(at([]), { softMs: 1_000, hardMs: 50, now: () => (clock += 1) });
    expect(result.depth).toBeGreaterThan(0);
    expect(result.depth).toBeLessThan(56);
    expect(result.elapsedMs).toBeLessThan(60);
  });
});

describe('valor del empate (contempt)', () => {
  // Tablero lleno sin cuatro en línea (patrón (c/2 + fila) % 2) con dos casillas de arriba vacías:
  // cualquier jugada termina en empate.
  const board: Cell[][] = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 8 }, (_, c): Cell => ((((c >> 1) + r) % 2) + 1) as Cell),
  );
  board[6][0] = 0;
  board[6][2] = 0;
  const position = { board, toMove: 1 as const };

  it('por defecto el empate vale 0', () => {
    expect(search(position, { maxDepth: 4 }).score).toBe(0);
  });

  it('vale +score para el jugador indicado y −score para su rival', () => {
    expect(search(position, { maxDepth: 4, contempt: { player: 1, score: 25 } }).score).toBe(25);
    expect(search(position, { maxDepth: 4, contempt: { player: 2, score: 25 } }).score).toBe(-25);
  });
});
