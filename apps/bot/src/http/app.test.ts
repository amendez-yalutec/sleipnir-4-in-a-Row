/**
 * API de la app (PLAN_BACKEND.md §7 y §9) y casos de abuso del pentest interno
 * (PLAN_CALIDAD_SEGURIDAD.md §4.5, #1–#5, #7 y #10), con `app.inject()` sin abrir puertos.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiErrorSchema, type GameState, gameStateSchema, healthSchema } from '@equipo6/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { fallbackChooser } from '../chooser/fallback.ts';
import type { MoveChooser } from '../chooser/types.ts';
import { BusyError } from '../chooser/worker-chooser.ts';
import { type AppServerOptions, buildAppServer } from './app.ts';

const DRAW_GAME = [
  3, 5, 4, 0, 7, 1, 0, 3, 3, 0, 2, 3, 4, 6, 4, 0, 6, 0, 5, 1, 2, 4, 0, 0, 2, 7, 6, 7, 4, 7, 3, 5, 5,
  3, 4, 5, 7, 3, 6, 2, 5, 4, 5, 1, 1, 2, 7, 1, 1, 6, 7, 6, 2, 6, 1, 2,
];

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function start(options: Partial<AppServerOptions> = {}) {
  const app = await buildAppServer({
    version: '0.1.0-prueba',
    chooser: fallbackChooser,
    think: { softMs: 50, hardMs: 80 },
    arbiterStatus: () => ({ enabled: false, state: 'disabled', lastTurnAt: null, gamesPlayed: 0 }),
    log: () => undefined,
    ...options,
  });
  apps.push(app);
  return app;
}

const post = (app: FastifyInstance, url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as object });

function expectApiError(
  response: { statusCode: number; json: () => unknown; body: string },
  status: number,
  error: string,
) {
  expect(response.statusCode).toBe(status);
  expect(apiErrorSchema.parse(response.json())).toMatchObject({ error });
  // Sin stack traces ni rutas internas en ningún error.
  expect(response.body).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/);
}

describe('POST /api/game/state', () => {
  it('estado inicial y después de jugadas, con el formato del árbitro', async () => {
    const app = await start();
    const empty = gameStateSchema.parse((await post(app, '/api/game/state', { moves: [] })).json());
    expect(empty).toMatchObject({
      toMove: 1,
      status: 'playing',
      legalMoves: [0, 1, 2, 3, 4, 5, 6, 7],
    });

    const state = gameStateSchema.parse(
      (await post(app, '/api/game/state', { moves: [3, 3, 4] })).json(),
    );
    expect(state.board[0]?.[3]).toBe(1); // fila 0 abajo
    expect(state.board[1]?.[3]).toBe(2);
    expect(state.toMove).toBe(2);
  });

  it('victoria con las casillas ganadoras', async () => {
    const app = await start();
    const state = (
      await post(app, '/api/game/state', { moves: [0, 0, 1, 1, 2, 2, 3] })
    ).json<GameState>();
    expect(state).toMatchObject({ status: 'won', winner: 1, legalMoves: [] });
    expect(state.winningCells).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
  });

  it('empate con el tablero lleno', async () => {
    const app = await start();
    const state = (await post(app, '/api/game/state', { moves: DRAW_GAME })).json<GameState>();
    expect(state).toMatchObject({ status: 'draw', winner: null });
  });

  it('deshacer = mandar la lista con dos jugadas menos', async () => {
    const app = await start();
    const before = (await post(app, '/api/game/state', { moves: [3, 4] })).json<GameState>();
    const after = (await post(app, '/api/game/state', { moves: [3, 4, 2, 5] })).json<GameState>();
    const undone = (
      await post(app, '/api/game/state', { moves: after.moves.slice(0, -2) })
    ).json<GameState>();
    expect(undone).toEqual(before);
  });

  it('jugada ilegal → 400 illegal_move que dice cuál', async () => {
    const app = await start();
    const full = await post(app, '/api/game/state', { moves: [0, 0, 0, 0, 0, 0, 0, 0] });
    expectApiError(full, 400, 'illegal_move');
    expect(full.json<{ message: string }>().message).toBe('La jugada 8 va a una columna llena.');
    const over = await post(app, '/api/game/state', { moves: [0, 0, 1, 1, 2, 2, 3, 4] });
    expectApiError(over, 400, 'illegal_move');
  });
});

describe('POST /api/game/bot-move', () => {
  it('el bot abre la partida con una jugada legal e informa cómo pensó', async () => {
    const app = await start();
    const state = gameStateSchema.parse(
      (await post(app, '/api/game/bot-move', { moves: [], level: 'hard' })).json(),
    );
    expect(state.moves).toHaveLength(1);
    expect(state.bot).toMatchObject({ column: state.moves[0], level: 'hard' });
    expect(state.toMove).toBe(2);
  });

  it('gana en 1 cuando puede (también en Fácil si no le toca azar)', async () => {
    const app = await start();
    for (const level of ['medium', 'hard'] as const) {
      const state = (
        await post(app, '/api/game/bot-move', { moves: [0, 6, 1, 6, 2, 5], level })
      ).json<GameState>();
      expect(state).toMatchObject({ status: 'won', winner: 1 });
    }
  });

  it('con la partida terminada → 400 illegal_move', async () => {
    const app = await start();
    const response = await post(app, '/api/game/bot-move', {
      moves: [0, 0, 1, 1, 2, 2, 3],
      level: 'easy',
    });
    expectApiError(response, 400, 'illegal_move');
  });

  it('si la búsqueda falla, juega el respaldo; si está ocupada, 429 busy', async () => {
    const broken: MoveChooser = { choose: () => Promise.reject(new Error('worker caído')) };
    const app = await start({ chooser: broken });
    const state = (
      await post(app, '/api/game/bot-move', { moves: [0, 0, 1, 1, 2, 2], level: 'hard' })
    ).json<GameState>();
    expect(state.bot?.column).toBe(3); // el respaldo también gana en 1

    const busy: MoveChooser = { choose: () => Promise.reject(new BusyError('ocupado')) };
    const busyApp = await start({ chooser: busy });
    expectApiError(
      await post(busyApp, '/api/game/bot-move', { moves: [], level: 'hard' }),
      429,
      'busy',
    );
  });

  it('una elección fuera de las jugadas legales se reemplaza (invariante 3 también en la app)', async () => {
    const wild: MoveChooser = { choose: () => Promise.resolve({ column: 9 }) };
    const app = await start({ chooser: wild });
    const state = (
      await post(app, '/api/game/bot-move', { moves: [], level: 'hard' })
    ).json<GameState>();
    expect(state.bot?.column).toBe(3);
  });
});

describe('GET /api/health', () => {
  it('versión y estado del ciclo del torneo', async () => {
    const app = await start({
      arbiterStatus: () => ({
        enabled: true,
        state: 'playing',
        lastTurnAt: '2026-11-05T15:00:00.000Z',
        gamesPlayed: 4,
      }),
    });
    const health = healthSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/health' })).json(),
    );
    expect(health).toMatchObject({
      ok: true,
      version: '0.1.0-prueba',
      arbiter: { gamesPlayed: 4 },
    });
  });
});

describe('pentest interno (§4.5)', () => {
  it.each([8, -1, 3.5, '3', null])('#1 columna %j → 400 validation', async (column) => {
    const app = await start();
    expectApiError(await post(app, '/api/game/state', { moves: [column] }), 400, 'validation');
    expectApiError(
      await post(app, '/api/game/bot-move', { moves: [column], level: 'hard' }),
      400,
      'validation',
    );
  });

  it('#1 nivel desconocido o campos de más → 400 validation', async () => {
    const app = await start();
    expectApiError(
      await post(app, '/api/game/bot-move', { moves: [], level: 'imposible' }),
      400,
      'validation',
    );
    expectApiError(
      await post(app, '/api/game/state', { moves: [], admin: true }),
      400,
      'validation',
    );
  });

  it('#2 57 o 10,000 jugadas → 400; cuerpo de 1 MB → 413', async () => {
    const app = await start();
    expectApiError(
      await post(app, '/api/game/state', { moves: Array<number>(57).fill(0) }),
      400,
      'validation',
    );
    const huge = await post(app, '/api/game/state', { moves: Array<number>(10_000).fill(0) });
    expect([400, 413]).toContain(huge.statusCode);
    expectApiError(
      await post(app, '/api/game/state', { moves: [], pad: 'x'.repeat(1024 * 1024) }),
      413,
      'validation',
    );
  });

  it.each([
    '{"__proto__":{"admin":true},"moves":[]}',
    '{"constructor":{"prototype":{"x":1}},"moves":[]}',
  ])('#3 contaminación de prototipo %s → 400', async (payload) => {
    const app = await start();
    const response = await app.inject({
      method: 'POST',
      url: '/api/game/state',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expectApiError(response, 400, 'validation');
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it('#4 JSON mal formado → 400; Content-Type incorrecto → 415; sin detalles internos', async () => {
    const app = await start();
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/game/state',
      headers: { 'content-type': 'application/json' },
      payload: '{"moves": [3,',
    });
    expectApiError(malformed, 400, 'validation');
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/xml']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/state',
        headers: { 'content-type': type },
        payload: 'moves=3',
      });
      expectApiError(response, 415, 'validation');
    }
  });

  it('#5 límite por IP en bot-move: pasan 5 por minuto y luego 429 rate_limited', async () => {
    const app = await start({ rateLimit: { max: 100, botMoveMax: 5 } });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push((await post(app, '/api/game/bot-move', { moves: [], level: 'easy' })).statusCode);
    }
    expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429]);
    const limited = await post(app, '/api/game/bot-move', { moves: [], level: 'easy' });
    expectApiError(limited, 429, 'rate_limited');
    // El límite de bot-move no bloquea el resto de la API.
    expect((await post(app, '/api/game/state', { moves: [] })).statusCode).toBe(200);
  });

  it('#5 una ráfaga simultánea nunca supera el límite', async () => {
    const app = await start({ rateLimit: { max: 100, botMoveMax: 5 } });
    const burst = await Promise.all(
      Array.from({ length: 50 }, () =>
        post(app, '/api/game/bot-move', { moves: [], level: 'easy' }),
      ),
    );
    const ok = burst.filter((response) => response.statusCode === 200).length;
    expect(ok).toBeLessThanOrEqual(5);
    expect(burst.every((r) => r.statusCode === 200 || r.statusCode === 429)).toBe(true);
  });

  it('#7 path traversal en los estáticos → 404 y nunca el archivo', async () => {
    const root = mkdtempSync(join(tmpdir(), 'equipo6-web-'));
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html><title>app</title>');
    writeFileSync(join(root, '.env'), 'TEAM_TOKEN=SECRETO-DE-PRUEBA');
    writeFileSync(join(root, 'dist', '.env'), 'TEAM_TOKEN=SECRETO-DE-PRUEBA');
    const app = await start({ webDir: join(root, 'dist') });

    expect((await app.inject({ method: 'GET', url: '/' })).body).toContain('<title>app</title>');
    for (const url of ['/../.env', '/%2e%2e/.env', '/%2e%2e%2f.env', '/..%2f.env', '/.env']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
      expect(response.body).not.toContain('SECRETO');
    }
  });

  it('#10 headers de seguridad: CSP estricta, nosniff, frame-ancestors; sin CORS', async () => {
    const app = await start();
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://evil.example' },
    });
    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('rutas desconocidas → 404 not_found en JSON', async () => {
    const app = await start();
    expectApiError(await app.inject({ method: 'GET', url: '/api/admin' }), 404, 'not_found');
  });
});
