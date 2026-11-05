/**
 * Hilo de búsqueda (worker_threads). Una búsqueda bloquea el hilo donde corre; aquí no frena la red ni
 * el temporizador de seguridad del hilo principal (PLAN_BACKEND.md §3 y §4.4). Conserva su tabla de
 * transposición entre búsquedas.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { TranspositionTable, search } from '@equipo6/engine';
import type { SearchJob, WorkerMessage } from './worker-protocol.ts';

const { tableBits } = workerData as { tableBits: number };
const table = new TranspositionTable(tableBits);
const send = (message: WorkerMessage) => parentPort?.postMessage(message);

parentPort?.on('message', (job: SearchJob) => {
  try {
    const { column, depth, nodes, score } = search(job.position, {
      legalMoves: job.legalMoves,
      table,
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
