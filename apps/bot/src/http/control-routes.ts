/**
 * Control del bot del torneo desde la web (panel "Mi equipo"): `GET /api/control`,
 * `POST /api/control/start` y `POST /api/control/stop`. Solo existen en el servidor de la laptop
 * (`main.ts`); `buildAppServer` sin `control` no las registra.
 *
 * Seguridad (además de los controles generales de `security.ts`):
 * - solo desde esta computadora: la IP de la petición debe ser loopback, aunque `HOST=0.0.0.0`;
 * - solo desde nuestra página: si llega `Origin`, debe ser el mismo host (otra web no puede mandar el
 *   token ni apagar el bot; además el JSON obliga al navegador a pedir permiso CORS, que no damos);
 * - el token se usa para el ciclo y no aparece en respuestas ni logs.
 */
import { controlStartRequestSchema, controlStatusSchema } from '@equipo6/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TournamentController } from '../arbiter/controller.ts';
import { sendError } from './security.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function sameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function forbidden(request: FastifyRequest, reply: FastifyReply): boolean {
  if (LOOPBACK.has(request.ip) && sameOrigin(request)) return false;
  void sendError(reply, 403, {
    error: 'forbidden',
    message: 'El bot del torneo solo se controla desde la página abierta en esta computadora.',
  });
  return true;
}

export function registerControlRoutes(app: FastifyInstance, control: TournamentController): void {
  app.get('/api/control', (request, reply) => {
    if (forbidden(request, reply)) return reply;
    return controlStatusSchema.parse(control.status());
  });

  app.post('/api/control/start', (request, reply) => {
    if (forbidden(request, reply)) return reply;
    const parsed = controlStartRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, { error: 'validation', message: 'Faltan la URL o el token.' });
    }
    const started = control.start(parsed.data.url.trim(), parsed.data.token.trim());
    if (!started.ok && started.reason === 'running') {
      return sendError(reply, 409, {
        error: 'conflict',
        message: 'El bot ya está escuchando. Detenlo antes de cambiar de árbitro.',
      });
    }
    if (!started.ok) {
      return sendError(reply, 400, {
        error: 'validation',
        message: 'La URL del árbitro debe ser https:// (o http://localhost para el mock).',
      });
    }
    return controlStatusSchema.parse(control.status());
  });

  app.post('/api/control/stop', async (request, reply) => {
    if (forbidden(request, reply)) return reply;
    await control.stop();
    return controlStatusSchema.parse(control.status());
  });
}
