import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildMockServer } from '@equipo6/mock-arbiter';
import { afterEach, describe, expect, it } from 'vitest';
import { ArbiterClient, ArbiterHttpError } from './client.ts';

const TOKEN = 'TOKEN-DE-PRUEBA-NO-REAL-123';
const TEAM = { id: 'eq6', name: 'Equipo 6', token: TOKEN, members: [] };

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function mockArbiter() {
  const built = buildMockServer({ teams: [TEAM] });
  cleanups.push(() => built.app.close());
  const url = await built.app.listen({ port: 0, host: '127.0.0.1' });
  return { ...built, url };
}

/** Servidor HTTP crudo para respuestas que el mock no da: redirecciones, cuerpos enormes, silencios. */
async function rawServer(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const requests: IncomingMessage[] = [];
  const server: Server = createServer((req, res) => {
    requests.push(req);
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ArbiterHttpError);
    expect((error as Error).message).not.toContain(TOKEN);
    return (error as ArbiterHttpError).reason;
  }
  return expect.fail('se esperaba ArbiterHttpError');
}

describe('cliente del árbitro contra el mock', () => {
  it('next y move con el token en el header Authorization', async () => {
    const { url, arbiter } = await mockArbiter();
    arbiter.createPractice(TEAM, 'casa-basico', 1);
    const client = new ArbiterClient({ baseUrl: url, token: TOKEN });

    const next = await client.next(0);
    expect(next.status).toBe(200);
    expect(next.body).toMatchObject({ status: 'turn', game_id: 'g_p_01' });

    const move = await client.move('g_p_01', 3, 1_000);
    expect(move).toEqual({ status: 200, body: { ok: true, state: 'playing', turn: 2 } });
  });

  it('con otro token el árbitro responde 401 (el cliente no lo interpreta)', async () => {
    const { url } = await mockArbiter();
    const response = await new ArbiterClient({ baseUrl: `${url}/`, token: 'otro' }).next(0);
    expect(response.status).toBe(401);
  });

  it('respeta un prefijo de ruta en ARBITRO_URL', async () => {
    const raw = await rawServer((_req, res) => res.end('{"status":"idle"}'));
    await new ArbiterClient({ baseUrl: `${raw.url}/arbitro`, token: TOKEN }).next(1);
    expect(raw.requests[0]?.url).toBe('/arbitro/api/next?wait=1');
  });

  it('jamás envía una columna fuera de 0–7 (invariante 3)', async () => {
    const raw = await rawServer((_req, res) => res.end('{}'));
    const client = new ArbiterClient({ baseUrl: raw.url, token: TOKEN });
    for (const column of [8, -1, 2.5, Number.NaN]) {
      expect(() => client.move('g', column, 1_000)).toThrow(RangeError);
    }
    expect(raw.requests).toHaveLength(0);
  });

  it('no sigue redirecciones: el token nunca llega a otro host', async () => {
    const evil = await rawServer((_req, res) => res.end('{}'));
    const arbiter = await rawServer((_req, res) => {
      res.writeHead(302, { location: `${evil.url}/api/next` }).end();
    });
    const client = new ArbiterClient({ baseUrl: arbiter.url, token: TOKEN });
    expect(await failure(client.next(1))).toBe('redirect');
    expect(evil.requests).toHaveLength(0);
  });

  it('corta respuestas más grandes que el límite, con y sin content-length', async () => {
    const declared = await rawServer((_req, res) => res.end('x'.repeat(5_000)));
    const chunked = await rawServer((_req, res) => {
      res.writeHead(200, { 'transfer-encoding': 'chunked' });
      for (let i = 0; i < 10; i++) res.write('y'.repeat(1_000));
      res.end();
    });
    for (const { url } of [declared, chunked]) {
      const client = new ArbiterClient({ baseUrl: url, token: TOKEN, maxBodyBytes: 2_000 });
      expect(await failure(client.next(1))).toBe('too_large');
    }
  });

  it('un cuerpo que no es JSON llega como undefined', async () => {
    const raw = await rawServer((_req, res) => res.end('<html>'));
    const response = await new ArbiterClient({ baseUrl: raw.url, token: TOKEN }).next(1);
    expect(response).toEqual({ status: 200, body: undefined });
  });

  it('timeout si el árbitro no responde a tiempo', async () => {
    const silent = await rawServer(() => undefined);
    const client = new ArbiterClient({ baseUrl: silent.url, token: TOKEN });
    expect(await failure(client.move('g', 3, 150))).toBe('timeout');
  });

  it('aborted si se cancela desde afuera', async () => {
    const silent = await rawServer(() => undefined);
    const client = new ArbiterClient({ baseUrl: silent.url, token: TOKEN });
    const controller = new AbortController();
    const pending = client.move('g', 3, 5_000, controller.signal);
    setTimeout(() => controller.abort(), 50);
    expect(await failure(pending)).toBe('aborted');
  });

  it('network si no hay nadie escuchando', async () => {
    const client = new ArbiterClient({ baseUrl: 'http://127.0.0.1:9', token: TOKEN });
    expect(await failure(client.next(0))).toBe('network');
  });

  it('expone el host para el arranque, pero no el token', () => {
    const client = new ArbiterClient({ baseUrl: 'https://arbitro.example', token: TOKEN });
    expect(client.host).toBe('arbitro.example');
    expect(JSON.stringify(client)).not.toContain(TOKEN);
  });
});
