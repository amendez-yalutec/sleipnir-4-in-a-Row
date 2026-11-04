/** Una partida del árbitro simulado y su forma en JSON, tal como la define el OpenAPI. */
import { type CellPosition, type GameState, type Player, replay } from '@equipo6/engine';
import type { HouseBotName } from './house-bots.ts';

export type GameKind = 'practice' | 'friendly' | 'league' | 'third_place' | 'final';
export type EndReason = 'connect4' | 'draw' | 'illegal_move' | 'timeout' | 'absent';
export type Series = 'third' | 'final' | null;

export interface TeamInfo {
  readonly id: string;
  readonly name: string;
  readonly members: readonly string[];
  readonly token: string;
}

export type Seat =
  | { readonly type: 'team'; readonly team: TeamInfo }
  | { readonly type: 'house'; readonly bot: HouseBotName };

export interface MoveRecord {
  readonly turn: number;
  readonly by: Player;
  readonly column: number;
  readonly ms: number;
}

/** Detalle de una derrota que no fue por cuatro en línea (OpenAPI 1.0.1, `result`). */
export interface ForfeitDetails {
  /** illegal_move y timeout: ms desde served_at. */
  readonly ms?: number;
  /** illegal_move: la columna que envió el bot. */
  readonly column?: number;
  /** absent: ms que el turno esperó sin que nadie lo recogiera. */
  readonly waitedMs?: number;
}

export interface GameResult {
  readonly winner: Player | null;
  readonly reason: EndReason;
  readonly winningCells: readonly CellPosition[];
  readonly forfeitedBy?: Player;
  readonly details?: ForfeitDetails;
}

export interface PendingTurn {
  readonly availableAt: number;
  servedAt: number | null;
}

export interface MockGame {
  readonly id: string;
  readonly matchId: string | null;
  readonly kind: GameKind;
  readonly series: Series;
  readonly seats: Readonly<Record<Player, Seat>>;
  readonly moves: MoveRecord[];
  readonly startedAt: number;
  pending: PendingTurn | null;
  result: GameResult | null;
  finishedAt: number | null;
  /** Si la partida se perdió por tiempo: cuándo venció el plazo (para responder 400 timeout). */
  deadlineMissedAt: number | null;
}

export const rivalOf = (player: Player): Player => (player === 1 ? 2 : 1);

export function seatId(seat: Seat): string {
  return seat.type === 'team' ? seat.team.id : seat.bot;
}

export function seatName(seat: Seat): string {
  return seat.type === 'team' ? seat.team.name : seat.bot;
}

export function seatOf(game: MockGame, teamId: string): Player | null {
  if (game.seats[1].type === 'team' && game.seats[1].team.id === teamId) return 1;
  if (game.seats[2].type === 'team' && game.seats[2].team.id === teamId) return 2;
  return null;
}

export function stateOf(game: MockGame): GameState {
  return replay(game.moves.map((move) => move.column));
}

function finish(game: MockGame, result: GameResult, now: number): void {
  game.pending = null;
  game.result = result;
  game.finishedAt = now;
}

/** Registra una jugada que ya se comprobó legal y cierra la partida si gana o empata. */
export function recordMove(game: MockGame, column: number, ms: number, now: number): GameState {
  const by = stateOf(game).toMove;
  game.moves.push({ turn: game.moves.length + 1, by, column, ms });
  game.pending = null;
  const state = stateOf(game);
  if (state.status === 'won') {
    finish(game, { winner: by, reason: 'connect4', winningCells: state.winningCells }, now);
  } else if (state.status === 'draw') {
    finish(game, { winner: null, reason: 'draw', winningCells: [] }, now);
  }
  return state;
}

export function forfeit(
  game: MockGame,
  loser: Player,
  reason: EndReason,
  now: number,
  details: ForfeitDetails = {},
): void {
  finish(
    game,
    { winner: rivalOf(loser), reason, winningCells: [], forfeitedBy: loser, details },
    now,
  );
}

/** match_id según el OpenAPI 1.0.1: m_01… en liga, third_1/final_1 en playoffs, amistoso, null en práctica. */
export function matchIdFor(kind: GameKind, n: number): string | null {
  if (kind === 'practice') return null;
  if (kind === 'friendly') return 'amistoso';
  if (kind === 'league') return `m_${String(n).padStart(2, '0')}`;
  return kind === 'final' ? `final_${n}` : `third_${n}`;
}

export function seriesFor(kind: GameKind): Series {
  if (kind === 'third_place') return 'third';
  return kind === 'final' ? 'final' : null;
}
