import { describe, expect, it } from 'vitest';
import {
  Bitboard,
  columnsOf,
  hasFour,
  lastSpotsHi,
  popcount,
  shiftHi,
  shiftLo,
  winningSpotsLo,
} from './bitboard.ts';
import { fromArbiterBoard, replay } from './rules.ts';

const at = (moves: number[]) => {
  const state = replay(moves);
  return Bitboard.fromBoard(state.board, state.toMove);
};

/** Bit de (columna, fila) como par [lo, hi]. */
const bit = (column: number, row: number): [number, number] => {
  const value = (1 << (8 * (column & 3) + row)) >>> 0;
  return column < 4 ? [value, 0] : [0, value];
};

const union = (...bits: [number, number][]): [number, number] =>
  bits.reduce(([lo, hi], [l, h]) => [(lo | l) >>> 0, (hi | h) >>> 0], [0, 0]);

describe('operaciones de 64 bits en dos palabras', () => {
  it('los desplazamientos cruzan de una palabra a la otra', () => {
    expect([shiftLo(0x80000000, 0, 1), shiftHi(0x80000000, 0, 1)]).toEqual([0, 1]);
    expect([shiftLo(0, 1, -1), shiftHi(0, 1, -1)]).toEqual([0x80000000, 0]);
    expect([shiftLo(0xff000000, 0, 8), shiftHi(0xff000000, 0, 8)]).toEqual([0, 0xff]);
  });

  it('popcount cuenta bits', () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(0xffffffff)).toBe(32);
    expect(popcount(0x80000001)).toBe(2);
    expect(popcount(0x7f7f7f7f)).toBe(28);
  });

  it('columnsOf indica qué columnas tienen bits', () => {
    const [lo, hi] = union(bit(0, 3), bit(3, 6), bit(5, 0));
    expect(columnsOf(lo, hi)).toBe(0b0010_1001);
  });
});

describe('cuatro en línea con bits', () => {
  it.each([
    ['horizontal cruzando de lo a hi', [bit(2, 0), bit(3, 0), bit(4, 0), bit(5, 0)]],
    ['vertical arriba del todo', [bit(7, 3), bit(7, 4), bit(7, 5), bit(7, 6)]],
    ['↗ cruzando de lo a hi', [bit(2, 0), bit(3, 1), bit(4, 2), bit(5, 3)]],
    ['↘ hasta la esquina', [bit(4, 3), bit(5, 2), bit(6, 1), bit(7, 0)]],
  ] as const)('%s', (_name, cells) => {
    const [lo, hi] = union(...cells);
    expect(hasFour(lo, hi)).toBe(true);
  });

  it('el centinela impide que una columna "dé la vuelta" a la siguiente', () => {
    // Filas 4, 5 y 6 de la columna 0 más la fila 0 de la columna 1: consecutivos en bits, no en el tablero.
    const [lo, hi] = union(bit(0, 4), bit(0, 5), bit(0, 6), bit(1, 0));
    expect(hasFour(lo, hi)).toBe(false);
  });

  it('tres en línea no es cuatro', () => {
    const [lo, hi] = union(bit(0, 0), bit(1, 0), bit(2, 0));
    expect(hasFour(lo, hi)).toBe(false);
  });
});

describe('amenazas: casillas vacías que completarían un cuatro', () => {
  it('XXX_ , XX_X y la de arriba de tres apiladas', () => {
    const pieces = union(bit(0, 0), bit(1, 0), bit(2, 0), bit(5, 0), bit(5, 1), bit(5, 2));
    const spotsLo = winningSpotsLo(pieces[0], pieces[1], pieces[0], pieces[1]);
    const spots: [number, number] = [spotsLo, lastSpotsHi()];
    expect(spots).toEqual(union(bit(3, 0), bit(5, 3)));

    // XX_X: el hueco es la amenaza, aunque esté "en el aire" (la gravedad se mira aparte).
    const gap = union(bit(3, 2), bit(4, 2), bit(6, 2));
    const gapLo = winningSpotsLo(gap[0], gap[1], gap[0], gap[1]);
    expect([gapLo, lastSpotsHi()]).toEqual(bit(5, 2));
  });

  it('una casilla ocupada no es amenaza', () => {
    const mine = union(bit(0, 0), bit(1, 0), bit(2, 0));
    const all = union(mine, bit(3, 0));
    expect(winningSpotsLo(mine[0], mine[1], all[0], all[1])).toBe(0);
    expect(lastSpotsHi()).toBe(0);
  });
});

describe('Bitboard', () => {
  it('ida y vuelta con el tablero legible, incluido el ejemplo inconsistente del OpenAPI', () => {
    const { board } = fromArbiterBoard(
      [
        [0, 0, 1, 2, 1, 0, 0, 0],
        [0, 0, 2, 1, 0, 0, 0, 0],
        [0, 0, 0, 2, 0, 0, 0, 0],
        ...Array.from({ length: 4 }, () => Array<number>(8).fill(0)),
      ],
      2,
    );
    const position = Bitboard.fromBoard(board, 2);
    expect(position.toBoard()).toEqual(board);
    expect(position.moves).toBe(6);
    expect([...position.heights]).toEqual([0, 0, 2, 3, 1, 0, 0, 0]);
  });

  it('jugar y deshacer deja todo exactamente igual', () => {
    const position = at([3, 4, 3]);
    const before = [position.curLo, position.curHi, position.maskLo, position.maskHi];
    const key = [position.keyLo(), position.keyHi()];
    position.play(5);
    position.play(3);
    position.undo();
    position.undo();
    expect([position.curLo, position.curHi, position.maskLo, position.maskHi]).toEqual(before);
    expect([position.keyLo(), position.keyHi()]).toEqual(key);
    expect(position.toMove).toBe(2);
  });

  it('isWinningMove, lastMoverWon y columnas jugables', () => {
    const position = at([0, 0, 1, 1, 2, 2]);
    expect(position.isWinningMove(3)).toBe(true);
    expect(position.isWinningMove(4)).toBe(false);
    position.play(3);
    expect(position.lastMoverWon()).toBe(true);

    const full = at([3, 3, 3, 3, 3, 3, 3]);
    expect(full.canPlay(3)).toBe(false);
    expect(full.playableColumns()).toBe(0b1111_0111);
  });

  it('casillas jugables: la libre más baja de cada columna', () => {
    const position = at([0, 7, 7]);
    expect([position.playableLo(), position.playableHi()]).toEqual(
      union(bit(0, 1), bit(1, 0), bit(2, 0), bit(3, 0), bit(4, 0), bit(5, 0), bit(6, 0), bit(7, 2)),
    );
  });
});
