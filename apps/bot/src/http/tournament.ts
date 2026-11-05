/** Partidas del torneo para la app: del registro público del árbitro a nuestro contrato. */
import type { TournamentGame, TournamentGameDetail } from '@equipo6/contracts';
import { type Board, emptyBoard, legalMoves, play } from '@equipo6/engine';
import type { ArbiterGame } from '../arbiter/schema.ts';

export function toTournamentGame(game: ArbiterGame): TournamentGame {
  const player = (p: ArbiterGame['players']['1']) => ({ id: p.id, name: p.name, house: p.house });
  return {
    id: game.game_id,
    kind: game.kind,
    status: game.status,
    players: { '1': player(game.players[1]), '2': player(game.players[2]) },
    moves: game.moves.map((move) => move.column),
    winner: game.result?.winner ?? null,
    reason: game.result?.reason ?? null,
    startedAt: game.started_at ?? null,
  };
}

/**
 * Tablero después de cada jugada, calculado con las reglas del motor (el frontend no las implementa).
 * Si el registro trae una jugada imposible, se corta ahí.
 */
export function framesOf(game: ArbiterGame): Board[] {
  const frames: Board[] = [emptyBoard()];
  for (const move of game.moves) {
    const board = frames.at(-1) as Board;
    if (!legalMoves(board).includes(move.column)) break;
    frames.push(play(board, move.column, move.by));
  }
  return frames;
}

export function toTournamentDetail(game: ArbiterGame): TournamentGameDetail {
  return {
    game: toTournamentGame(game),
    frames: framesOf(game).map((board) => board.map((row) => [...row])),
    winningCells: (game.result?.winning_cells ?? []).map(([row, column]): [number, number] => [
      row,
      column,
    ]),
  };
}

/** ¿Juega este equipo en la partida? Sin `teamId` configurado, se muestran todas. */
export function involves(game: ArbiterGame, teamId: string | undefined): boolean {
  return !teamId || game.players[1].id === teamId || game.players[2].id === teamId;
}
