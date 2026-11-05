import { describe, expect, it } from 'vitest';
import { BOUND_EXACT, BOUND_LOWER, TranspositionTable } from './tt.ts';

describe('tabla de transposición', () => {
  it('guarda y recupera valor, profundidad, cota y jugada', () => {
    const table = new TranspositionTable(8);
    expect(table.size).toBe(256);
    expect(table.probe(123, 456)).toBe(-1);
    table.store(123, 456, 7, -42, BOUND_LOWER, 3);
    const i = table.probe(123, 456);
    expect([table.value(i), table.depth(i), table.bound(i), table.move(i)]).toEqual([
      -42,
      7,
      BOUND_LOWER,
      3,
    ]);
  });

  it('otra posición en la misma casilla no se confunde: la clave completa se compara', () => {
    const table = new TranspositionTable(1); // 2 entradas: muchas colisiones
    table.store(1, 1, 1, 10, BOUND_EXACT, 0);
    expect(table.probe(1, 2)).toBe(-1);
    expect(table.probe(2, 1)).toBe(-1);
  });

  it('clear vacía la tabla', () => {
    const table = new TranspositionTable(4);
    table.store(9, 9, 1, 1, BOUND_EXACT, 1);
    table.clear();
    expect(table.probe(9, 9)).toBe(-1);
  });
});
