/** Servidor HTTP del árbitro simulado (Fastify). Las pruebas usan `app.inject()` sin abrir puertos. */
import Fastify from 'fastify';
import { type ArbiterOptions, MockArbiter } from './arbiter.ts';
import { type FaultOptions, installFaults } from './faults.ts';
import type { GameKind, Seat } from './game.ts';
import { isHouseBot } from './house-bots.ts';
import { createRandom } from './random.ts';
import { errorReply } from './replies.ts';
import { registerPublicRoutes } from './public-routes.ts';
import { registerArbiterRoutes } from './routes.ts';

export interface MockServerOptions extends ArbiterOptions {
  readonly faults?: FaultOptions;
  readonly sweepIntervalMs?: number;
  readonly logger?: boolean;
}

const ADMIN_KINDS: readonly GameKind[] = ['friendly', 'league', 'third_place', 'final'];

export function buildMockServer(options: MockServerOptions) {
  const arbiter = new MockArbiter(options);
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 16 * 1024,
    forceCloseConnections: true,
  });

  installFaults(app, options.faults ?? {}, createRandom((options.seed ?? 6) + 1));

  // JSON inválido, cuerpo demasiado grande o content-type raro: mismo formato de error del OpenAPI.
  app.setErrorHandler((error: { statusCode?: number; message: string }, _request, reply) => {
    const status =
      error.statusCode !== undefined && error.statusCode < 500 ? error.statusCode : 500;
    const { body } = errorReply(status, 'validation', error.message);
    return reply.code(status).send(body);
  });

  registerArbiterRoutes(app, arbiter);
  registerPublicRoutes(app, arbiter);

  // Solo del mock: crea partidas entre equipos o contra bots de la casa (no está en el OpenAPI).
  app.post('/_mock/games', (request, reply) => {
    const { first, second, kind = 'friendly' } = (request.body ?? {}) as Record<string, unknown>;
    const seat = (id: unknown): Seat | null => {
      if (typeof id !== 'string') return null;
      const team = arbiter.teamById(id);
      if (team) return { type: 'team', team };
      return isHouseBot(id) ? { type: 'house', bot: id } : null;
    };
    const [one, two] = [seat(first), seat(second)];
    const validKind = ADMIN_KINDS.find((k) => k === kind);
    if (!one || !two || !validKind || first === second) {
      const message = 'Se espera { first, second, kind? } con ids de equipo o bots de la casa.';
      const { body } = errorReply(400, 'validation', message);
      return reply.code(400).send(body);
    }
    const game = arbiter.createGame(validKind, one, two);
    return reply.code(201).send({ game_id: game.id });
  });

  const sweeper = setInterval(() => arbiter.sweep(), options.sweepIntervalMs ?? 200);
  sweeper.unref();
  app.addHook('onClose', (_instance, done) => {
    clearInterval(sweeper);
    done();
  });

  return { app, arbiter };
}
