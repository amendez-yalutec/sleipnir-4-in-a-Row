/** Rutas para iniciar y detener el bot del torneo desde la web, y sus controles de seguridad. */
import { apiErrorSchema, controlStatusSchema, healthSchema } from '@equipo6/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type LoopClient, TournamentController } from '../arbiter/controller.ts';
import { fallbackChooser } from '../chooser/fallback.ts';
import { buildAppServer } from './app.ts';

const apps: FastifyInstance[] = [];
const controls: TournamentController[] = [];
afterEach(async () => {
  await Promise.all(controls.splice(0).map((control) => control.stop()));
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const idleClient = (): LoopClient => ({
  next: () => Promise.resolve({ status: 200, body: { status: 'idle' } }),
  move: () => Promise.resolve({ status: 200, body: { ok: true, state: 'playing' } }),
});

async function start(withControl = true) {
  const control = new TournamentController({
    chooser: fallbackChooser,
    log: () => undefined,
    waitS: 1,
    think: { softMs: 50, hardMs: 80 },
    makeClient: idleClient,
  });
  controls.push(control);
  const app = await buildAppServer({
    version: 'prueba',
    chooser: fallbackChooser,
    think: { softMs: 50, hardMs: 80 },
    arbiterStatus: () => control.snapshot(),
    log: () => undefined,
    ...(withControl && { control }),
  });
  apps.push(app);
  return app;
}

const body = { url: 'https://arbitro.example', token: 'tok' };

describe('control del bot del torneo', () => {
  it('iniciar y detener la escucha desde la misma computadora', async () => {
    const app = await start();
    const status = async () =>
      controlStatusSchema.parse((await app.inject({ url: '/api/control' })).json());
    expect(await status()).toMatchObject({ running: false });

    const started = await app.inject({ method: 'POST', url: '/api/control/start', payload: body });
    expect(started.statusCode).toBe(200);
    expect(controlStatusSchema.parse(started.json())).toMatchObject({
      running: true,
      arbiterHost: 'arbitro.example',
    });
    expect(started.body).not.toContain('tok"');
    const health = healthSchema.parse((await app.inject({ url: '/api/health' })).json());
    expect(health.arbiter.enabled).toBe(true);

    const again = await app.inject({ method: 'POST', url: '/api/control/start', payload: body });
    expect(again.statusCode).toBe(409);
    expect(apiErrorSchema.parse(again.json()).error).toBe('conflict');

    const stopped = await app.inject({ method: 'POST', url: '/api/control/stop', payload: {} });
    expect(controlStatusSchema.parse(stopped.json())).toMatchObject({ running: false });
  });

  it('valida la URL y el token', async () => {
    const app = await start();
    const missing = await app.inject({
      method: 'POST',
      url: '/api/control/start',
      payload: { url: 'https://a.example' },
    });
    expect(missing.statusCode).toBe(400);
    const http = await app.inject({
      method: 'POST',
      url: '/api/control/start',
      payload: { url: 'http://arbitro.example', token: 't' },
    });
    expect(http.statusCode).toBe(400);
  });

  it('desde otra computadora de la red → 403, aunque escuche en 0.0.0.0', async () => {
    const app = await start();
    const response = await app.inject({
      method: 'POST',
      url: '/api/control/start',
      payload: body,
      remoteAddress: '192.168.1.50',
    });
    expect(response.statusCode).toBe(403);
    expect(apiErrorSchema.parse(response.json()).error).toBe('forbidden');
  });

  it('desde otra página web (Origin distinto) → 403', async () => {
    const app = await start();
    const response = await app.inject({
      method: 'POST',
      url: '/api/control/stop',
      payload: {},
      headers: { origin: 'https://evil.example', host: '127.0.0.1:8080' },
    });
    expect(response.statusCode).toBe(403);
    const same = await app.inject({
      url: '/api/control',
      headers: { origin: 'http://127.0.0.1:8080', host: '127.0.0.1:8080' },
    });
    expect(same.statusCode).toBe(200);
  });

  it('sin controlador las rutas no existen', async () => {
    const app = await start(false);
    expect((await app.inject({ url: '/api/control' })).statusCode).toBe(404);
  });
});
