/**
 * CORS solo para páginas de esta computadora (`http://localhost:*` y `http://127.0.0.1:*`), para que
 * el panel "Mi equipo" de la web (`npm run bot` en :8080 o Vite en :5173) hable con el árbitro
 * simulado igual que con el árbitro de prueba. No está en el OpenAPI: el árbitro oficial decide el
 * suyo. Cualquier otro origen no recibe permiso y el navegador bloquea la respuesta.
 */
import type { FastifyInstance } from 'fastify';

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function installLocalCors(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined || !LOCAL_ORIGIN.test(origin)) return;
    void reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
    if (request.method !== 'OPTIONS') return;
    // Preflight: el panel manda `authorization` y JSON con GET, POST y PUT.
    await reply
      .code(204)
      .header('access-control-allow-methods', 'GET, POST, PUT')
      .header('access-control-allow-headers', 'authorization, content-type, accept')
      .header('access-control-max-age', '600')
      .send();
  });
}
