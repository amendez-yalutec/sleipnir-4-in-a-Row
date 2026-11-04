import { beforeEach, describe, expect, it } from 'vitest';
import { MockArbiter } from './arbiter.ts';
import type { Seat, TeamInfo } from './game.ts';

const EQ6: TeamInfo = { id: 'eq6', name: 'Equipo 6', token: 't-eq6', members: ['Ana'] };
const RIVAL: TeamInfo = { id: 'rival', name: 'Rival', token: 't-rival', members: [] };
const OTHER: TeamInfo = { id: 'otro', name: 'Otro', token: 't-otro', members: [] };
const seat = (team: TeamInfo): Seat => ({ type: 'team', team });

const START = Date.parse('2026-11-05T15:00:00.000Z');
let clock = START;
let arbiter: MockArbiter;

beforeEach(() => {
  clock = START;
  arbiter = new MockArbiter({ teams: [EQ6, RIVAL, OTHER], now: () => clock, seed: 1 });
});

const body = (reply: { body: unknown }) => reply.body as Record<string, unknown>;

/** Juega una lista de columnas alternando eq6 (jugador 1) y rival (jugador 2). */
function playTeams(gameId: string, columns: readonly number[]) {
  return columns.map((column, i) => {
    const team = i % 2 === 0 ? EQ6 : RIVAL;
    arbiter.nextTurn(team);
    return arbiter.submitMove(team, gameId, column);
  });
}

describe('turnos', () => {
  it('práctica en la que abre el equipo: turno 1 sin última jugada', () => {
    const created = arbiter.createPractice(EQ6, 'casa-basico', 1);
    expect(created).toEqual({ status: 201, body: { game_id: 'g_p_01', you: 1 } });

    const turn = arbiter.nextTurn(EQ6);
    expect(turn).toMatchObject({
      status: 'turn',
      game_id: 'g_p_01',
      match_id: null,
      kind: 'practice',
      you: 1,
      opponent: 'casa-basico',
      turn: 1,
      moves: [],
      last_move: null,
      legal_moves: [0, 1, 2, 3, 4, 5, 6, 7],
      deadline_ms: 3000,
      served_at: '2026-11-05T15:00:00.000Z',
    });
  });

  it('práctica en la que abre la casa: el bot ya jugó y es la última jugada', () => {
    arbiter.createPractice(EQ6, 'casa-aleatorio', 2);
    const turn = arbiter.nextTurn(EQ6);
    expect(turn?.you).toBe(2);
    expect(turn?.turn).toBe(2);
    expect(turn?.moves).toHaveLength(1);
    expect(turn?.last_move).toEqual({ by: 1, column: turn?.moves[0] });
    expect(turn?.board.flat().filter((cell) => cell !== 0)).toEqual([1]);
  });

  it('volver a pedir el mismo turno no reinicia el reloj', () => {
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    const first = arbiter.nextTurn(EQ6);
    clock += 500;
    expect(arbiter.nextTurn(EQ6)?.served_at).toBe(first?.served_at);
  });

  it('con varias partidas entrega el turno más antiguo', () => {
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    clock += 10;
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    expect(arbiter.nextTurn(EQ6)?.game_id).toBe('g_p_01');

    clock += 10;
    arbiter.submitMove(EQ6, 'g_p_01', 3); // la casa responde y g_p_01 vuelve a quedar pendiente
    expect(arbiter.nextTurn(EQ6)?.game_id).toBe('g_p_02');
    expect(arbiter.pendingTurns(EQ6.id)).toEqual(['g_p_01', 'g_p_02']);
  });

  it('sin turnos pendientes no hay nada que entregar', () => {
    expect(arbiter.nextTurn(EQ6)).toBeNull();
  });

  it('avisa al equipo cuando le aparece un turno', () => {
    const calls: string[] = [];
    const unsubscribe = arbiter.subscribe(EQ6.id, () => calls.push('eq6'));
    arbiter.subscribe(RIVAL.id, () => calls.push('rival'));
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    unsubscribe();
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    expect(calls).toEqual(['eq6']);
  });
});

describe('jugadas', () => {
  it('acepta la jugada, registra el tiempo y la casa responde', () => {
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    arbiter.nextTurn(EQ6);
    clock += 1234;
    expect(arbiter.submitMove(EQ6, 'g_p_01', 3)).toEqual({
      status: 200,
      body: { ok: true, state: 'playing', turn: 2 },
    });
    const game = arbiter.getGame('g_p_01');
    expect(game?.moves[0]).toEqual({ turn: 1, by: 1, column: 3, ms: 1234 });
    expect(game?.moves).toHaveLength(2);
    expect(arbiter.nextTurn(EQ6)?.turn).toBe(3);
  });

  it('acepta una jugada aunque el turno no se haya pedido (cuenta 0 ms)', () => {
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    expect(arbiter.submitMove(EQ6, 'g_p_01', 0).status).toBe(200);
    expect(arbiter.getGame('g_p_01')?.moves[0]?.ms).toBe(0);
  });

  it('victoria: state won con las casillas ganadoras', () => {
    const game = arbiter.createGame('friendly', seat(EQ6), seat(RIVAL));
    const replies = playTeams(game.id, [0, 7, 1, 7, 2, 7, 3]);
    expect(replies.at(-1)).toEqual({
      status: 200,
      body: {
        ok: true,
        state: 'won',
        turn: 7,
        winning_cells: [
          [0, 0],
          [0, 1],
          [0, 2],
          [0, 3],
        ],
      },
    });
    expect(game.result).toMatchObject({ winner: 1, reason: 'connect4' });
  });

  it('empate: state draw en la jugada 56', () => {
    const draw = [
      3, 5, 4, 0, 7, 1, 0, 3, 3, 0, 2, 3, 4, 6, 4, 0, 6, 0, 5, 1, 2, 4, 0, 0, 2, 7, 6, 7, 4, 7, 3,
      5, 5, 3, 4, 5, 7, 3, 6, 2, 5, 4, 5, 1, 1, 2, 7, 1, 1, 6, 7, 6, 2, 6, 1, 2,
    ];
    const game = arbiter.createGame('league', seat(EQ6), seat(RIVAL));
    const replies = playTeams(game.id, draw);
    expect(replies.at(-1)).toEqual({ status: 200, body: { ok: true, state: 'draw', turn: 56 } });
    expect(game.result).toMatchObject({ winner: null, reason: 'draw' });
    expect(arbiter.standings().map((row) => row.points)).toEqual([1, 1, 0]);
  });

  it('columna llena: 400 illegal_move y la partida se pierde', () => {
    const game = arbiter.createGame('friendly', seat(EQ6), seat(RIVAL));
    playTeams(game.id, [0, 0, 0, 0, 0, 0, 0]);
    arbiter.nextTurn(RIVAL);
    const reply = arbiter.submitMove(RIVAL, game.id, 0);
    expect(reply.status).toBe(400);
    expect(body(reply)).toMatchObject({ ok: false, error: 'illegal_move' });
    expect(game.result).toMatchObject({ winner: 1, reason: 'illegal_move' });
  });

  it('409 cuando no es su turno, la partida no es suya o ya terminó; unknown_game si no existe', () => {
    const game = arbiter.createGame('friendly', seat(EQ6), seat(RIVAL));
    expect(body(arbiter.submitMove(RIVAL, game.id, 0)).error).toBe('not_your_turn');
    expect(body(arbiter.submitMove(OTHER, game.id, 0)).error).toBe('not_your_turn');
    expect(arbiter.submitMove(EQ6, 'no-existe', 0)).toMatchObject({
      status: 409,
      body: { error: 'unknown_game' },
    });

    playTeams(game.id, [0, 7, 1, 7, 2, 7, 3]);
    expect(arbiter.submitMove(RIVAL, game.id, 4).status).toBe(409);
  });

  it('un equipo no puede jugar contra sí mismo', () => {
    expect(() => arbiter.createGame('friendly', seat(EQ6), seat(EQ6))).toThrow();
  });
});

describe('reloj: plazo de 3 s y ausencia de 30 s', () => {
  it('la jugada que llega tarde recibe 400 timeout y pierde la partida', () => {
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    arbiter.nextTurn(EQ6);
    clock += 3_412;
    const reply = arbiter.submitMove(EQ6, 'g_p_01', 3);
    expect(reply).toEqual({
      status: 400,
      body: {
        ok: false,
        error: 'timeout',
        message: 'La jugada llegó 412 ms después del límite.',
      },
    });
    expect(arbiter.getGame('g_p_01')?.result).toMatchObject({ winner: 2, reason: 'timeout' });
  });

  it('justo en el límite todavía se acepta', () => {
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    arbiter.nextTurn(EQ6);
    clock += 3_000;
    expect(arbiter.submitMove(EQ6, 'g_p_01', 3).status).toBe(200);
  });

  it('si el plazo venció sin jugada, la partida se cierra y una jugada posterior recibe timeout', () => {
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    arbiter.nextTurn(EQ6);
    clock += 3_500;
    arbiter.sweep();
    expect(arbiter.getGame('g_p_01')?.result?.reason).toBe('timeout');

    clock += 100;
    expect(body(arbiter.submitMove(EQ6, 'g_p_01', 3))).toMatchObject({
      error: 'timeout',
      message: 'La jugada llegó 600 ms después del límite.',
    });
  });

  it('un turno sin recoger en 30 s se pierde por ausencia', () => {
    arbiter.createPractice(EQ6, 'casa-basico', 1);
    clock += 29_999;
    arbiter.sweep();
    expect(arbiter.getGame('g_p_01')?.result).toBeNull();

    clock += 2;
    expect(arbiter.nextTurn(EQ6)).toBeNull();
    expect(arbiter.getGame('g_p_01')?.result).toMatchObject({ winner: 2, reason: 'absent' });
  });
});

describe('equipo: liga, prácticas y entrega', () => {
  it('la tabla cuenta solo partidas de liga: victoria 3, derrota 0', () => {
    const league = arbiter.createGame('league', seat(EQ6), seat(RIVAL));
    playTeams(league.id, [0, 7, 1, 7, 2, 7, 3]);
    const friendly = arbiter.createGame('friendly', seat(EQ6), seat(RIVAL));
    playTeams(friendly.id, [7, 0, 7, 0, 7, 0, 6, 0]);

    expect(arbiter.standings()).toEqual([
      expect.objectContaining({ position: 1, played: 1, won: 1, points: 3 }),
      expect.objectContaining({ position: 2, team: { id: 'otro', name: 'Otro', members: [] } }),
      expect.objectContaining({ position: 3, played: 1, lost: 1, points: 0 }),
    ]);
  });

  it('en una partida de liga contra la casa solo suma el equipo', () => {
    arbiter.createGame('league', seat(EQ6), { type: 'house', bot: 'casa-basico' });
    clock += 30_001; // ausencia: el equipo pierde
    const eq6 = arbiter.standings().find((row) => row.team.id === 'eq6');
    expect(eq6).toMatchObject({ played: 1, lost: 1, points: 0 });
  });

  it('423 si las prácticas están cerradas', () => {
    arbiter.practiceOpen = false;
    expect(arbiter.createPractice(EQ6, 'casa-basico', 1)).toMatchObject({
      status: 423,
      body: { error: 'practice_closed' },
    });
  });

  it('registra la entrega con hora y la última es la que vale', () => {
    expect(arbiter.submissionOf(EQ6.id)).toBeNull();
    arbiter.registerSubmission(EQ6, { repo_url: 'https://github.com/x/y', commit: 'aaaaaaa' });
    clock += 1000;
    const reply = arbiter.registerSubmission(EQ6, {
      repo_url: 'https://github.com/x/y',
      commit: 'bbbbbbb',
    });
    expect(reply.body).toEqual({
      repo_url: 'https://github.com/x/y',
      commit: 'bbbbbbb',
      registered_at: '2026-11-05T15:00:01.000Z',
    });
    expect(arbiter.submissionOf(EQ6.id)).toEqual(reply.body);
  });

  it('423 si las entregas están cerradas', () => {
    arbiter.submissionsOpen = false;
    const reply = arbiter.registerSubmission(EQ6, { repo_url: 'https://x.y', commit: 'aaaaaaa' });
    expect(reply).toMatchObject({ status: 423, body: { error: 'submissions_closed' } });
  });
});
