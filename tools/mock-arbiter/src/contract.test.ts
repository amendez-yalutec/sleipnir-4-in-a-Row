/**
 * Pruebas de contrato: cada respuesta del árbitro simulado se valida con ajv contra los esquemas de
 * `spec/arbitro-openapi.json`. El jueves se reemplaza el archivo por el definitivo y estas pruebas
 * muestran qué cambió (PLAN_BACKEND.md §6).
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockArbiter } from './arbiter.ts';
import type { TeamInfo } from './game.ts';
import { describeErrors, responseExamples, responseSchema, schemaAt } from './openapi.ts';
import { buildMockServer } from './server.ts';

const EQ6: TeamInfo = { id: 'eq6', name: 'Equipo 6', token: 't-eq6', members: ['Ana', 'Beto'] };
const RIVAL: TeamInfo = { id: 'rival', name: 'Rival', token: 't-rival', members: [] };
const AUTH = { authorization: `Bearer ${EQ6.token}` };
const RIVAL_AUTH = { authorization: `Bearer ${RIVAL.token}` };

let clock = Date.parse('2026-11-05T15:00:00.000Z');
let app: FastifyInstance;
let arbiter: MockArbiter;

beforeEach(() => {
  ({ app, arbiter } = buildMockServer({ teams: [EQ6, RIVAL], now: () => clock }));
});
afterEach(() => app.close());

function expectSchema(validate: ReturnType<typeof schemaAt>, value: unknown) {
  const valid = validate(value);
  expect(valid, describeErrors(validate)).toBe(true);
}

/** Hace la petición y valida el cuerpo contra la respuesta documentada de esa ruta y estado. */
async function call(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  specPath: string,
  status: number,
  options: { headers?: Record<string, string>; payload?: object } = {},
) {
  const response = await app.inject({ method, url, ...options });
  expect(response.statusCode).toBe(status);
  const json: unknown = response.json();
  expectSchema(responseSchema(specPath, method.toLowerCase(), status), json);
  return json as Record<string, unknown>;
}

const practice = (first: 1 | 2 = 1) =>
  call('POST', '/api/practice', '/api/practice', 201, {
    headers: AUTH,
    payload: { opponent: 'casa-basico', first },
  });

const move = (gameId: string, column: number, status: number, headers = AUTH) =>
  call('POST', '/api/move', '/api/move', status, { headers, payload: { game_id: gameId, column } });

async function teamsGame(columns: readonly number[]) {
  const created = await app.inject({
    method: 'POST',
    url: '/_mock/games',
    payload: { first: 'eq6', second: 'rival', kind: 'league' },
  });
  const { game_id } = created.json<{ game_id: string }>();
  const replies = [];
  for (const [i, column] of columns.entries()) {
    replies.push(await move(game_id, column, 200, i % 2 === 0 ? AUTH : RIVAL_AUTH));
  }
  return { gameId: game_id, last: replies.at(-1) };
}

describe('GET /api/next', () => {
  it('turno', async () => {
    await practice(2);
    const turn = await call('GET', '/api/next?wait=0', '/api/next', 200, { headers: AUTH });
    expect(turn.status).toBe('turn');
  });

  it('idle', async () => {
    const idle = await call('GET', '/api/next?wait=0', '/api/next', 200, { headers: AUTH });
    expect(idle).toEqual({ status: 'idle' });
  });

  it('401 sin token o con token inválido', async () => {
    await call('GET', '/api/next?wait=0', '/api/next', 401);
    await call('GET', '/api/next?wait=0', '/api/next', 401, {
      headers: { authorization: 'Bearer otro' },
    });
  });
});

describe('POST /api/move', () => {
  it('200 playing, won y draw', async () => {
    const { game_id } = await practice();
    expect((await move(game_id as string, 3, 200)).state).toBe('playing');

    expect((await teamsGame([0, 7, 1, 7, 2, 7, 3])).last?.state).toBe('won');
    const draw = [
      3, 5, 4, 0, 7, 1, 0, 3, 3, 0, 2, 3, 4, 6, 4, 0, 6, 0, 5, 1, 2, 4, 0, 0, 2, 7, 6, 7, 4, 7, 3,
      5, 5, 3, 4, 5, 7, 3, 6, 2, 5, 4, 5, 1, 1, 2, 7, 1, 1, 6, 7, 6, 2, 6, 1, 2,
    ];
    expect((await teamsGame(draw)).last?.state).toBe('draw');
  });

  it('400 illegal_move y timeout', async () => {
    const full = await teamsGame([0, 0, 0, 0, 0, 0, 0]);
    expect((await move(full.gameId, 0, 400, RIVAL_AUTH)).error).toBe('illegal_move');

    const { game_id } = await practice();
    await app.inject({ method: 'GET', url: '/api/next?wait=0', headers: AUTH });
    clock += 3_500;
    expect((await move(game_id as string, 3, 400)).error).toBe('timeout');
  });

  it('409 not_your_turn y unknown_game', async () => {
    const { game_id } = await practice();
    expect((await move(game_id as string, 3, 409, RIVAL_AUTH)).error).toBe('not_your_turn');
    expect((await move('no-existe', 3, 409)).error).toBe('unknown_game');
  });

  it('401', async () => {
    await move('g', 0, 401, { authorization: 'Bearer x' });
  });
});

describe('POST /api/practice', () => {
  it('201 y 423', async () => {
    await practice();
    arbiter.practiceOpen = false;
    await call('POST', '/api/practice', '/api/practice', 423, {
      headers: AUTH,
      payload: { opponent: 'casa-aleatorio' },
    });
  });
});

describe('equipo', () => {
  it('GET /api/me sin entrega y con turnos pendientes', async () => {
    await practice();
    const me = await call('GET', '/api/me', '/api/me', 200, { headers: AUTH });
    expect(me.pending_turns).toHaveLength(1);
    expect(me.submission).toBeNull();
  });

  it('PUT /api/me/submission 200 y luego aparece en /api/me; 423 al cerrar', async () => {
    const payload = { repo_url: 'https://github.com/equipo6/cuatro', commit: 'a1b2c3d4e5f6' };
    await call('PUT', '/api/me/submission', '/api/me/submission', 200, { headers: AUTH, payload });
    const me = await call('GET', '/api/me', '/api/me', 200, { headers: AUTH });
    expect(me.submission).toMatchObject(payload);

    arbiter.submissionsOpen = false;
    const closed = await app.inject({
      method: 'PUT',
      url: '/api/me/submission',
      headers: AUTH,
      payload,
    });
    expect(closed.statusCode).toBe(423);
    expectSchema(schemaAt('#/components/schemas/Error'), closed.json());
  });
});

describe('públicas', () => {
  it('GET /api/games/{id} en curso y terminada', async () => {
    const { game_id } = await practice(2);
    const url = `/api/games/${game_id as string}`;
    expect((await call('GET', url, '/api/games/{game_id}', 200)).status).toBe('playing');

    const { gameId } = await teamsGame([0, 7, 1, 7, 2, 7, 3]);
    const finished = await call('GET', `/api/games/${gameId}`, '/api/games/{game_id}', 200);
    expect(finished.result).toMatchObject({ winner: 1, reason: 'connect4' });

    const missing = await app.inject({ method: 'GET', url: '/api/games/no-existe' });
    expect(missing.statusCode).toBe(404);
  });

  it('GET /api/standings', async () => {
    await teamsGame([0, 7, 1, 7, 2, 7, 3]);
    const table = await call('GET', '/api/standings', '/api/standings', 200);
    expect(table.standings).toHaveLength(2);
  });
});

describe('errores de validación usan el esquema Error', () => {
  it.each([
    ['GET', '/api/next?wait=99', undefined],
    ['POST', '/api/move', { game_id: 'g', column: 8 }],
    ['POST', '/api/practice', { opponent: 'casa-experto' }],
    ['PUT', '/api/me/submission', { repo_url: 'no-es-url', commit: 'abc' }],
  ] as const)('%s %s', async (method, url, payload) => {
    const response = await app.inject({ method, url, headers: AUTH, ...(payload && { payload }) });
    expect(response.statusCode).toBe(400);
    expectSchema(schemaAt('#/components/schemas/Error'), response.json());
    expect(response.json()).toMatchObject({ error: 'validation' });
  });
});

describe('los ejemplos del propio OpenAPI (1.0.1)', () => {
  it.each([
    ['/api/next', 'get', 200],
    ['/api/move', 'post', 200],
    ['/api/move', 'post', 400],
    ['/api/move', 'post', 409],
    ['/api/practice', 'post', 201],
    ['/api/practice', 'post', 400],
    ['/api/practice', 'post', 423],
    ['/api/me', 'get', 200],
    ['/api/me/submission', 'put', 400],
    // En 0.9.0 este ejemplo usaba team_id y el esquema exigía id; 1.0.1 lo corrigió (PlayerRef).
    ['/api/games/{game_id}', 'get', 200],
    ['/api/games/{game_id}', 'get', 404],
    ['/api/health', 'get', 200],
  ] as const)('%s %s %i cumplen su esquema', (path, method, status) => {
    const examples = responseExamples(path, method, status);
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) expectSchema(responseSchema(path, method, status), example);
  });

  it('los punteros inexistentes fallan con un mensaje claro', () => {
    expect(() => schemaAt('#/components/schemas/NoExiste')).toThrow('NoExiste');
    expect(() => responseSchema('/api/next', 'get', 500)).toThrow('no documentada');
    expect(() => schemaAt('#/info/title/x')).toThrow('no tiene');
    expect(responseExamples('/api/standings', 'get', 200)).toEqual([]);
    expect(responseExamples('/api/games/{game_id}', 'get', 418)).toEqual([]);
  });
});

describe('novedades del OpenAPI 1.0.1', () => {
  it('POST /api/practice sin rival: por defecto casa-basico', async () => {
    const created = await call('POST', '/api/practice', '/api/practice', 201, {
      headers: AUTH,
      payload: {},
    });
    const game = await call(
      'GET',
      `/api/games/${created.game_id as string}`,
      '/api/games/{game_id}',
      200,
    );
    expect(game.players).toMatchObject({ '2': { team_id: 'casa-basico', house: true } });
  });

  it('400 documentados: rival inválido y entrega con commit o repo que no cumplen el patrón', async () => {
    await call('POST', '/api/practice', '/api/practice', 400, {
      headers: AUTH,
      payload: { opponent: 'casa-experto' },
    });
    for (const payload of [
      { repo_url: 'https://github.com/equipo6/cuatro', commit: 'no-es-hex' },
      { repo_url: 'https://gitlab.com/equipo6/cuatro', commit: 'a1b2c3d' },
    ]) {
      await call('PUT', '/api/me/submission', '/api/me/submission', 400, {
        headers: AUTH,
        payload,
      });
    }
  });

  it('GET /api/me y /api/standings traen la fase', async () => {
    const me = await call('GET', '/api/me', '/api/me', 200, { headers: AUTH });
    expect(me.phase).toBe('practice');
    arbiter.practiceOpen = false;
    arbiter.submissionsOpen = false;
    expect((await call('GET', '/api/standings', '/api/standings', 200)).phase).toBe('frozen');
  });

  it('GET /api/games: lista sin tablero, la más reciente primero, con filtro y límite', async () => {
    await practice();
    await teamsGame([0, 7, 1, 7, 2, 7, 3]);
    const all = (await call('GET', '/api/games', '/api/games', 200)) as unknown as {
      game_id: string;
      kind: string;
      board?: unknown;
    }[];
    expect(all.map((game) => game.kind)).toEqual(['league', 'practice']);
    expect(all.every((game) => game.board === undefined)).toBe(true);

    const league = (await call(
      'GET',
      '/api/games?kind=practice&limit=1',
      '/api/games',
      200,
    )) as unknown as unknown[];
    expect(league).toHaveLength(1);
    for (const url of ['/api/games?kind=raro', '/api/games?limit=0', '/api/games?limit=501']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(400);
    }
  });

  it('derrotas que no son cuatro en línea traen forfeited_by y el detalle', async () => {
    const full = await teamsGame([0, 0, 0, 0, 0, 0, 0]);
    await move(full.gameId, 0, 400, RIVAL_AUTH);
    const illegal = await call('GET', `/api/games/${full.gameId}`, '/api/games/{game_id}', 200);
    expect(illegal.result).toMatchObject({ reason: 'illegal_move', forfeited_by: 2, column: 0 });

    const { game_id } = await practice();
    await app.inject({ method: 'GET', url: '/api/next?wait=0', headers: AUTH });
    clock += 3_500;
    arbiter.sweep();
    const late = await call('GET', `/api/games/${game_id as string}`, '/api/games/{game_id}', 200);
    expect(late.result).toMatchObject({ reason: 'timeout', forfeited_by: 1, ms: 3_500 });

    const absent = await practice();
    clock += 30_001;
    const gone = await call(
      'GET',
      `/api/games/${absent.game_id as string}`,
      '/api/games/{game_id}',
      200,
    );
    expect(gone.result).toMatchObject({ reason: 'absent', forfeited_by: 1, waited_ms: 30_001 });
  });

  it('GET /api/health, /api/openapi.json (con la URL del mock) y /api/state', async () => {
    await call('GET', '/api/health', '/api/health', 200);
    const document = await call('GET', '/api/openapi.json', '/api/openapi.json', 200);
    expect(document.info).toMatchObject({ version: '1.0.1' });
    expect(document.servers).toEqual([
      { url: 'http://localhost:80', description: 'Árbitro simulado' },
    ]);
    await practice(2);
    const state = await call('GET', '/api/state', '/api/state', 200);
    expect(state).toMatchObject({
      phase: 'practice',
      live: [expect.objectContaining({ kind: 'practice' })],
    });
  });
});
