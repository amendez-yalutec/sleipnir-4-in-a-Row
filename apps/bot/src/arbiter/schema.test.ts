import { describe, expect, it } from 'vitest';
import { type ArbiterTurn, parseGame, parseGameList, parseMove, parseNext } from './schema.ts';

const EMPTY = Array.from({ length: 7 }, () => Array<number>(8).fill(0));

/** Ejemplo de turno del OpenAPI 0.9.0, tal cual (inconsistente: PLAN_BACKEND.md §5.1). */
const OPENAPI_TURN = {
  status: 'turn',
  game_id: 'g_7f3a',
  match_id: 'm_12',
  kind: 'league',
  you: 2,
  opponent: 'Los Recursivos',
  turn: 9,
  board: [
    [0, 0, 1, 2, 1, 0, 0, 0],
    [0, 0, 2, 1, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 0, 0, 0],
    ...EMPTY.slice(3),
  ],
  moves: [3, 2, 3, 2, 4, 3, 2, 3],
  last_move: { by: 1, column: 3 },
  legal_moves: [0, 1, 2, 3, 4, 5, 6, 7],
  deadline_ms: 3000,
  served_at: '2026-11-05T15:04:05.123Z',
};

function turnOf(body: unknown): ArbiterTurn {
  const result = parseNext({ status: 200, body });
  if (result.kind !== 'turn') return expect.fail(`se esperaba un turno, llegó ${result.kind}`);
  return result.turn;
}

describe('parseNext', () => {
  it('el ejemplo inconsistente del OpenAPI da un turno jugable, con advertencias', () => {
    const turn = turnOf(OPENAPI_TURN);
    expect(turn).toMatchObject({
      gameId: 'g_7f3a',
      kind: 'league',
      you: 2,
      opponent: 'Los Recursivos',
      turn: 9,
      legalMoves: [0, 1, 2, 3, 4, 5, 6, 7],
      deadlineMs: 3000,
    });
    expect(turn.position?.toMove).toBe(2); // manda you, no la paridad
    expect(turn.warnings).toEqual([
      'paridad: 3 fichas del 1 y 3 del 2, pero you = 2',
      'moves no reconstruye board',
    ]);
  });

  it('idle', () => {
    expect(parseNext({ status: 200, body: { status: 'idle' } })).toEqual({ kind: 'idle' });
  });

  it('tolera campos extra y completa los opcionales que falten', () => {
    const turn = turnOf({
      status: 'turn',
      game_id: 'g1',
      you: 1,
      board: EMPTY,
      moves: [],
      legal_moves: [0, 1, 2, 3, 4, 5, 6, 7],
      campo_nuevo: { lo: 'que sea' },
    });
    expect(turn).toMatchObject({ kind: '', opponent: '', turn: null, deadlineMs: 3000 });
    expect(turn.warnings).toEqual([]);
  });

  it('legal_moves con basura: se queda solo con enteros de 0 a 7, sin repetidos', () => {
    const turn = turnOf({ ...OPENAPI_TURN, legal_moves: [9, '3', 3.5, 4, 4, -1, 0, null] });
    expect(turn.legalMoves).toEqual([0, 4]);
    expect(turn.warnings).toContain('legal_moves traía valores fuera de 0–7 o repetidos');
    expect(turn.warnings).toContain('legal_moves no coincide con board');
  });

  it('board imposible o mal formado: sin posición, pero el turno se puede jugar', () => {
    const floating = EMPTY.map((row, r) => (r === 3 ? [1, 0, 0, 0, 0, 0, 0, 0] : row));
    expect(turnOf({ ...OPENAPI_TURN, board: floating }).position).toBeNull();
    const garbage = turnOf({ ...OPENAPI_TURN, board: 'no' });
    expect(garbage.position).toBeNull();
    expect(garbage.warnings).toEqual(['board no es una matriz de números']);
  });

  it('moves con jugadas ilegales queda como advertencia', () => {
    const turn = turnOf({ ...OPENAPI_TURN, moves: [0, 0, 0, 0, 0, 0, 0, 0] });
    expect(turn.warnings).toContain('moves contiene jugadas ilegales');
  });

  it('el nombre del rival es texto: se trunca a 100 caracteres y no se interpreta', () => {
    const turn = turnOf({
      ...OPENAPI_TURN,
      opponent: `<img src=x onerror=alert(1)>${'a'.repeat(500)}`,
    });
    expect(turn.opponent).toHaveLength(100);
    expect(turn.opponent.startsWith('<img src=x onerror=alert(1)>')).toBe(true);
  });

  it.each([
    [{ ...OPENAPI_TURN, game_id: '' }, 'game_id'],
    [{ ...OPENAPI_TURN, you: 3 }, 'you'],
    [{ ...OPENAPI_TURN, legal_moves: 'todas' }, 'legal_moves'],
    [{ status: 'otro' }, 'status'],
    [undefined, '(raíz)'],
  ])('respuesta 200 sin forma de turno → invalid (%#)', (body, field) => {
    const result = parseNext({ status: 200, body });
    expect(result.kind).toBe('invalid');
    expect(result.kind === 'invalid' && result.reason).toContain(field);
  });

  it('401, 5xx y otros estados', () => {
    expect(parseNext({ status: 401, body: {} })).toEqual({ kind: 'unauthorized' });
    expect(parseNext({ status: 503, body: undefined })).toEqual({
      kind: 'server_error',
      status: 503,
    });
    expect(parseNext({ status: 400, body: { ok: false, error: 'validation' } })).toEqual({
      kind: 'unexpected',
      status: 400,
      error: 'validation',
    });
    expect(parseNext({ status: 404, body: 'html' })).toMatchObject({ error: 'desconocido' });
  });
});

describe('parseMove', () => {
  it.each(['playing', 'won', 'draw'] as const)('200 %s', (state) => {
    const body = { ok: true, state, turn: 10, winning_cells: [[0, 2]] };
    expect(parseMove({ status: 200, body })).toEqual({ kind: 'accepted', state, turn: 10 });
  });

  it('200 sin forma → invalid', () => {
    expect(parseMove({ status: 200, body: { ok: true, state: 'raro' } }).kind).toBe('invalid');
  });

  it('400 illegal_move, timeout o códigos no documentados → rejected', () => {
    for (const error of ['illegal_move', 'timeout', 'validation', 'algo_nuevo']) {
      const body = { ok: false, error, message: 'x'.repeat(300) };
      const result = parseMove({ status: 400, body });
      expect(result).toMatchObject({ kind: 'rejected', error });
      expect(result.kind === 'rejected' && result.message).toHaveLength(100);
    }
    expect(parseMove({ status: 400, body: undefined })).toEqual({
      kind: 'rejected',
      error: 'desconocido',
      message: '',
    });
  });

  it('409 no penaliza', () => {
    const body = { ok: false, error: 'not_your_turn', message: 'ya se jugó' };
    expect(parseMove({ status: 409, body })).toEqual({
      kind: 'not_your_turn',
      error: 'not_your_turn',
      message: 'ya se jugó',
    });
  });

  it('401 y 5xx', () => {
    expect(parseMove({ status: 401, body: {} })).toEqual({ kind: 'unauthorized' });
    expect(parseMove({ status: 502, body: {} })).toEqual({ kind: 'server_error', status: 502 });
  });
});

describe('parseGame: players con team_id (OpenAPI 1.0.1) o con id (0.9.0)', () => {
  const game = (players: unknown, status = 'finished') => ({
    game_id: 'g_7f3a',
    status,
    players,
    moves: [{ turn: 1, by: 1, column: 3, ms: 812 }],
  });

  it('acepta PlayerRef con team_id y marca los bots de la casa', () => {
    const parsed = parseGame(
      game({
        1: { team_id: 'eq1', name: 'Equipo 1' },
        2: { team_id: 'casa-basico', name: 'casa-basico', house: true },
      }),
    );
    expect(parsed?.players[1]).toEqual({ id: 'eq1', name: 'Equipo 1', house: false });
    expect(parsed?.players[2]).toEqual({ id: 'casa-basico', name: 'casa-basico', house: true });
    expect(parsed?.moves).toEqual([{ turn: 1, by: 1, column: 3 }]);
  });

  it('acepta el esquema anterior (id)', () => {
    const parsed = parseGame(game({ 1: { id: 'eq1', name: 'A' }, 2: { id: 'eq3', name: 'B' } }));
    expect(parsed?.players[2]).toMatchObject({ id: 'eq3', name: 'B' });
  });

  it('partida de liga programada (scheduled) y estados desconocidos', () => {
    const players = { 1: { team_id: 'a', name: 'A' }, 2: { team_id: 'b', name: 'B' } };
    expect(parseGame(game(players, 'scheduled'))?.status).toBe('scheduled');
    expect(parseGame(game(players, 'otro'))?.status).toBe('playing');
  });

  it('sin id de equipo queda vacío; sin forma de partida → null', () => {
    expect(parseGame(game({ 1: { name: 'A' }, 2: { name: 'B' } }))?.players[1].id).toBe('');
    expect(parseGame({ game_id: 'g' })).toBeNull();
  });
});

describe('parseGame: resultado y lista de /api/games', () => {
  const players = { 1: { team_id: 'eq6', name: 'Equipo 6' }, 2: { team_id: 'eq3', name: 'X' } };
  const base = { game_id: 'g1', kind: 'league', status: 'finished', players, moves: [] };

  it('resultado con celdas ganadoras, o null si viene roto o falta', () => {
    const won = parseGame({
      ...base,
      result: {
        winner: 1,
        reason: 'connect4',
        winning_cells: [
          [0, 0],
          [0, 1],
          [0, 2],
          [0, 3],
        ],
      },
      started_at: '2026-11-05T15:00:00Z',
    });
    expect(won?.result).toEqual({
      winner: 1,
      reason: 'connect4',
      winning_cells: [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ],
    });
    expect(won?.started_at).toBe('2026-11-05T15:00:00Z');
    expect(parseGame({ ...base, result: 'raro' })?.result).toBeNull();
    expect(parseGame(base)?.result).toBeNull();
  });

  it('lista: descarta elementos inválidos y rechaza lo que no es arreglo', () => {
    expect(parseGameList([base, { basura: true }, base])).toHaveLength(2);
    expect(parseGameList({ games: [] })).toBeNull();
  });
});
