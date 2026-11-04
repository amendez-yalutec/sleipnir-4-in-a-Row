/**
 * Inyección de fallas para las pruebas de caos del cliente (PLAN_BACKEND.md §6): latencia, 5xx al
 * azar y conexiones cortadas. Solo afecta a las rutas /api del árbitro.
 */
import type { FastifyInstance } from 'fastify';
import type { Random } from './random.ts';

export interface FaultOptions {
  /** Latencia fija añadida a cada petición, en ms. */
  readonly latencyMs?: number;
  /** Latencia extra al azar entre 0 y este valor, en ms. */
  readonly jitterMs?: number;
  /** Probabilidad (0–1) de responder 503. */
  readonly errorRate?: number;
  /** Probabilidad (0–1) de cortar la conexión sin responder. */
  readonly dropRate?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function hasFaults(faults: FaultOptions): boolean {
  return Object.values(faults).some((value) => typeof value === 'number' && value > 0);
}

export function installFaults(app: FastifyInstance, faults: FaultOptions, random: Random): void {
  const { latencyMs = 0, jitterMs = 0, errorRate = 0, dropRate = 0 } = faults;

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const delay = latencyMs + random() * jitterMs;
    if (delay > 0) await sleep(delay);

    if (random() < dropRate) {
      request.raw.socket.destroy();
      return reply.hijack();
    }
    if (random() < errorRate) {
      return reply.code(503).type('text/plain').send('Falla inyectada por el árbitro simulado.');
    }
  });
}
