/**
 * Controles de seguridad de la API de la app (PLAN_CALIDAD_SEGURIDAD.md §4.3, paso S1):
 * - headers: CSP estricta `default-src 'self'`, `frame-ancestors 'none'`, `nosniff` (helmet);
 * - rate limit por IP (más estricto en `bot-move`, que gasta CPU);
 * - solo `application/json`; cuerpo ≤ 4 KB (en `app.ts`);
 * - errores con el formato `{ error, message }` y sin stack trace ni detalles internos.
 */
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { ApiError } from '@equipo6/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Logger } from '../log.ts';

export interface RateLimitOptions {
  /** Peticiones por IP y por minuto, en general. */
  readonly max: number;
  /** Jugadas del bot por IP y por minuto. */
  readonly botMoveMax: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 120, botMoveMax: 30 };

export function sendError(reply: FastifyReply, status: number, body: ApiError) {
  return reply.code(status).type('application/json').send(body);
}

const CLIENT_ERRORS: Readonly<Record<number, string>> = {
  400: 'Petición inválida (JSON mal formado o prohibido).',
  413: 'El cuerpo de la petición es demasiado grande.',
  415: 'Content-Type debe ser application/json.',
};

export async function registerSecurity(
  app: FastifyInstance,
  limits: RateLimitOptions,
  log: Logger,
): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        // El panel "Mi equipo" llama al árbitro desde el navegador: cualquier HTTPS (la URL la
        // configura el equipo) y el árbitro simulado en esta computadora. Nada más.
        connectSrc: ["'self'", 'https:', 'http://localhost:*', 'http://127.0.0.1:*'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  await app.register(rateLimit, {
    max: limits.max,
    timeWindow: 60_000,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'rate_limited',
      message: `Demasiadas peticiones; intenta en ${Math.ceil(context.ttl / 1000)} s.`,
    }),
  });

  // Solo JSON: sin el parser de texto plano, cualquier otro Content-Type responde 415.
  app.removeContentTypeParser('text/plain');

  app.setErrorHandler(
    (error: { statusCode?: number; error?: string; message: string }, request, reply) => {
      const status = error.statusCode ?? 500;
      // 403 de los estáticos (p. ej. `/../.env`): se responde 404 para no revelar qué existe.
      if (status === 403 || status === 404) {
        return sendError(reply, 404, { error: 'not_found', message: 'No existe.' });
      }
      if (status === 429) {
        return sendError(reply, 429, { error: 'rate_limited', message: error.message });
      }
      if (status >= 400 && status < 500) {
        const message = CLIENT_ERRORS[status] ?? 'Petición inválida.';
        return sendError(reply, status, { error: 'validation', message });
      }
      log('error', 'api_error_interno', { ruta: request.routeOptions.url, detalle: error.message });
      return sendError(reply, 500, { error: 'internal', message: 'Error interno.' });
    },
  );

  app.setNotFoundHandler((_request, reply) =>
    sendError(reply, 404, { error: 'not_found', message: 'No existe.' }),
  );
}
