import { type Position, replay } from '@equipo6/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { BusyError, WorkerChooser } from './worker-chooser.ts';

const at = (moves: number[]): Position => {
  const state = replay(moves);
  return { board: state.board, toMove: state.toMove };
};
const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
const FAST = { softMs: 30, hardMs: 60 };

const choosers: WorkerChooser[] = [];
const make = (options = {}) => {
  const chooser = new WorkerChooser({ tableBits: 14, ...options });
  choosers.push(chooser);
  return chooser;
};
afterEach(async () => {
  await Promise.all(choosers.splice(0).map((chooser) => chooser.close()));
});

describe('búsqueda en un worker', () => {
  it('responde una jugada legal con profundidad y nodos, sin bloquear el hilo principal', async () => {
    const chooser = make();
    let ticks = 0;
    const ticker = setInterval(() => ticks++, 5);
    const choice = await chooser.choose(at([]), ALL, { softMs: 200, hardMs: 300 });
    clearInterval(ticker);
    expect(ALL).toContain(choice.column);
    expect(choice.depth).toBeGreaterThan(3);
    expect(choice.nodes).toBeGreaterThan(0);
    // Mientras el worker buscaba, el hilo principal siguió atendiendo temporizadores.
    expect(ticks).toBeGreaterThan(10);
  });

  it('gana en 1 y respeta la profundidad fija', async () => {
    const choice = await make().choose(at([0, 0, 1, 1, 2, 2]), ALL, { ...FAST, maxDepth: 2 });
    expect(choice).toMatchObject({ column: 3, depth: 1 });
  });

  it('cola acotada: si está llena responde BusyError; las aceptadas se resuelven en orden', async () => {
    const chooser = make({ maxQueue: 1 });
    const first = chooser.choose(at([]), ALL, FAST);
    const second = chooser.choose(at([3]), ALL, FAST);
    await expect(chooser.choose(at([4]), ALL, FAST)).rejects.toBeInstanceOf(BusyError);
    expect(chooser.load).toBe(2);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(chooser.load).toBe(0);
  });

  it('un error de la búsqueda llega como rechazo', async () => {
    const full = at([3, 3, 3, 3, 3, 3, 3]);
    await expect(make().choose(full, [3], FAST)).rejects.toThrow('No hay columnas jugables');
  });

  it('si el worker se traba, se descarta y el siguiente trabajo usa uno nuevo', async () => {
    const chooser = make({ fixedDepthStallMs: 50, stallMarginMs: 0 });
    await expect(chooser.choose(at([]), ALL, { ...FAST, maxDepth: 40 })).rejects.toThrow(
      'no respondió a tiempo',
    );
    const choice = await chooser.choose(at([0, 0, 1, 1, 2, 2]), ALL, FAST);
    expect(choice.column).toBe(3);
  });

  it('warmUp arranca el worker antes del primer trabajo', async () => {
    const chooser = make();
    await chooser.warmUp();
    const started = performance.now();
    await chooser.choose(at([0, 0, 1, 1, 2, 2]), ALL, FAST);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('al cerrar rechaza lo pendiente y lo que llegue después', async () => {
    const chooser = make();
    const running = chooser.choose(at([]), ALL, { softMs: 400, hardMs: 500 });
    const queued = chooser.choose(at([3]), ALL, FAST);
    // Las expectativas se enganchan antes de cerrar, para no dejar rechazos sin manejar.
    const checks = [
      expect(running).rejects.toThrow('cerrado'),
      expect(queued).rejects.toThrow('cerrado'),
    ];
    await chooser.close();
    await Promise.all(checks);
    await expect(chooser.choose(at([]), ALL, FAST)).rejects.toThrow('cerrado');
  });
});
