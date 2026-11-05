/** Iniciar y detener el ciclo del torneo sin reiniciar el servidor. */
import { describe, expect, it } from 'vitest';
import { fallbackChooser } from '../chooser/fallback.ts';
import { type LoopClient, TournamentController, arbiterHost } from './controller.ts';

const idle = { status: 200, body: { status: 'idle' } };

/** Cliente falso que responde `idle` al instante (el ciclo pausa 500 ms entre llamadas). */
function fakeClient(calls: { url: string; token: string }[]) {
  return (url: string, token: string): LoopClient => {
    calls.push({ url, token });
    return {
      next: () => Promise.resolve(idle),
      move: () => Promise.resolve({ status: 200, body: { ok: true, state: 'playing' } }),
    };
  };
}

function controller(lines: string[] = [], calls: { url: string; token: string }[] = []) {
  return new TournamentController({
    chooser: fallbackChooser,
    log: (level, event, data) => lines.push(JSON.stringify({ level, event, ...data })),
    waitS: 1,
    think: { softMs: 50, hardMs: 80 },
    makeClient: fakeClient(calls),
  });
}

describe('TournamentController', () => {
  it('arranca, informa su estado y se detiene', async () => {
    const calls: { url: string; token: string }[] = [];
    const control = controller([], calls);
    expect(control.status()).toMatchObject({ running: false, arbiterHost: null });
    expect(control.snapshot()).toMatchObject({ enabled: false, state: 'disabled' });

    expect(control.start('https://arbitro.example/api', 'tok')).toEqual({ ok: true });
    expect(calls).toEqual([{ url: 'https://arbitro.example/api', token: 'tok' }]);
    expect(control.status()).toMatchObject({ running: true, arbiterHost: 'arbitro.example' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(control.snapshot()).toMatchObject({ enabled: true, state: 'waiting' });

    expect(await control.stop()).toBe(true);
    expect(control.running).toBe(false);
    expect(control.snapshot().state).toBe('stopped');
    expect(await control.stop()).toBe(false);
  });

  it('un solo ciclo a la vez (invariante 7) y se puede volver a iniciar', async () => {
    const control = controller();
    expect(control.start('https://a.example', 't')).toEqual({ ok: true });
    expect(control.start('https://b.example', 't')).toEqual({ ok: false, reason: 'running' });
    await control.stop();
    expect(control.start('https://b.example', 't')).toEqual({ ok: true });
    expect(control.status().arbiterHost).toBe('b.example');
    await control.stop();
  });

  it('rechaza URLs que no son HTTPS (salvo el mock local)', () => {
    const control = controller();
    expect(control.start('http://arbitro.example', 't')).toEqual({ ok: false, reason: 'url' });
    expect(arbiterHost('http://127.0.0.1:8787')).toBe('127.0.0.1:8787');
    expect(arbiterHost('https://user:pw@a.example')).toBeNull();
    expect(arbiterHost('no es url')).toBeNull();
  });

  it('el token no aparece en los logs', async () => {
    const lines: string[] = [];
    const control = controller(lines);
    control.start('https://a.example', 'TOKEN-SECRETO-NO-REAL');
    await control.stop();
    expect(lines.join('\n')).not.toContain('TOKEN-SECRETO-NO-REAL');
    expect(lines.some((line) => line.includes('"origen":"control"'))).toBe(true);
  });
});
