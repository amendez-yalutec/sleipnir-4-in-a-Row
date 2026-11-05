import { describe, expect, it, vi } from 'vitest';
import { ArbiterError, createArbiterClient } from './client.ts';

const CONFIG = { url: 'https://arbitro.example', teamId: 'eq6', token: 'tok' };

function fakeFetch(status: number, body: unknown) {
  return vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const game = (id: string, one: string, two: string) => ({
  game_id: id,
  kind: 'practice',
  status: 'finished',
  players: { '1': { team_id: one, name: one }, '2': { team_id: two, name: two, house: true } },
  moves: [],
  result: { winner: 1, reason: 'connect4' },
});

describe('cliente del árbitro', () => {
  it('manda el token solo en las rutas del equipo, sin seguir redirecciones', async () => {
    const fetchImpl = fakeFetch(200, { team: { id: 'eq6', name: 'Equipo 6' } });
    const me = await createArbiterClient(CONFIG, fetchImpl).me();
    expect(me.team.name).toBe('Equipo 6');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://arbitro.example/api/me');
    expect(init.redirect).toBe('error');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');

    const health = fakeFetch(200, { ok: true, phase: 'practice' });
    await createArbiterClient(CONFIG, health).health();
    const [, healthInit] = health.mock.calls[0] as [string, RequestInit];
    expect((healthInit.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('sin token no llama a las rutas del equipo', async () => {
    const fetchImpl = fakeFetch(200, {});
    await expect(createArbiterClient({ ...CONFIG, token: '' }, fetchImpl).me()).rejects.toThrow(
      'Falta el token',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('crea prácticas y registra la entrega con el cuerpo del OpenAPI', async () => {
    const practice = fakeFetch(201, { game_id: 'g_p_01', you: 1 });
    await createArbiterClient(CONFIG, practice).practice('casa-basico', 2);
    const [, init] = practice.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ opponent: 'casa-basico', first: 2 });

    const submit = fakeFetch(200, { repo_url: 'https://github.com/x/y', commit: 'a1b2c3d' });
    const record = await createArbiterClient(CONFIG, submit).submit(
      'https://github.com/x/y',
      'a1b2c3d',
    );
    expect(record.commit).toBe('a1b2c3d');
    expect((submit.mock.calls[0] as [string, RequestInit])[1].method).toBe('PUT');
  });

  it('filtra las partidas del equipo configurado', async () => {
    const fetchImpl = fakeFetch(200, [game('g1', 'eq6', 'casa-basico'), game('g2', 'eq3', 'eq1')]);
    const games = await createArbiterClient(CONFIG, fetchImpl).teamGames();
    expect(games.map((g) => g.game_id)).toEqual(['g1']);
  });

  it('traduce los errores del árbitro a mensajes claros', async () => {
    const client = createArbiterClient(
      CONFIG,
      fakeFetch(401, { ok: false, error: 'unauthorized', message: 'Token inválido.' }),
    );
    await expect(client.me()).rejects.toMatchObject({ status: 401, message: /rechazó el token/ });
    const closed = createArbiterClient(CONFIG, fakeFetch(423, { error: 'practice_closed' }));
    await expect(closed.practice('casa-basico', 1)).rejects.toThrow('Las prácticas ya cerraron.');
    const other = createArbiterClient(CONFIG, fakeFetch(500, 'no json'));
    await expect(other.health()).rejects.toThrow('Error 500.');
  });

  it('respuesta con otra forma o sin conexión → error con mensaje', async () => {
    const odd = createArbiterClient(CONFIG, fakeFetch(200, { algo: 1 }));
    await expect(odd.me()).rejects.toThrow('algo inesperado');
    const down = createArbiterClient(
      CONFIG,
      vi.fn(() => Promise.reject(new TypeError('fetch'))),
    );
    const error: unknown = await down.health().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArbiterError);
    expect((error as ArbiterError).status).toBe(0);
  });
});
