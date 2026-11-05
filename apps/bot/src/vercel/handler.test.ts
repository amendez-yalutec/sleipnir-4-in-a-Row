/**
 * La API de la app como función de Vercel: misma app de Fastify (`buildAppServer`), configurada por
 * entorno y con la búsqueda del motor en el hilo de la función.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { apiErrorSchema, gameStateSchema, healthSchema } from '@equipo6/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import handler, { createServerlessApp } from './handler.ts';

const FAST = { THINK_SOFT_MS: '40', THINK_HARD_MS: '60' };

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function start(env: Record<string, string> = {}) {
  const app = await createServerlessApp({ ...FAST, ...env });
  apps.push(app);
  return app;
}

const botMove = (app: FastifyInstance, moves: number[]) =>
  app.inject({ method: 'POST', url: '/api/game/bot-move', payload: { moves, level: 'hard' } });

describe('createServerlessApp', () => {
  it('el bot responde con una jugada legal usando el motor del torneo', async () => {
    const app = await start();
    const response = await botMove(app, [3, 3, 4]);
    expect(response.statusCode).toBe(200);
    const state = gameStateSchema.parse(response.json());
    expect(state.moves).toHaveLength(4);
    expect(state.bot?.depth).toBeGreaterThan(0);
    // Con tres en fila abiertos (3 y 4 abajo), el bot debe bloquear en 2 o en 5.
    expect([2, 5]).toContain(state.bot?.column);
  });

  it('valida las jugadas con las reglas del motor', async () => {
    const app = await start();
    const response = await app.inject({
      method: 'POST',
      url: '/api/game/state',
      payload: { moves: [9] },
    });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error).toMatch(/validation|illegal_move/);
  });

  it('health informa la versión del commit y que no juega contra el árbitro', async () => {
    const app = await start({ VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' });
    const health = healthSchema.parse((await app.inject({ url: '/api/health' })).json());
    expect(health.version).toBe('abcdef1');
    expect(health.arbiter).toMatchObject({ enabled: false, state: 'disabled' });
  });

  it('sin ARBITRO_URL las repeticiones del torneo responden 503', async () => {
    const app = await start();
    const response = await app.inject({ url: '/api/tournament/games' });
    expect(response.statusCode).toBe(503);
  });

  it('el límite de jugadas del bot se configura por entorno', async () => {
    const app = await start({ BOT_MOVE_PER_MIN: '1' });
    expect((await botMove(app, [])).statusCode).toBe(200);
    expect((await botMove(app, [])).statusCode).toBe(429);
  });

  it('ignora valores de entorno inválidos y usa los de siempre', async () => {
    const app = await start({ THINK_SOFT_MS: 'rápido', BOT_MOVE_PER_MIN: '-3' });
    expect((await botMove(app, [])).statusCode).toBe(200);
  });

  it('lleva los headers de seguridad de la API', async () => {
    const app = await start();
    const response = await app.inject({ url: '/api/health' });
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('handler de Vercel', () => {
  it('atiende peticiones HTTP reales con la misma app', async () => {
    const server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(response.status).toBe(200);
      expect(healthSchema.parse(await response.json()).ok).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
