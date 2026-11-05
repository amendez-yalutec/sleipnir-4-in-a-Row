/**
 * Jugada de respaldo, instantánea: ganar en 1 → bloquear el cuatro del rival → la más central.
 * La usa el temporizador de seguridad si la búsqueda no responde a tiempo (PLAN_BACKEND.md §4.4) y,
 * hasta que exista la búsqueda (B6), es la elección provisional del bot.
 */
import {
  type Player,
  type Position,
  legalMoves as boardLegalMoves,
  play,
  winner,
} from '@equipo6/engine';
import { mostCentral } from '../arbiter/guard.ts';
import type { MoveChooser } from './types.ts';

function winningColumn(position: Position, player: Player, candidates: readonly number[]) {
  return candidates.find((column) => winner(play(position.board, column, player)) === player);
}

export function fallbackMove(position: Position, legalMoves: readonly number[]): number | null {
  // Solo columnas que son legales para el árbitro y también en nuestro tablero.
  const playable = legalMoves.filter((column) => boardLegalMoves(position.board).includes(column));
  const rival: Player = position.toMove === 1 ? 2 : 1;
  return (
    winningColumn(position, position.toMove, playable) ??
    winningColumn(position, rival, playable) ??
    mostCentral(legalMoves)
  );
}

export const fallbackChooser: MoveChooser = {
  choose(position, legalMoves) {
    const column = fallbackMove(position, legalMoves);
    if (column === null) return Promise.reject(new Error('No hay jugadas legales.'));
    return Promise.resolve({ column });
  },
};
