/** Forma en JSON de turnos y partidas, tal como la define el OpenAPI 1.0.1 del árbitro. */
import type { CellPosition, GameState, Player } from '@equipo6/engine';
import {
  type GameResult,
  type MockGame,
  type Seat,
  rivalOf,
  seatId,
  seatName,
  stateOf,
} from './game.ts';

const toPairs = (cells: readonly CellPosition[]) => cells.map(({ row, column }) => [row, column]);
const iso = (ms: number) => new Date(ms).toISOString();

export function winningPairs(state: GameState) {
  return toPairs(state.winningCells);
}

/** `PlayerRef`: `team_id` (no `id`) y `house: true` solo para los bots de la casa. */
export function playerRef(seat: Seat) {
  return {
    team_id: seatId(seat),
    name: seatName(seat),
    ...(seat.type === 'house' && { house: true as const }),
  };
}

export function toTurnJson(game: MockGame, you: Player, servedAt: number, deadlineMs: number) {
  const state = stateOf(game);
  const last = game.moves.at(-1);
  return {
    status: 'turn' as const,
    game_id: game.id,
    match_id: game.matchId,
    kind: game.kind,
    you,
    opponent: seatName(game.seats[rivalOf(you)]),
    turn: game.moves.length + 1,
    board: state.board,
    moves: state.moves,
    last_move: last ? { by: last.by, column: last.column } : null,
    legal_moves: state.legalMoves,
    deadline_ms: deadlineMs,
    served_at: iso(servedAt),
  };
}

function resultJson(result: GameResult) {
  const { details = {} } = result;
  return {
    winner: result.winner,
    reason: result.reason,
    ...(result.reason === 'connect4' && { winning_cells: toPairs(result.winningCells) }),
    ...(result.forfeitedBy !== undefined && { forfeited_by: result.forfeitedBy }),
    ...(details.ms !== undefined && { ms: details.ms }),
    ...(details.column !== undefined && { column: details.column }),
    ...(details.waitedMs !== undefined && { waited_ms: details.waitedMs }),
  };
}

/** `GameSummary`: la partida sin tablero (lo que devuelve `GET /api/games`). */
export function toGameSummary(game: MockGame) {
  const { result } = game;
  return {
    game_id: game.id,
    match_id: game.matchId,
    kind: game.kind,
    series: game.series,
    status: result ? ('finished' as const) : ('playing' as const),
    players: { '1': playerRef(game.seats[1]), '2': playerRef(game.seats[2]) },
    moves: game.moves,
    current: result ? null : stateOf(game).toMove,
    result: result && resultJson(result),
    started_at: iso(game.startedAt),
    finished_at: game.finishedAt === null ? null : iso(game.finishedAt),
  };
}

/** `Game`: el resumen más el tablero (`GET /api/games/{game_id}`). */
export function toGameJson(game: MockGame) {
  return { ...toGameSummary(game), board: stateOf(game).board };
}
