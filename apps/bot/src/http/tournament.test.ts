/**
 * Repetición de partidas del torneo: proxy de las rutas públicas del árbitro (contra el mock real) y
 * pentest #6 (SSRF): ninguna petición sale a otro host ni lleva token.
 */
import { tournamentGameDetailSchema, tournamentGameListSchema } from '@equipo6/contracts';
import { buildMockServer } from '@equipo6/mock-arbiter';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicArbiter } from '../arbiter/public-client.ts';
import { fallbackChooser } from '../chooser/fallback.ts';
import { type AppServerOptions, buildAppServer } from './app.ts';

const EQ6 = { id: 'eq6', name: 'Equipo 6', token: 'token-local-eq6', members: [] };
const RIVAL = {
  id: 'rival',
  name: '<img src=x onerror=alert(1)>',
  token: 'token-local-rival',
  members: [],
};

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function app(tournament: AppServerOptions['tournament']) {
  const server = await buildAppServer({
    version: 't',
    chooser: fallbackChooser,
    think: { softMs: 50, hardMs: 80 },
    arbiterStatus: () => ({ enabled: false, state: 'disabled', lastTurnAt: null, gamesPlayed: 0 }),
    log: () => undefined,
    ...(tournament && { tournament }),
  });
  closers.push(() => server.close());
  return server;
}

async function mockArbiter() {
  const mock = buildMockServer({ teams: [EQ6, RIVAL] });
  closers.push(() => mock.app.close());
  const url = await mock.app.listen({ port: 0, host: '127.0.0.1' });
  return { ...mock, url };
}

describe('partidas del torneo a través del árbitro (mock)', () => {
  it('lista solo las partidas de nuestro equipo, con nombres tal cual (texto)', async () => {
    const { arbiter, url } = await mockArbiter();
    const ours = arbiter.createGame(
      'friendly',
      { type: 'team', team: EQ6 },
      { type: 'team', team: RIVAL },
    );
    arbiter.createPractice(RIVAL, 'casa-basico', 1); // no es nuestra
    const server = await app({ arbiter: new PublicArbiter({ baseUrl: url }), teamId: 'eq6' });

    const list = tournamentGameListSchema.parse(
      (await server.inject({ method: 'GET', url: '/api/tournament/games' })).json(),
    );
    expect(list.map((game) => game.id)).toEqual([ours.id]);
    expect(list[0]?.players[2].name).toBe('<img src=x onerror=alert(1)>');
  });

  it('detalle: el tablero después de cada jugada y las casillas ganadoras', async () => {
    const { arbiter, url } = await mockArbiter();
    const game = arbiter.createGame(
      'friendly',
      { type: 'team', team: EQ6 },
      { type: 'team', team: RIVAL },
    );
    for (const [i, column] of [0, 7, 1, 7, 2, 7, 3].entries()) {
      arbiter.submitMove(i % 2 === 0 ? EQ6 : RIVAL, game.id, column);
    }
    const server = await app({ arbiter: new PublicArbiter({ baseUrl: url }) });
    const detail = tournamentGameDetailSchema.parse(
      (await server.inject({ method: 'GET', url: `/api/tournament/games/${game.id}` })).json(),
    );
    expect(detail.frames).toHaveLength(8);
    expect(detail.frames[0]?.flat().every((cell) => cell === 0)).toBe(true);
    expect(detail.frames[7]?.[0]).toEqual([1, 1, 1, 1, 0, 0, 0, 2]);
    expect(detail.winningCells).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
    expect(detail.game).toMatchObject({ status: 'finished', winner: 1, reason: 'connect4' });
  });

  it('partida inexistente → 404; árbitro caído o sin configurar → 503', async () => {
    const { url } = await mockArbiter();
    const server = await app({ arbiter: new PublicArbiter({ baseUrl: url }) });
    expect(
      (await server.inject({ method: 'GET', url: '/api/tournament/games/g_nada' })).statusCode,
    ).toBe(404);

    const down = await app({
      arbiter: new PublicArbiter({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 500 }),
    });
    for (const path of ['/api/tournament/games', '/api/tournament/games/g_1']) {
      const response = await down.inject({ method: 'GET', url: path });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: 'tournament_unavailable' });
    }
    const none = await app(undefined);
    expect((await none.inject({ method: 'GET', url: '/api/tournament/games' })).statusCode).toBe(
      503,
    );
    expect(
      (await none.inject({ method: 'GET', url: '/api/tournament/games/g_1' })).statusCode,
    ).toBe(503);
  });

  it('respuestas del árbitro sin forma de partida → 503, sin pasarlas al navegador', async () => {
    const weird = {
      listGames: () => Promise.resolve({ status: 200, body: { no: 'lista' } }),
      getGame: () => Promise.resolve({ status: 200, body: 'html' }),
    };
    const server = await app({ arbiter: weird });
    expect((await server.inject({ method: 'GET', url: '/api/tournament/games' })).statusCode).toBe(
      503,
    );
    expect(
      (await server.inject({ method: 'GET', url: '/api/tournament/games/g_1' })).statusCode,
    ).toBe(503);
  });
});

describe('pentest #6: SSRF en el proxy del torneo', () => {
  it.each(['..%2F..%2Fapi%2Fme', 'http:%2F%2Fevil', '%40evil.com', 'g_1%3Fx%3D1', 'a'.repeat(65)])(
    'game_id %s → 400 y ninguna petición sale',
    async (id) => {
      const requested: string[] = [];
      const spy = ((input: URL | string) => {
        requested.push(String(input));
        return Promise.resolve(new Response('{}'));
      }) as typeof fetch;
      const server = await app({
        arbiter: new PublicArbiter({ baseUrl: 'https://arbitro.example', fetch: spy }),
      });
      const response = await server.inject({ method: 'GET', url: `/api/tournament/games/${id}` });
      expect([400, 404]).toContain(response.statusCode);
      expect(requested).toEqual([]);
    },
  );

  it('las peticiones válidas van solo al host configurado y sin Authorization', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const spy = ((input: URL | string, init?: RequestInit) => {
      seen.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
      return Promise.resolve(
        new Response('[]', { headers: { 'content-type': 'application/json' } }),
      );
    }) as typeof fetch;
    const server = await app({
      arbiter: new PublicArbiter({ baseUrl: 'https://arbitro.example/', fetch: spy }),
    });
    await server.inject({ method: 'GET', url: '/api/tournament/games' });
    await server.inject({ method: 'GET', url: '/api/tournament/games/g_p_01' });
    expect(seen.map((r) => r.url)).toEqual([
      'https://arbitro.example/api/games?limit=200',
      'https://arbitro.example/api/games/g_p_01',
    ]);
    expect(
      seen.every((r) => !Object.keys(r.headers).some((h) => h.toLowerCase() === 'authorization')),
    ).toBe(true);
  });

  it('el cliente público se niega a armar una URL con un game_id inválido', () => {
    const client = new PublicArbiter({ baseUrl: 'https://arbitro.example' });
    expect(() => client.getGame('../me')).toThrow(RangeError);
  });
});
