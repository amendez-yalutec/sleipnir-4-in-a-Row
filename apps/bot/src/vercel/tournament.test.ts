/** El bot del torneo en Vercel: una ventana del ciclo por invocación del cron. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fallbackChooser } from '../chooser/fallback.ts';
import handler, { runTournamentWindow } from './tournament.ts';

const ENABLED = {
  ARBITRO_ENABLED: 'true',
  ARBITRO_URL: 'https://arbitro.example',
  TEAM_TOKEN: 'TOKEN-DE-PRUEBA-NO-REAL',
};

const turn = {
  status: 200,
  body: {
    status: 'turn',
    game_id: 'g1',
    you: 1,
    board: Array.from({ length: 7 }, () => Array<number>(8).fill(0)),
    moves: [],
    legal_moves: [0, 1, 2, 3, 4, 5, 6, 7],
  },
};
const idle = { status: 200, body: { status: 'idle' } };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runTournamentWindow', () => {
  it('sin ARBITRO_ENABLED=true, o sin URL o token, no corre', async () => {
    expect(await runTournamentWindow({})).toMatchObject({ ran: false });
    expect(await runTournamentWindow({ ...ENABLED, TEAM_TOKEN: '' })).toMatchObject({
      ran: false,
      reason: expect.stringContaining('TEAM_TOKEN') as string,
    });
  });

  it('juega los turnos de la ventana y se detiene al acabarla, sin loguear el token', async () => {
    let clock = 0;
    let calls = 0;
    const lines: string[] = [];
    const result = await runTournamentWindow(ENABLED, {
      client: {
        next: (wait) => {
          clock += wait * 1000;
          return Promise.resolve(calls++ === 0 ? turn : idle);
        },
        move: () => Promise.resolve({ status: 200, body: { ok: true, state: 'playing' } }),
      },
      chooser: fallbackChooser,
      log: (level, event, data) => lines.push(JSON.stringify({ level, event, ...data })),
      now: () => clock,
      windowMs: 30_000,
    });
    expect(result).toMatchObject({ ran: true, stats: { turns: 1, accepted: 1, problems: 0 } });
    expect(clock).toBeLessThanOrEqual(30_000 + 20_000);
    expect(lines.join('\n')).not.toContain(ENABLED.TEAM_TOKEN);
  });
});

describe('handler del cron', () => {
  async function call(authorization?: string) {
    const server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/api/cron/torneo`, {
        headers: authorization ? { authorization } : {},
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('sin CRON_SECRET configurado o con otro secreto responde 401', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer algo')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', 'secreto-del-cron');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer otro')).status).toBe(401);
  });

  it('con el secreto correcto corre (aquí, desactivado: no juega)', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-del-cron');
    vi.stubEnv('ARBITRO_ENABLED', 'false');
    expect(await call('Bearer secreto-del-cron')).toEqual({
      status: 200,
      body: { ran: false, reason: 'ARBITRO_ENABLED no es true' },
    });
  });
});
