/**
 * Presupuesto de tiempo (PLAN_BACKEND.md §4.4 y §9): con 100 ms de corte duro, la búsqueda responde a
 * tiempo en 200 posiciones al azar. La prueba usa el reloj real (Date.now); el motor lo recibe inyectado.
 *
 * Con reloj real y el resto del suite corriendo en paralelo, una pausa del sistema operativo o del
 * recolector de basura puede sumar milisegundos que no dependen del motor. Por eso se exige:
 * - el 95 % de las búsquedas, dentro de hard + 25 ms (lo que controla el motor);
 * - el peor caso, dentro de hard + 60 ms: aun así, muy lejos del temporizador de seguridad del bot
 *   (hard + 100 ms) y del margen de ~1.2 s que deja el plazo del árbitro.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Board, type Player, emptyBoard, isFull, legalMoves, play, winner } from './rules.ts';
import { search } from './search.ts';
import { TranspositionTable } from './tt.ts';

const HARD_MS = 100;
const TOLERANCE_MS = 25;
const WORST_CASE_MS = 60;

describe('presupuesto de tiempo', () => {
  it(`responde dentro de ${HARD_MS} ms (+${TOLERANCE_MS}) en el 95 % de 200 posiciones`, () => {
    const table = new TranspositionTable(18);
    const samples = fc.sample(fc.array(fc.nat(), { minLength: 30, maxLength: 30 }), {
      numRuns: 200,
      seed: 2026,
    });
    const times = samples.map((picks) => {
      let board: Board = emptyBoard();
      let toMove: Player = 1;
      for (const pick of picks.slice(0, pick0(picks))) {
        const legal = legalMoves(board);
        const next = play(board, legal[pick % legal.length], toMove);
        if (winner(next) !== null || isFull(next)) break;
        board = next;
        toMove = toMove === 1 ? 2 : 1;
      }
      const started = Date.now();
      search({ board, toMove }, { softMs: 47, hardMs: HARD_MS, now: () => Date.now(), table });
      return Date.now() - started;
    });
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
    const worst = sorted.at(-1) ?? Infinity;
    const detail = `p95 ${p95} ms, peor ${worst} ms`;
    expect(p95, detail).toBeLessThan(HARD_MS + TOLERANCE_MS);
    expect(worst, detail).toBeLessThan(HARD_MS + WORST_CASE_MS);
  }, 60_000);
});

/** Largo de la partida al azar, derivado de los propios números (0 a 29 jugadas). */
function pick0(picks: number[]): number {
  return (picks[0] ?? 0) % 30;
}
