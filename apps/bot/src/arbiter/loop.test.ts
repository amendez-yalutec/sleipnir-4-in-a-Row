/**
 * Ciclo del torneo contra el árbitro simulado. Criterio de listo de B4: 20 partidas completas sin
 * errores. También: fallas inyectadas, pausas ante errores y que el token no aparezca en los logs.
 */
import { type FaultOptions, type MockArbiter, buildMockServer } from '@equipo6/mock-arbiter';
import { afterEach, describe, expect, it } from 'vitest';
import { fallbackChooser } from '../chooser/fallback.ts';
import { createSearchChooser } from '../chooser/search.ts';
import type { Level } from '../log.ts';
import { ArbiterClient, ArbiterHttpError } from './client.ts';
import { type LoopOptions, runArbiterLoop, sleep } from './loop.ts';

const TOKEN = 'TOKEN-DE-PRUEBA-NO-REAL-123';
const TEAM = { id: 'eq6', name: 'Equipo 6', token: TOKEN, members: [] };

interface Entry {
  level: Level;
  event: string;
  [key: string]: unknown;
}

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

function recorder() {
  const entries: Entry[] = [];
  const lines: string[] = [];
  const log: LoopOptions['log'] = (level, event, data = {}) => {
    lines.push(JSON.stringify({ level, event, ...data }));
    entries.push({ level, event, ...data });
  };
  return { entries, lines, log };
}

async function startMock(faults: FaultOptions = {}) {
  // Plazo amplio a propósito: estas pruebas miden que el ciclo juegue bien (también con fallas), no
  // la latencia. Con todo el suite en paralelo (o un runner lento de CI) 3 s reales pueden no
  // alcanzar. El plazo de 3 s se prueba con reloj falso (mock-arbiter) y el presupuesto, en
  // search.time.test.ts.
  const built = buildMockServer({ teams: [TEAM], faults, seed: 2026, deadlineMs: 10_000 });
  closers.push(() => built.app.close());
  const url = await built.app.listen({ port: 0, host: '127.0.0.1' });
  return { ...built, url };
}

/**
 * Margen para que llegue la respuesta de la última jugada antes de cortar el ciclo. El mock da la
 * partida por terminada al registrar la jugada, antes de que el bot reciba el 200; si el ciclo se
 * corta en ese instante, el POST en vuelo se cancela y la jugada queda "sin confirmar" aunque el
 * bot jugó bien. En el torneo real nadie corta el ciclo al terminar una partida.
 */
const SETTLE_MS = 500;

/** Corre el ciclo hasta que todas las partidas terminen (o se agote el tiempo de la prueba). */
async function playUntilFinished(
  arbiter: MockArbiter,
  options: Omit<LoopOptions, 'signal' | 'chooser'>,
  gameIds: string[],
) {
  const controller = new AbortController();
  let settle: ReturnType<typeof setTimeout> | undefined;
  const watcher = setInterval(() => {
    if (settle === undefined && gameIds.every((id) => arbiter.getGame(id)?.result)) {
      settle = setTimeout(() => controller.abort(), SETTLE_MS);
    }
  }, 20);
  try {
    return await runArbiterLoop({
      ...options,
      chooser: fallbackChooser,
      signal: controller.signal,
    });
  } finally {
    clearInterval(watcher);
    clearTimeout(settle);
  }
}

describe('ciclo del torneo contra el mock', () => {
  it('20 partidas completas sin errores (criterio de listo de B4)', async () => {
    const { arbiter, url } = await startMock();
    const ids = Array.from({ length: 20 }, (_, i) => {
      const reply = arbiter.createPractice(
        TEAM,
        i % 4 < 2 ? 'casa-basico' : 'casa-aleatorio',
        i % 2 === 0 ? 1 : 2,
      );
      return (reply.body as { game_id: string }).game_id;
    });
    const { entries, lines, log } = recorder();

    const stats = await playUntilFinished(
      arbiter,
      { client: new ArbiterClient({ baseUrl: url, token: TOKEN }), log, waitS: 1 },
      ids,
    );

    const reasons = ids.map((id) => arbiter.getGame(id)?.result?.reason);
    expect(reasons.every((reason) => reason === 'connect4' || reason === 'draw')).toBe(true);
    const detail = JSON.stringify({ stats, problemas: entries.filter((e) => e.level !== 'info') });
    expect(stats, detail).toMatchObject({ rejected: 0, problems: 0 });
    expect(stats.accepted, detail).toBe(stats.turns);
    expect(entries.filter((entry) => entry.level === 'error')).toEqual([]);
    // Pentest #11: el valor del token no aparece en ningún log.
    expect(lines.join('\n')).not.toContain(TOKEN);
  }, 20_000);

  it('con latencia, 503 y conexiones cortadas: 0 derrotas por tiempo, jugada ilegal o ausencia', async () => {
    const { arbiter, url } = await startMock({
      latencyMs: 20,
      jitterMs: 30,
      errorRate: 0.15,
      dropRate: 0.05,
    });
    const ids = Array.from({ length: 6 }, (_, i) => {
      const reply = arbiter.createPractice(TEAM, 'casa-basico', i % 2 === 0 ? 1 : 2);
      return (reply.body as { game_id: string }).game_id;
    });
    const { entries, log } = recorder();

    await playUntilFinished(
      arbiter,
      {
        client: new ArbiterClient({ baseUrl: url, token: TOKEN }),
        log,
        waitS: 1,
        // Pausas reales divididas entre 50 para que la prueba no tarde minutos.
        sleep: (ms, signal) => sleep(ms / 50, signal),
      },
      ids,
    );

    const reasons = ids.map((id) => arbiter.getGame(id)?.result?.reason);
    expect(reasons.filter((reason) => reason !== 'connect4' && reason !== 'draw')).toEqual([]);
    expect(
      entries.some(
        (entry) =>
          entry.event === 'move_error_de_red' ||
          entry.event === 'next_fallo' ||
          entry.event === 'next_error_del_servidor',
      ),
    ).toBe(true);
  }, 30_000);

  it('sin partidas: vuelve a preguntar sin errores (idle)', async () => {
    const { url } = await startMock();
    const { entries, log } = recorder();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 1_300);
    const stats = await runArbiterLoop({
      client: new ArbiterClient({ baseUrl: url, token: TOKEN }),
      chooser: fallbackChooser,
      log,
      signal: controller.signal,
      waitS: 1,
    });
    expect(stats).toEqual({ turns: 0, accepted: 0, rejected: 0, problems: 0 });
    expect(entries).toEqual([]);
  });

  it('token inválido: pausa creciente de 5 a 60 s, nunca un ciclo sin pausa', async () => {
    const { url } = await startMock();
    const { entries, log } = recorder();
    const controller = new AbortController();
    const pauses: number[] = [];
    await runArbiterLoop({
      client: new ArbiterClient({ baseUrl: url, token: 'token-equivocado' }),
      chooser: fallbackChooser,
      log,
      signal: controller.signal,
      waitS: 1,
      sleep: (ms) => {
        pauses.push(ms);
        if (pauses.length === 6) controller.abort();
        return Promise.resolve();
      },
    });
    expect(pauses).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
    expect(entries.every((entry) => entry.event === 'token_invalido')).toBe(true);
  });

  it('árbitro caído (503 siempre): pausas de 1, 2, 4 y 5 s', async () => {
    const { url } = await startMock({ errorRate: 1 });
    const controller = new AbortController();
    const pauses: number[] = [];
    await runArbiterLoop({
      client: new ArbiterClient({ baseUrl: url, token: TOKEN }),
      chooser: fallbackChooser,
      log: () => undefined,
      signal: controller.signal,
      sleep: (ms) => {
        pauses.push(ms);
        if (pauses.length === 5) controller.abort();
        return Promise.resolve();
      },
    });
    expect(pauses).toEqual([1000, 2000, 4000, 5000, 5000]);
  });
});

describe('con la búsqueda del motor', () => {
  it('gana las 6 partidas contra casa-basico (profundidad fija 8, determinista)', async () => {
    const { arbiter, url } = await startMock();
    const ids = Array.from({ length: 6 }, (_, i) => {
      const reply = arbiter.createPractice(TEAM, 'casa-basico', i % 2 === 0 ? 1 : 2);
      return (reply.body as { game_id: string }).game_id;
    });
    const controller = new AbortController();
    const watcher = setInterval(() => {
      if (ids.every((id) => arbiter.getGame(id)?.result)) controller.abort();
    }, 20);
    const stats = await runArbiterLoop({
      client: new ArbiterClient({ baseUrl: url, token: TOKEN }),
      chooser: createSearchChooser({ maxDepth: 8 }),
      log: () => undefined,
      signal: controller.signal,
      waitS: 1,
    }).finally(() => clearInterval(watcher));

    expect(stats).toMatchObject({ rejected: 0, problems: 0 });
    const results = ids.map((id) => {
      const game = arbiter.getGame(id);
      const mine = game?.seats[1].type === 'team' ? 1 : 2;
      return game?.result?.winner === mine ? 'ganada' : game?.result?.reason;
    });
    expect(results).toEqual(Array(6).fill('ganada'));
  }, 30_000);
});

describe('pausas del ciclo con un cliente falso', () => {
  type Reply = { status: number; body: unknown } | Error;
  const turn = {
    status: 'turn',
    game_id: 'g1',
    you: 1,
    board: Array.from({ length: 7 }, () => Array<number>(8).fill(0)),
    moves: [],
    legal_moves: [0, 1, 2, 3, 4, 5, 6, 7],
  };

  async function pausesFor(nextReplies: Reply[], moveReply: Reply = new Error('caída')) {
    const controller = new AbortController();
    const pauses: number[] = [];
    let calls = 0;
    await runArbiterLoop({
      client: {
        next: () => {
          const reply = nextReplies[calls++ % nextReplies.length];
          return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
        },
        move: () =>
          moveReply instanceof Error ? Promise.reject(moveReply) : Promise.resolve(moveReply),
      },
      chooser: fallbackChooser,
      log: () => undefined,
      signal: controller.signal,
      now: () => 0,
      sleep: (ms) => {
        pauses.push(ms);
        if (pauses.length === 4) controller.abort();
        return Promise.resolve();
      },
    });
    return pauses;
  }

  it('si la jugada nunca se confirma, pausa entre turnos (no martilla al árbitro)', async () => {
    expect(await pausesFor([{ status: 200, body: turn }])).toEqual([1000, 2000, 4000, 5000]);
  });

  it('idle instantáneo (el servidor no retiene): pausa mínima de 500 ms', async () => {
    expect(await pausesFor([{ status: 200, body: { status: 'idle' } }])).toEqual([
      500, 500, 500, 500,
    ]);
  });

  it('respuesta 200 sin forma de turno: pausa de red', async () => {
    expect(await pausesFor([{ status: 200, body: { status: 'raro' } }])).toEqual([
      1000, 2000, 4000, 5000,
    ]);
  });

  it('redirección o 4xx inesperado en next: pausa larga (configuración rota)', async () => {
    const redirect = new ArbiterHttpError('redirect', '302');
    expect(await pausesFor([redirect])).toEqual([5000, 10000, 20000, 40000]);
    expect(await pausesFor([{ status: 404, body: {} }])).toEqual([5000, 10000, 20000, 40000]);
  });

  it('401 al enviar la jugada: pausa larga', async () => {
    const pauses = await pausesFor([{ status: 200, body: turn }], { status: 401, body: {} });
    expect(pauses).toEqual([5000, 10000, 20000, 40000]);
  });

  it('una jugada aceptada reinicia la pausa de red', async () => {
    const accepted = { status: 200, body: { ok: true, state: 'playing' } };
    const pauses = await pausesFor(
      [new ArbiterHttpError('network', 'x'), { status: 200, body: turn }],
      accepted,
    );
    expect(pauses).toEqual([1000, 1000, 1000, 1000]);
  });
});

describe('ventana del ciclo (until, para el cron de Vercel)', () => {
  const idle = { status: 200, body: { status: 'idle' } };
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
  const accepted = { status: 200, body: { ok: true, state: 'playing' } };

  /** Reloj falso: cada long polling avanza el reloj lo que esperó. */
  function windowRun(until: number, nextReply: (wait: number) => typeof idle) {
    let clock = 0;
    const waits: number[] = [];
    const moves: number[] = [];
    const run = runArbiterLoop({
      client: {
        next: (wait) => {
          waits.push(wait);
          clock += wait * 1000;
          return Promise.resolve(nextReply(wait));
        },
        move: (_gameId, column) => {
          moves.push(column);
          return Promise.resolve(accepted);
        },
      },
      chooser: fallbackChooser,
      log: () => undefined,
      signal: new AbortController().signal,
      now: () => clock,
      sleep: () => Promise.resolve(),
      waitS: 20,
      until,
    });
    return { run, waits, moves };
  }

  it('acorta el long polling para terminar antes de until y luego se detiene', async () => {
    const { run, waits } = windowRun(50_000, () => idle);
    await run;
    expect(waits).toEqual([20, 20, 10]);
  });

  it('un turno recibido justo antes de until se juega igual', async () => {
    const { run, waits, moves } = windowRun(1_500, () => turn);
    const stats = await run;
    expect(waits).toEqual([1]);
    expect(moves).toHaveLength(1);
    expect(stats).toMatchObject({ turns: 1, accepted: 1, problems: 0 });
  });

  it('si until ya pasó, no pide turnos', async () => {
    const { run, waits } = windowRun(500, () => idle);
    await run;
    expect(waits).toEqual([]);
  });
});
