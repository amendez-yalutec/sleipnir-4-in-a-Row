/**
 * Servidor de la app (PLAN_BACKEND.md §7): API sin estado + build del frontend. Escucha en 127.0.0.1
 * salvo que `HOST` diga otra cosa (invariante 12; eso se decide en main.ts). Las pruebas usan
 * `app.inject()` sin abrir puertos.
 */
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { type Health, healthSchema } from '@equipo6/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import type { MoveChooser } from '../chooser/types.ts';
import type { Logger } from '../log.ts';
import { registerGameRoutes } from './game-routes.ts';
import { DEFAULT_RATE_LIMIT, type RateLimitOptions, registerSecurity } from './security.ts';
import { type TournamentDeps, registerTournamentRoutes } from './tournament-routes.ts';

/** Límite de cuerpo: 56 jugadas caben en ~200 bytes (pentest #2). */
export const BODY_LIMIT_BYTES = 4 * 1024;

export interface AppServerOptions {
  readonly version: string;
  readonly chooser: Pick<MoveChooser, 'choose'>;
  readonly think: { readonly softMs: number; readonly hardMs: number };
  readonly arbiterStatus: () => Health['arbiter'];
  readonly tournament?: TournamentDeps;
  /** Carpeta del build del frontend; si no existe, solo se sirve la API. */
  readonly webDir?: string;
  readonly rateLimit?: RateLimitOptions;
  readonly log: Logger;
  readonly now?: () => number;
}

export async function buildAppServer(options: AppServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: BODY_LIMIT_BYTES, forceCloseConnections: true });
  const limits = options.rateLimit ?? DEFAULT_RATE_LIMIT;
  await registerSecurity(app, limits, options.log);

  app.get('/api/health', () =>
    healthSchema.parse({ ok: true, version: options.version, arbiter: options.arbiterStatus() }),
  );
  registerGameRoutes(
    app,
    {
      chooser: options.chooser,
      think: options.think,
      now: options.now ?? (() => performance.now()),
    },
    limits.botMoveMax,
  );
  registerTournamentRoutes(app, options.tournament, options.log);

  if (options.webDir && existsSync(options.webDir)) {
    // `send` normaliza la ruta y no sale de `root` (path traversal, pentest #7).
    await app.register(fastifyStatic, {
      root: options.webDir,
      index: 'index.html',
      dotfiles: 'deny',
    });
  }
  return app;
}
