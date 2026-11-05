/**
 * La API de la app como función de Vercel. Reutiliza `buildAppServer`: mismas rutas, mismos
 * contratos, mismos headers de seguridad y el mismo motor del torneo, así que la app web desplegada
 * juega con el mismo código que el bot (requisito de las bases).
 *
 * Diferencias con `main.ts`, porque una función no es un proceso que corre siempre:
 * - la búsqueda corre en el hilo de la función (`createSearchChooser`) en lugar de un worker; el motor
 *   respeta su propio corte duro (`hardMs`) y la función tiene un `maxDuration` holgado;
 * - no hay ciclo contra el árbitro (invariante 7: el torneo lo juega solo la máquina A);
 * - el rate limit vive en la memoria de cada instancia: protege, pero no es global;
 * - el frontend lo sirve Vercel como archivos estáticos, no Fastify.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { PublicArbiter } from '../arbiter/public-client.ts';
import { createSearchChooser } from '../chooser/search.ts';
import { buildAppServer } from '../http/app.ts';
import { DEFAULT_RATE_LIMIT } from '../http/security.ts';
import { createJsonLogger } from '../log.ts';

type Env = Readonly<Record<string, string | undefined>>;

function positiveInt(env: Env, name: string, fallback: number): number {
  const value = Number(env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Arma la app de Fastify para Vercel a partir de variables de entorno (todas opcionales). */
export function createServerlessApp(env: Env = process.env): Promise<FastifyInstance> {
  const arbiterUrl = env.ARBITRO_URL?.trim();
  return buildAppServer({
    version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'vercel',
    chooser: createSearchChooser(),
    think: {
      softMs: positiveInt(env, 'THINK_SOFT_MS', 1400),
      hardMs: positiveInt(env, 'THINK_HARD_MS', 1800),
    },
    arbiterStatus: () => ({ enabled: false, state: 'disabled', lastTurnAt: null, gamesPlayed: 0 }),
    // Solo rutas públicas del árbitro, sin token (invariante 11), para repetir partidas del torneo.
    ...(arbiterUrl && {
      tournament: {
        arbiter: new PublicArbiter({ baseUrl: arbiterUrl }),
        ...(env.TEAM_ID && { teamId: env.TEAM_ID }),
      },
    }),
    rateLimit: {
      max: positiveInt(env, 'RATE_LIMIT_PER_MIN', DEFAULT_RATE_LIMIT.max),
      botMoveMax: positiveInt(env, 'BOT_MOVE_PER_MIN', DEFAULT_RATE_LIMIT.botMoveMax),
    },
    log: createJsonLogger(),
  });
}

let ready: Promise<FastifyInstance> | null = null;

/** Punto de entrada de la función: una app por instancia, reutilizada entre peticiones. */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= createServerlessApp().then(async (app) => {
    await app.ready();
    return app;
  });
  const app = await ready;
  app.server.emit('request', req, res);
}
