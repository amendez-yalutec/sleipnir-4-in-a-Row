import { describe, expect, it } from 'vitest';
import { guardColumn, mostCentral } from './guard.ts';

describe('guardia de legal_moves (invariante 3)', () => {
  it('deja pasar una elección que está en legal_moves', () => {
    expect(guardColumn(5, [0, 5, 7])).toEqual({ column: 5, overridden: false });
  });

  it.each([9, -1, 2.5, Number.NaN, 3, null])(
    'reemplaza %s por la más central de legal_moves',
    (choice) => {
      expect(guardColumn(choice, [0, 2, 6, 7])).toEqual({ column: 2, overridden: true });
    },
  );

  it('sin jugadas legales no hay nada que enviar', () => {
    expect(guardColumn(3, [])).toEqual({ column: null, overridden: true });
  });

  it('la más central sigue el orden 3, 4, 2, 5, 1, 6, 0, 7', () => {
    expect(mostCentral([0, 1, 2, 3, 4, 5, 6, 7])).toBe(3);
    expect(mostCentral([0, 4, 7])).toBe(4);
    expect(mostCentral([7, 0])).toBe(0);
    expect(mostCentral([])).toBeNull();
  });
});
