import { fromArbiterBoard, legalMoves, replay } from '@equipo6/engine';
import { describe, expect, it } from 'vitest';
import { fallbackChooser } from '../chooser/fallback.ts';
import type { MoveChooser } from '../chooser/types.ts';
import { botMove, easyRandomMove, levelBudget, safeMoves } from './game-service.ts';

const THINK = { softMs: 1_400, hardMs: 1_800 };

describe('niveles de la app (PLAN_BACKEND.md §7)', () => {
  it('presupuestos: Fácil profundidad 2, Medio 150 ms, Difícil el del torneo', () => {
    expect(levelBudget('easy', THINK)).toMatchObject({ maxDepth: 2 });
    expect(levelBudget('medium', THINK)).toEqual({ softMs: 150, hardMs: 150 });
    expect(levelBudget('hard', THINK)).toEqual(THINK);
  });

  it('Fácil al azar: misma posición, misma decisión; ~30 % de las veces', () => {
    const decisions = Array.from({ length: 400 }, (_, i) => {
      const moves = [i % 8, (i >> 3) % 8, (i >> 6) % 8];
      return easyRandomMove(replay(moves));
    });
    const random = decisions.filter((d) => d !== null).length / decisions.length;
    expect(random).toBeGreaterThan(0.2);
    expect(random).toBeLessThan(0.4);
    expect(easyRandomMove(replay([3, 4, 5]))).toBe(easyRandomMove(replay([3, 4, 5])));
  });

  it('el azar de Fácil nunca regala una victoria inmediata', () => {
    // El 2 tiene la fila 1 en 4, 5 y 6: si el 1 juega en la columna 3, el 2 gana encima.
    const empty = [0, 0, 0, 0, 0, 0, 0, 0];
    const { board } = fromArbiterBoard(
      [[0, 0, 0, 0, 1, 1, 2, 2], [0, 0, 0, 0, 2, 2, 2, 1], empty, empty, empty, empty, empty],
      1,
    );
    const state = { ...replay([]), board, toMove: 1 as const, legalMoves: legalMoves(board) };
    expect(safeMoves(state)).toEqual([0, 1, 2, 4, 5, 6, 7]);
  });

  it('siempre devuelve al menos una jugada', () => {
    const state = replay([0, 0, 1, 1, 2, 2]);
    expect(safeMoves(state).length).toBeGreaterThan(0);
  });

  it('botMove usa la búsqueda cuando Fácil no tira al azar, y mide el tiempo', async () => {
    let calls = 0;
    const chooser: MoveChooser = {
      choose: (p, legal, budget) => {
        calls++;
        expect(budget).toMatchObject({ maxDepth: 2 });
        return fallbackChooser.choose(p, legal, budget);
      },
    };
    let clock = 0;
    const deps = { chooser, think: THINK, now: () => (clock += 7) };
    const moves = Array.from({ length: 40 }, (_, i) => [i % 8]).find(
      (m) => easyRandomMove(replay(m)) === null,
    ) as number[];
    const state = await botMove(moves, 'easy', deps);
    expect(calls).toBe(1);
    expect(state.bot).toMatchObject({ level: 'easy', ms: 7 });
  });
});
