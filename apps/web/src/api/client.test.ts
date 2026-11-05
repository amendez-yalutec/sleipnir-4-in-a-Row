import { describe, expect, it, vi } from 'vitest';
import { EMPTY_GAME } from '../game/reducer.ts';
import { createApiClient } from './client.ts';

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

describe('cliente de la API', () => {
  it('manda las jugadas como JSON y valida la respuesta con el contrato', async () => {
    const fetchSpy = vi.fn<typeof fetch>(() => json(200, EMPTY_GAME));
    const result = await createApiClient(fetchSpy).state([3, 4]);
    expect(result).toEqual({ ok: true, data: EMPTY_GAME });
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('/api/game/state');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"moves":[3,4]}');
  });

  it('bot-move y health', async () => {
    const health = {
      ok: true,
      version: '1',
      arbiter: { enabled: false, state: 'disabled', lastTurnAt: null, gamesPlayed: 0 },
    };
    const client = createApiClient(((url: string) =>
      url === '/api/health' ? json(200, health) : json(200, EMPTY_GAME)) as typeof fetch);
    expect(await client.botMove([], 'hard')).toMatchObject({ ok: true });
    expect(await client.health()).toEqual({ ok: true, data: health });
  });

  it.each([
    [400, 'illegal_move', 'rejected', 'Esa jugada no se puede hacer.'],
    [
      429,
      'busy',
      'failed',
      'El bot está atendiendo otra partida. Intenta de nuevo en unos segundos.',
    ],
    [
      429,
      'rate_limited',
      'failed',
      'Muchas jugadas seguidas. Espera unos segundos e intenta de nuevo.',
    ],
    [500, 'internal', 'failed', 'El servidor tuvo un problema. Intenta de nuevo.'],
  ] as const)('%i %s → %s con un mensaje para la persona', async (status, error, kind, message) => {
    const client = createApiClient(() => json(status, { error, message: 'técnico' }));
    expect(await client.state([1])).toEqual({ ok: false, kind, code: error, message });
  });

  it('respuestas sin forma o errores desconocidos no llegan crudos a la pantalla', async () => {
    const weird = createApiClient(() => json(200, { hola: 1 }));
    expect(await weird.state([])).toMatchObject({ ok: false, kind: 'failed' });
    const html = createApiClient(() => Promise.resolve(new Response('<html>', { status: 502 })));
    expect(await html.state([])).toMatchObject({ ok: false, kind: 'failed', code: 'internal' });
  });

  it('sin red, tiempo agotado o cancelación', async () => {
    const offline = createApiClient(() => Promise.reject(new TypeError('fetch failed')));
    const down = await offline.state([]);
    expect(down).toMatchObject({ kind: 'failed' });
    expect(!down.ok && down.message).toMatch(/conexión/);

    const controller = new AbortController();
    controller.abort();
    const aborted = createApiClient(((_url: string, init: RequestInit) =>
      Promise.reject(init.signal?.reason as Error)) as typeof fetch);
    expect(await aborted.state([], controller.signal)).toMatchObject({ kind: 'aborted' });

    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => AbortSignal.abort());
    const slow = createApiClient(((_url: string, init: RequestInit) =>
      Promise.reject(init.signal?.reason as Error)) as typeof fetch);
    const late = await slow.state([]);
    expect(late).toMatchObject({ kind: 'failed' });
    expect(!late.ok && late.message).toMatch(/tardó/);
  });
});
