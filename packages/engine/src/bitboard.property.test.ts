/**
 * Criterio de listo de B5: en 10,000 partidas al azar, el bitboard y `rules.ts` coinciden en
 * legalidad, victoria y empate, y la clave de la tabla de transposición nunca choca.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Bitboard, lastSpotsHi, winningSpotsLo } from './bitboard.ts';
import { type Board, emptyBoard, isWinningMove, legalMoves, play, winner } from './rules.ts';

const GAMES = 10_000;
// En la máquina de GitHub Actions estas 10,000 partidas tardan ~95 s (en una laptop, ~21 s).
const SLOW_CI_TIMEOUT_MS = 180_000;
const choices = fc.array(fc.nat(), { minLength: 56, maxLength: 56 });

describe('bitboard = reglas', () => {
  it(
    `${GAMES} partidas: legalidad, jugada ganadora, tablero, victoria y empate coinciden`,
    () => {
      const keys = new Map<string, string>();
      fc.assert(
        fc.property(choices, (picks) => {
          let board: Board = emptyBoard();
          const fast = new Bitboard();
          for (const pick of picks) {
            const legal = legalMoves(board);
            const toMove = fast.toMove;
            for (let column = 0; column < 8; column++) {
              expect(fast.canPlay(column)).toBe(legal.includes(column));
              if (legal.includes(column)) {
                expect(fast.isWinningMove(column)).toBe(isWinningMove(board, column, toMove));
              }
            }
            if (legal.length === 0) break; // empate: tablero lleno sin ganador
            const column = legal[pick % legal.length];
            board = play(board, column, toMove);
            fast.play(column);

            expect(fast.toBoard()).toEqual(board);
            const key = `${fast.keyLo()}:${fast.keyHi()}:${fast.toMove}`;
            const seen = keys.get(key);
            const shape = JSON.stringify(board);
            if (seen !== undefined) expect(seen).toBe(shape);
            else if (keys.size < 300_000) keys.set(key, shape);

            const won = winner(board) !== null;
            expect(fast.lastMoverWon()).toBe(won);
            if (won) break;
          }
        }),
        { numRuns: GAMES },
      );
    },
    SLOW_CI_TIMEOUT_MS,
  );

  it('las amenazas por bits son exactamente las casillas vacías que completarían un cuatro', () => {
    fc.assert(
      fc.property(choices, fc.nat({ max: 40 }), (picks, length) => {
        let board: Board = emptyBoard();
        const fast = new Bitboard();
        for (const pick of picks.slice(0, length)) {
          const legal = legalMoves(board);
          if (legal.length === 0 || winner(board) !== null) break;
          const column = legal[pick % legal.length];
          board = play(board, column, fast.toMove);
          fast.play(column);
        }
        if (winner(board) !== null) return; // partida terminada: no hay turno que analizar
        // Amenazas del jugador al que le toca, ignorando la gravedad.
        const lo = winningSpotsLo(fast.curLo, fast.curHi, fast.maskLo, fast.maskHi);
        const hi = lastSpotsHi();
        for (let row = 0; row < 7; row++) {
          for (let column = 0; column < 8; column++) {
            const shift = 8 * (column & 3) + row;
            const marked = (((column < 4 ? lo : hi) >>> shift) & 1) === 1;
            const filled = board.map((r) => [...r]);
            const empty = filled[row]?.[column] === 0;
            (filled[row] as number[])[column] = fast.toMove;
            const completes = empty && winner(filled) === fast.toMove;
            expect(marked).toBe(completes);
          }
        }
      }),
      { numRuns: 1_000 },
    );
  });
});
