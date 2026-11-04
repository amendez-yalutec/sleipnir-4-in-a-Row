/**
 * Rutas públicas (sin token) del OpenAPI 1.0.1: partidas, posiciones, latido, el propio OpenAPI y el
 * estado en vivo (snapshot y Server-Sent Events).
 */
import type { FastifyInstance } from 'fastify';
import type { MockArbiter } from './arbiter.ts';
import type { GameKind } from './game.ts';
import { toGameJson, toGameSummary } from './json.ts';
import { specDocument } from './openapi.ts';
import { errorReply } from './replies.ts';

const KINDS: readonly GameKind[] = ['practice', 'friendly', 'league', 'third_place', 'final'];
const LIVE_BATCH_MS = 150;
const LIVE_PING_MS = 15_000;

/** `?kind=&limit=` de `GET /api/games`; `null` si no cumplen el OpenAPI. */
export function parseGamesQuery(query: unknown): { kind?: GameKind; limit: number } | null {
  const { kind, limit = '50' } = (query ?? {}) as { kind?: unknown; limit?: unknown };
  const validKind = kind === undefined ? undefined : KINDS.find((k) => k === kind);
  if (kind !== undefined && !validKind) return null;
  if (typeof limit !== 'string' || !/^\d{1,3}$/.test(limit)) return null;
  const n = Number(limit);
  if (n < 1 || n > 500) return null;
  return { ...(validKind && { kind: validKind }), limit: n };
}

/**
 * Snapshot del torneo. El OpenAPI solo dice "object" (fase, anuncio, equipos, posiciones, partidas en
 * curso con tablero, últimos resultados y series); estos nombres de campo son del mock, no del árbitro.
 */
export function stateSnapshot(arbiter: MockArbiter) {
  const games = arbiter.allGames();
  return {
    phase: arbiter.phase,
    announcement: null,
    teams: arbiter.standings().map(({ team }) => ({ id: team.id, name: team.name })),
    standings: arbiter.standings(),
    live: games.filter((game) => !game.result).map(toGameJson),
    recent: games
      .filter((game) => game.result)
      .slice(0, 10)
      .map(toGameSummary),
    series: [],
  };
}

export function registerPublicRoutes(app: FastifyInstance, arbiter: MockArbiter): void {
  app.get('/api/games', (request, reply) => {
    const query = parseGamesQuery(request.query);
    if (!query) {
      const { status, body } = errorReply(400, 'validation', 'kind o limit inválidos.');
      return reply.code(status).send(body);
    }
    return arbiter
      .allGames()
      .filter((game) => !query.kind || game.kind === query.kind)
      .slice(0, query.limit)
      .map(toGameSummary);
  });

  app.get('/api/games/:game_id', (request, reply) => {
    const { game_id } = request.params as { game_id: string };
    const game = arbiter.getGame(game_id);
    if (!game) {
      const { status, body } = errorReply(404, 'unknown_game', 'No existe.');
      return reply.code(status).send(body);
    }
    return toGameJson(game);
  });

  app.get('/api/standings', () => ({ phase: arbiter.phase, standings: arbiter.standings() }));

  app.get('/api/health', () => ({
    ok: true,
    phase: arbiter.phase,
    time: new Date().toISOString(),
  }));

  app.get('/api/openapi.json', (request) => ({
    ...specDocument(),
    servers: [{ url: `${request.protocol}://${request.host}`, description: 'Árbitro simulado' }],
  }));

  app.get('/api/state', () => stateSnapshot(arbiter));

  // SSE: el estado al conectar y en cada cambio (agrupados cada 150 ms); ": ping" cada 15 s.
  app.get('/api/live', (_request, reply) => {
    reply.hijack();
    const out = reply.raw;
    out.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const sendState = () =>
      out.write(`event: state\ndata: ${JSON.stringify(stateSnapshot(arbiter))}\n\n`);
    sendState();

    let batch: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = arbiter.onChange(() => {
      batch ??= setTimeout(() => {
        batch = undefined;
        sendState();
      }, LIVE_BATCH_MS);
    });
    const ping = setInterval(() => out.write(': ping\n\n'), LIVE_PING_MS);
    out.on('close', () => {
      unsubscribe();
      clearInterval(ping);
      clearTimeout(batch);
    });
  });
}
