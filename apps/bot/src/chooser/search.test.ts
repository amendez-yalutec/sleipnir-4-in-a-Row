import { replay } from '@equipo6/engine';
import { describe, expect, it } from 'vitest';
import { createSearchChooser } from './search.ts';

const at = (moves: number[]) => {
  const state = replay(moves);
  return { board: state.board, toMove: state.toMove };
};
const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
const BUDGET = { softMs: 40, hardMs: 80 };

describe('elección con la búsqueda', () => {
  it('gana en 1 e informa profundidad, nodos y puntaje', async () => {
    const choice = await createSearchChooser().choose(at([0, 0, 1, 1, 2, 2]), ALL, BUDGET);
    expect(choice).toMatchObject({ column: 3, depth: 1 });
  });

  it('con presupuesto de tiempo responde una columna permitida', async () => {
    const started = performance.now();
    const choice = await createSearchChooser().choose(at([3, 4]), [0, 1, 6, 7], BUDGET);
    expect([0, 1, 6, 7]).toContain(choice.column);
    expect(choice.depth).toBeGreaterThan(1);
    expect(performance.now() - started).toBeLessThan(BUDGET.hardMs + 50);
  });

  it('sin columnas jugables rechaza la promesa (play-turn usa el respaldo)', async () => {
    const full = at([3, 3, 3, 3, 3, 3, 3]);
    await expect(createSearchChooser({ maxDepth: 2 }).choose(full, [3], BUDGET)).rejects.toThrow(
      'No hay columnas jugables',
    );
  });
});
