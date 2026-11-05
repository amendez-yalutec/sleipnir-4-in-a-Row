import type { Position } from '@equipo6/engine';
import type { Choice } from './types.ts';

/** Mensaje del hilo principal al worker. */
export interface SearchJob {
  readonly id: number;
  readonly position: Position;
  readonly legalMoves: readonly number[];
  readonly softMs: number;
  readonly hardMs: number;
  readonly maxDepth?: number;
  /** Búsqueda en el turno del rival: solo llena la tabla; se corta con la bandera compartida. */
  readonly ponder?: true;
}

/** Mensajes del worker: `ready` al terminar de cargar; luego una respuesta por trabajo. */
export type WorkerMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'pondered'; readonly id: number }
  | { readonly type: 'result'; readonly id: number; readonly ok: true; readonly choice: Choice }
  | { readonly type: 'result'; readonly id: number; readonly ok: false; readonly error: string };
