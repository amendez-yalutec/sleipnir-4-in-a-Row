/**
 * Hilo de búsqueda (worker_threads). Una búsqueda bloquea el hilo donde corre; aquí no frena la red ni
 * el temporizador de seguridad del hilo principal (PLAN_BACKEND.md §3 y §4.4). Conserva su tabla de
 * transposición entre búsquedas.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { TranspositionTable, search } from '@equipo6/engine';
import type { SearchJob, WorkerMessage } from './worker-protocol.ts';

const { tableBits, stop } = workerData as { tableBits: number; stop: SharedArrayBuffer };
const table = new TranspositionTable(tableBits);
const stopFlag = new Int32Array(stop);
const send = (message: WorkerMessage) => parentPort?.postMessage(message);

/**
 * Reloj de la búsqueda en el turno del rival: con la bandera en 1 "se acaba el tiempo" al instante.
 * La primera lectura (la hora de inicio del motor) siempre es real: si fuera `Infinity`, el plazo
 * también lo sería y la búsqueda nunca se cortaría.
 */
function ponderClock(): () => number {
  let first = true;
  return () => {
    if (first) {
      first = false;
      return performance.now();
    }
    return Atomics.load(stopFlag, 0) === 1 ? Number.POSITIVE_INFINITY : performance.now();
  };
}

parentPort?.on('message', (job: SearchJob) => {
  if (job.ponder) {
    // Si el turno ya llegó mientras el trabajo viajaba, no hay nada que pensar.
    if (Atomics.load(stopFlag, 0) === 1) {
      send({ type: 'pondered', id: job.id });
      return;
    }
    try {
      search(job.position, {
        legalMoves: job.legalMoves,
        table,
        softMs: job.softMs,
        hardMs: job.hardMs,
        now: ponderClock(),
        ...(job.contempt && { contempt: job.contempt }),
      });
    } catch {
      // Solo llenaba la tabla: un fallo aquí no afecta al turno siguiente.
    }
    send({ type: 'pondered', id: job.id });
    return;
  }
  try {
    const { column, depth, nodes, score } = search(job.position, {
      legalMoves: job.legalMoves,
      table,
      ...(job.contempt && { contempt: job.contempt }),
      ...(job.maxDepth === undefined
        ? { softMs: job.softMs, hardMs: job.hardMs, now: () => performance.now() }
        : { maxDepth: job.maxDepth }),
    });
    send({ type: 'result', id: job.id, ok: true, choice: { column, depth, nodes, score } });
  } catch (error) {
    send({ type: 'result', id: job.id, ok: false, error: (error as Error).message });
  }
});

// El motor y la tabla ya están cargados: el reloj de "trabado" puede empezar a contar.
send({ type: 'ready' });
