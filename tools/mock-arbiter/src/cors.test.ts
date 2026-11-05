/** CORS del árbitro simulado: solo páginas de esta computadora (panel "Mi equipo" en local). */
import { afterEach, describe, expect, it } from 'vitest';
import { buildMockServer } from './server.ts';

const servers: ReturnType<typeof buildMockServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.app.close()));
});

function mock() {
  const server = buildMockServer({ teams: [], seed: 6 });
  servers.push(server);
  return server.app;
}

describe('CORS del árbitro simulado', () => {
  it('responde el preflight de una página local con los métodos y headers del panel', async () => {
    const response = await mock().inject({
      method: 'OPTIONS',
      url: '/api/me',
      headers: {
        origin: 'http://127.0.0.1:8080',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:8080');
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    expect(response.headers['access-control-allow-methods']).toContain('PUT');
  });

  it('permite leer la respuesta desde localhost (Vite en :5173)', async () => {
    const response = await mock().inject({
      url: '/api/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('no da permiso a otros orígenes', async () => {
    const app = mock();
    for (const origin of ['https://evil.example', 'http://127.0.0.1.evil.example', 'null']) {
      const response = await app.inject({ url: '/api/health', headers: { origin } });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/me',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });
});
