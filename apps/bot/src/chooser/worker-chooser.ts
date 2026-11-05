/**
 * Elección en un worker (paso B8 del plan, adelantado para la API de la app). Una búsqueda a la vez
 * por worker, con cola acotada: si está llena, `BusyError` (la API responde 429). Si el worker no
 * responde en `hard + margen`, se termina y se crea otro (PLAN_BACKEND.md §4.4). El reloj de "trabado"
 * empieza cuando el worker ya cargó y recibió el trabajo, no durante su arranque.
 */
import { Worker } from 'node:worker_threads';
import { type Position, legalMoves as legalColumns } from '@equipo6/engine';
import type { Budget, Choice, Contempt, MoveChooser } from './types.ts';
import type { SearchJob, WorkerMessage } from './worker-protocol.ts';

export class BusyError extends Error {
  override readonly name = 'BusyError';
}

export interface WorkerChooserOptions {
  /** Entradas de la tabla de transposición = 2^tableBits (20 ≈ 13 MB). */
  readonly tableBits?: number;
  /** Búsquedas en espera además de la que corre. */
  readonly maxQueue?: number;
  /** Margen sobre `hardMs` antes de dar el worker por trabado. */
  readonly stallMarginMs?: number;
  /** Tope para búsquedas a profundidad fija (sin reloj), que no tienen `hardMs`. */
  readonly fixedDepthStallMs?: number;
}

interface Pending {
  readonly job: SearchJob;
  readonly resolve: (choice: Choice) => void;
  readonly reject: (error: Error) => void;
}

const WORKER_URL = new URL('./search-worker.ts', import.meta.url);
/** Tope de una búsqueda en el turno del rival (normalmente la corta antes el turno siguiente). */
export const PONDER_MS = 15_000;

export class WorkerChooser implements MoveChooser {
  readonly #options: Required<WorkerChooserOptions>;
  readonly #queue: Pending[] = [];
  #worker: Worker | null = null;
  #ready: Promise<Worker> | null = null;
  #running: Pending | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #nextId = 0;
  #closed = false;
  /** Bandera compartida con el worker: 1 = cortar la búsqueda en el turno del rival. */
  readonly #stop = new Int32Array(new SharedArrayBuffer(4));
  #pondering = false;

  constructor(options: WorkerChooserOptions = {}) {
    this.#options = {
      tableBits: options.tableBits ?? 20,
      maxQueue: options.maxQueue ?? 3,
      stallMarginMs: options.stallMarginMs ?? 500,
      fixedDepthStallMs: options.fixedDepthStallMs ?? 30_000,
    };
  }

  /** Hay una búsqueda en el turno del rival en curso. */
  get pondering(): boolean {
    return this.#pondering;
  }

  /**
   * Piensa en el turno del rival: busca `position` (le toca al rival) para llenar la tabla de
   * transposición. Solo si el worker está libre; el próximo `choose` la corta en menos de 1 ms.
   */
  ponder(position: Position, contempt?: Contempt): void {
    if (this.#closed || this.#pondering || this.#running || this.#queue.length > 0) return;
    const worker = this.#worker;
    if (!worker) return;
    this.#pondering = true;
    Atomics.store(this.#stop, 0, 0);
    const job: SearchJob = {
      id: ++this.#nextId,
      position: { board: position.board, toMove: position.toMove },
      legalMoves: legalColumns(position.board),
      softMs: PONDER_MS,
      hardMs: PONDER_MS,
      ponder: true,
      ...(contempt && { contempt }),
    };
    worker.postMessage(job);
  }

  /** Búsquedas corriendo o en espera. */
  get load(): number {
    return this.#queue.length + (this.#running ? 1 : 0);
  }

  /** Arranca el worker por adelantado: el primer turno del torneo no paga la carga del motor. */
  async warmUp(): Promise<void> {
    await this.#ensureWorker();
  }

  choose(position: Position, legalMoves: readonly number[], budget: Budget): Promise<Choice> {
    if (this.#closed) return Promise.reject(new Error('El worker de búsqueda está cerrado.'));
    if (this.#running && this.#queue.length >= this.#options.maxQueue) {
      return Promise.reject(new BusyError('El bot está ocupado.'));
    }
    return new Promise((resolve, reject) => {
      const job: SearchJob = {
        id: ++this.#nextId,
        position: { board: position.board, toMove: position.toMove },
        legalMoves: [...legalMoves],
        softMs: budget.softMs,
        hardMs: budget.hardMs,
        ...(budget.maxDepth !== undefined && { maxDepth: budget.maxDepth }),
        ...(budget.contempt && { contempt: budget.contempt }),
      };
      this.#queue.push({ job, resolve, reject });
      if (this.#pondering) Atomics.store(this.#stop, 0, 1); // el trabajo arranca al llegar `pondered`
      void this.#pump();
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const pending of this.#queue.splice(0)) pending.reject(new Error('Worker cerrado.'));
    this.#settle(new Error('Worker cerrado.'));
    const worker = this.#worker;
    this.#worker = null;
    this.#ready = null;
    await worker?.terminate();
  }

  #ensureWorker(): Promise<Worker> {
    if (this.#ready) return this.#ready;
    const worker = new Worker(WORKER_URL, {
      workerData: { tableBits: this.#options.tableBits, stop: this.#stop.buffer },
    });
    this.#worker = worker;
    this.#ready = new Promise<Worker>((resolve, reject) => {
      worker.on('message', (message: WorkerMessage) => {
        if (message.type === 'ready') resolve(worker);
        else if (message.type === 'pondered') {
          if (this.#worker !== worker) return;
          this.#pondering = false;
          void this.#pump();
        } else if (this.#worker === worker && this.#running?.job.id === message.id) {
          if (message.ok) this.#settle(null, message.choice);
          else this.#settle(new Error(message.error));
        }
      });
      worker.on('error', (error) => {
        reject(error);
        this.#discard(worker, error);
      });
      worker.on('exit', (code) => {
        const error = new Error(`El worker de búsqueda terminó (código ${code}).`);
        reject(error);
        this.#discard(worker, error);
      });
    });
    this.#ready.catch(() => undefined); // el rechazo se maneja en #pump
    return this.#ready;
  }

  async #pump(): Promise<void> {
    if (this.#running || this.#closed || this.#pondering) return;
    const next = this.#queue.shift();
    if (!next) return;
    this.#running = next;
    let worker: Worker;
    try {
      worker = await this.#ensureWorker();
    } catch (error) {
      this.#settle(error as Error);
      return;
    }
    if (this.#running !== next) return; // se cerró mientras arrancaba
    const { hardMs, maxDepth } = next.job;
    const limit = maxDepth === undefined ? hardMs : this.#options.fixedDepthStallMs;
    this.#timer = setTimeout(
      () => this.#discard(worker, new Error('La búsqueda no respondió a tiempo.')),
      limit + this.#options.stallMarginMs,
    );
    worker.postMessage(next.job);
  }

  #settle(error: Error | null, choice?: Choice): void {
    const running = this.#running;
    if (!running) return;
    clearTimeout(this.#timer);
    this.#running = null;
    if (error) running.reject(error);
    else running.resolve(choice as Choice);
    void this.#pump();
  }

  /**
   * Worker trabado o caído: se descarta y el siguiente trabajo arranca uno nuevo. Los avisos tardíos
   * de un worker ya descartado (su `exit`, por ejemplo) se ignoran: no deben tumbar el trabajo que
   * ya corre en el worker nuevo.
   */
  #discard(worker: Worker, error: Error): void {
    if (this.#worker !== worker) return;
    this.#worker = null;
    this.#pondering = false;
    this.#ready = null;
    void worker.terminate();
    this.#settle(error);
  }
}
