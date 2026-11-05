import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { TeamInfo } from './game.ts';
import { parseWait } from './routes.ts';
import { type MockServerOptions, buildMockServer } from './server.ts';

const EQ6: TeamInfo = { id: 'eq6', name: 'Equipo 6', token: 't-eq6', members: [] };
const RIVAL: TeamInfo = { id: 'rival', name: 'Rival', token: 't-rival', members: [] };
const AUTH = { authorization: `Bearer ${EQ6.token}` };

const servers: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
});

function start(options: Partial<MockServerOptions> = {}) {
  const built = buildMockServer({ teams: [EQ6, RIVAL], ...options });
  servers.push(built.app);
  return built;
}

describe('parseWait', () => {
  it('usa 20 s por defecto y acepta enteros de 0 a 25', () => {
    expect(parseWait({})).toBe(20);
    expect(parseWait(undefined)).toBe(20);
    expect(parseWait({ wait: '0' })).toBe(0);
    expect(parseWait({ wait: '25' })).toBe(25);
  });

  it.each(['26', '-1', '1.5', 'abc', ''])('rechaza wait=%s', (wait) => {
    expect(parseWait({ wait })).toBeNull();
  });

  it('rechaza wait repetido en el query', () => {
    expect(parseWait({ wait: ['1', '2'] })).toBeNull();
  });
});

describe('long polling', () => {
  it('retiene la conexión y responde en cuanto aparece un turno', async () => {
    const { app } = start();
    const started = Date.now();
    const pending = app.inject({ method: 'GET', url: '/api/next?wait=5', headers: AUTH });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await app.inject({
      method: 'POST',
      url: '/api/practice',
      headers: AUTH,
      payload: { opponent: 'casa-basico' },
    });

    const response = await pending;
    expect(response.json()).toMatchObject({ status: 'turn', turn: 1 });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('si no aparece turno, responde idle al vencer wait', async () => {
    const { app } = start();
    const started = Date.now();
    const response = await app.inject({ method: 'GET', url: '/api/next?wait=1', headers: AUTH });
    expect(response.json()).toEqual({ status: 'idle' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
  });

  it('un turno de otro equipo no despierta la espera', async () => {
    const { app, arbiter } = start();
    const pending = app.inject({ method: 'GET', url: '/api/next?wait=1', headers: AUTH });
    arbiter.createPractice(RIVAL, 'casa-basico', 1);
    expect((await pending).json()).toEqual({ status: 'idle' });
  });
});

describe('errores del servidor con el formato del OpenAPI', () => {
  it('JSON inválido → 400 validation', async () => {
    const { app } = start();
    const response = await app.inject({
      method: 'POST',
      url: '/api/move',
      headers: { ...AUTH, 'content-type': 'application/json' },
      payload: '{no es json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ ok: false, error: 'validation' });
  });

  it('cuerpo de más de 16 KiB → 413', async () => {
    const { app } = start();
    const response = await app.inject({
      method: 'POST',
      url: '/api/move',
      headers: AUTH,
      payload: { game_id: 'x'.repeat(20_000), column: 1 },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ ok: false, error: 'validation' });
  });

  it.each([
    ['POST', '/api/practice'],
    ['GET', '/api/me'],
    ['PUT', '/api/me/submission'],
  ] as const)('%s %s sin token → 401', async (method, url) => {
    const { app } = start();
    const response = await app.inject({ method, url, payload: {} });
    expect(response.statusCode).toBe(401);
  });
});

describe('ruta del mock /_mock/games', () => {
  it('crea partidas entre equipos o contra la casa', async () => {
    const { app, arbiter } = start();
    const created = await app.inject({
      method: 'POST',
      url: '/_mock/games',
      payload: { first: 'casa-aleatorio', second: 'eq6' },
    });
    expect(created.statusCode).toBe(201);
    const { game_id } = created.json<{ game_id: string }>();
    expect(arbiter.getGame(game_id)?.kind).toBe('friendly');
    expect(arbiter.nextTurn(EQ6)?.you).toBe(2);
  });

  it.each([
    {},
    { first: 'eq6', second: 'eq6' },
    { first: 'eq6', second: 'nadie' },
    { first: 'eq6', second: 'rival', kind: 'practice' },
    { first: 3, second: 'rival' },
  ])('rechaza %j', async (payload) => {
    const { app } = start();
    const response = await app.inject({ method: 'POST', url: '/_mock/games', payload });
    expect(response.statusCode).toBe(400);
  });
});

describe('inyección de fallas (servidor real)', () => {
  async function listen(options: Partial<MockServerOptions>) {
    const { app } = start(options);
    return app.listen({ port: 0, host: '127.0.0.1' });
  }

  it('latencia: cada petición tarda al menos lo configurado', async () => {
    const url = await listen({ faults: { latencyMs: 150, jitterMs: 20 } });
    const started = Date.now();
    const response = await fetch(`${url}/api/standings`);
    expect(response.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(145);
  });

  it('5xx: con errorRate 1 todas las rutas /api responden 503', async () => {
    const url = await listen({ faults: { errorRate: 1 } });
    expect((await fetch(`${url}/api/standings`)).status).toBe(503);
  });

  it('conexiones cortadas: con dropRate 1 el cliente ve un error de red', async () => {
    const url = await listen({ faults: { dropRate: 1 } });
    await expect(fetch(`${url}/api/standings`)).rejects.toThrow();
  });

  it('las rutas del mock no sufren fallas', async () => {
    const url = await listen({ faults: { errorRate: 1 } });
    const response = await fetch(`${url}/_mock/games`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(400);
  });
});

describe('GET /api/live (Server-Sent Events)', () => {
  it('envía el estado al conectar y otra vez cuando algo cambia', async () => {
    const { app, arbiter } = start();
    const url = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const response = await fetch(`${url}/api/live`, { signal: controller.signal });
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (count: number) => {
      while ((text.match(/event: state/g) ?? []).length < count) {
        const { value } = await reader.read();
        text += decoder.decode(value);
      }
    };
    await readUntil(1);
    expect(text).toContain('"live":[]');

    arbiter.createPractice(EQ6, 'casa-basico', 1);
    await readUntil(2);
    expect(text).toContain('"kind":"practice"');
    controller.abort();
  });
});
