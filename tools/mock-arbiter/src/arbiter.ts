/**
 * Estado y reglas de operación del árbitro simulado, sin HTTP. El reloj y el azar se inyectan para
 * probar plazos (3 s), ausencia (30 s) y bots de la casa de forma determinista.
 */
import type { Player } from '@equipo6/engine';
import {
  type GameKind,
  type MockGame,
  type Seat,
  type TeamInfo,
  forfeit,
  matchIdFor,
  recordMove,
  seatOf,
  seriesFor,
  stateOf,
} from './game.ts';
import { toTurnJson, winningPairs } from './json.ts';
import { type HouseBotName, chooseHouseMove } from './house-bots.ts';
import { type Random, createRandom } from './random.ts';
import { type Reply, errorReply, notYourTurn } from './replies.ts';
import { computeStandings } from './standings.ts';

export interface ArbiterOptions {
  readonly teams: readonly TeamInfo[];
  readonly now?: () => number;
  readonly seed?: number;
  readonly deadlineMs?: number;
  readonly absenceMs?: number;
  readonly practiceOpen?: boolean;
  readonly submissionsOpen?: boolean;
}

export class MockArbiter {
  readonly deadlineMs: number;
  readonly absenceMs: number;
  practiceOpen: boolean;
  submissionsOpen: boolean;
  private readonly teams: readonly TeamInfo[];
  private readonly now: () => number;
  private readonly random: Random;
  private readonly games = new Map<string, MockGame>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly changeListeners = new Set<() => void>();
  private readonly submissions = new Map<string, object>();
  private sequence = 0;

  constructor(options: ArbiterOptions) {
    this.teams = options.teams;
    this.now = options.now ?? Date.now;
    this.random = createRandom(options.seed ?? 6);
    this.deadlineMs = options.deadlineMs ?? 3_000;
    this.absenceMs = options.absenceMs ?? 30_000;
    this.practiceOpen = options.practiceOpen ?? true;
    this.submissionsOpen = options.submissionsOpen ?? true;
  }

  teamByToken(token: string): TeamInfo | undefined {
    return this.teams.find((team) => team.token === token);
  }

  teamById(id: string): TeamInfo | undefined {
    return this.teams.find((team) => team.id === id);
  }

  /** Avisa cuando el equipo tiene un turno nuevo (lo usa el long polling). */
  subscribe(teamId: string, listener: () => void): () => void {
    const set = this.listeners.get(teamId) ?? new Set();
    set.add(listener);
    this.listeners.set(teamId, set);
    return () => set.delete(listener);
  }

  /** Avisa ante cualquier cambio de estado (lo usa `/api/live`). */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private changed(): void {
    for (const listener of [...this.changeListeners]) listener();
  }

  /** practice: prácticas o entregas abiertas; frozen: todo cerrado, antes de la liga. */
  get phase(): 'practice' | 'frozen' {
    return this.practiceOpen || this.submissionsOpen ? 'practice' : 'frozen';
  }

  /** Todas las partidas, de la más reciente a la más antigua. */
  allGames(): MockGame[] {
    this.sweep();
    return [...this.games.values()].reverse();
  }

  createGame(kind: GameKind, first: Seat, second: Seat): MockGame {
    if (first.type === 'team' && second.type === 'team' && first.team.id === second.team.id) {
      throw new Error('Un equipo no puede jugar contra sí mismo.');
    }
    const n = ++this.sequence;
    const practice = kind === 'practice';
    const game: MockGame = {
      id: practice ? `g_p_${String(n).padStart(2, '0')}` : `g_${n}`,
      matchId: matchIdFor(kind, n),
      kind,
      series: seriesFor(kind),
      seats: { 1: first, 2: second },
      moves: [],
      startedAt: this.now(),
      pending: null,
      result: null,
      finishedAt: null,
      deadlineMissedAt: null,
    };
    this.games.set(game.id, game);
    this.advance(game);
    this.changed();
    return game;
  }

  createPractice(team: TeamInfo, opponent: HouseBotName, first: Player): Reply {
    if (!this.practiceOpen) {
      return errorReply(423, 'practice_closed', 'Las prácticas están cerradas.');
    }
    const mine: Seat = { type: 'team', team };
    const house: Seat = { type: 'house', bot: opponent };
    const game =
      first === 1
        ? this.createGame('practice', mine, house)
        : this.createGame('practice', house, mine);
    return { status: 201, body: { game_id: game.id, you: first } };
  }

  /** El turno pendiente más antiguo del equipo; el reloj arranca la primera vez que se entrega. */
  nextTurn(team: TeamInfo): ReturnType<typeof toTurnJson> | null {
    this.sweep();
    let oldest: { game: MockGame; seat: Player; availableAt: number } | null = null;
    for (const game of this.games.values()) {
      const seat = this.pendingSeat(game, team.id);
      if (seat === null || !game.pending) continue;
      if (!oldest || game.pending.availableAt < oldest.availableAt) {
        oldest = { game, seat, availableAt: game.pending.availableAt };
      }
    }
    if (!oldest?.game.pending) return null;
    const { pending } = oldest.game;
    pending.servedAt ??= this.now();
    return toTurnJson(oldest.game, oldest.seat, pending.servedAt, this.deadlineMs);
  }

  submitMove(team: TeamInfo, gameId: string, column: number): Reply {
    this.sweep();
    const game = this.games.get(gameId);
    if (!game) return errorReply(409, 'unknown_game', `La partida ${gameId} no existe.`);
    const seat = seatOf(game, team.id);
    if (seat === null) return notYourTurn(gameId);
    if (game.result) {
      const lostOnTime = game.result.reason === 'timeout' && game.result.winner !== seat;
      return lostOnTime && game.deadlineMissedAt !== null
        ? this.lateReply(game.deadlineMissedAt)
        : notYourTurn(gameId);
    }
    if (this.pendingSeat(game, team.id) === null || !game.pending) return notYourTurn(gameId);

    // sweep() ya cerró la partida si el plazo venció: aquí la jugada llegó a tiempo.
    const now = this.now();
    const servedAt = game.pending.servedAt ?? now;
    if (!stateOf(game).legalMoves.includes(column)) {
      forfeit(game, seat, 'illegal_move', now, { ms: now - servedAt, column });
      this.changed();
      return errorReply(400, 'illegal_move', `La columna ${column} está llena.`);
    }

    const state = recordMove(game, column, now - servedAt, now);
    const playing = state.status === 'playing';
    const body = {
      ok: true,
      state: state.status,
      turn: playing ? state.moves.length + 1 : state.moves.length,
      ...(state.status === 'won' && { winning_cells: winningPairs(state) }),
    };
    this.advance(game);
    this.changed();
    return { status: 200, body };
  }

  /** Cierra partidas por ausencia (turno sin recoger) o por plazo vencido. */
  sweep(): void {
    const now = this.now();
    for (const game of this.games.values()) {
      const { pending } = game;
      if (!pending || game.result) continue;
      const seat = stateOf(game).toMove;
      if (pending.servedAt === null) {
        if (now - pending.availableAt > this.absenceMs) {
          forfeit(game, seat, 'absent', now, { waitedMs: now - pending.availableAt });
          this.changed();
        }
      } else if (now > pending.servedAt + this.deadlineMs) {
        this.loseOnTime(game, seat, pending.servedAt);
        this.changed();
      }
    }
  }

  getGame(id: string): MockGame | undefined {
    this.sweep();
    return this.games.get(id);
  }

  pendingTurns(teamId: string): string[] {
    this.sweep();
    return [...this.games.values()]
      .filter((game) => this.pendingSeat(game, teamId) !== null)
      .map((game) => game.id);
  }

  standings() {
    this.sweep();
    return computeStandings(this.teams, this.games.values());
  }

  submissionOf(teamId: string): object | null {
    return this.submissions.get(teamId) ?? null;
  }

  registerSubmission(team: TeamInfo, submission: { repo_url: string; commit: string }): Reply {
    if (!this.submissionsOpen) {
      return errorReply(423, 'submissions_closed', 'Las entregas están cerradas.');
    }
    const record = { ...submission, registered_at: new Date(this.now()).toISOString() };
    this.submissions.set(team.id, record);
    return { status: 200, body: record };
  }

  private pendingSeat(game: MockGame, teamId: string): Player | null {
    if (!game.pending || game.result) return null;
    const seat = seatOf(game, teamId);
    return seat !== null && stateOf(game).toMove === seat ? seat : null;
  }

  private loseOnTime(game: MockGame, seat: Player, servedAt: number): void {
    const now = this.now();
    game.deadlineMissedAt = servedAt + this.deadlineMs;
    forfeit(game, seat, 'timeout', now, { ms: now - servedAt });
  }

  private lateReply(deadlineAt: number): Reply {
    const late = this.now() - deadlineAt;
    return errorReply(400, 'timeout', `La jugada llegó ${late} ms después del límite.`);
  }

  /** Juegan los bots de la casa hasta que le toque a un equipo, y se le avisa. */
  private advance(game: MockGame): void {
    while (!game.result) {
      const state = stateOf(game);
      const seat = game.seats[state.toMove];
      if (seat.type === 'team') {
        game.pending = { availableAt: this.now(), servedAt: null };
        for (const listener of [...(this.listeners.get(seat.team.id) ?? [])]) listener();
        return;
      }
      const column = chooseHouseMove(seat.bot, state.board, state.toMove, this.random);
      recordMove(game, column, 0, this.now());
    }
  }
}
