/**
 * Elección con la búsqueda del motor (B6). Corre en el hilo principal y respeta su propio corte duro
 * (`hardMs`); en B8 pasa a un worker para que el temporizador de seguridad pueda actuar aunque la
 * búsqueda se trabe. La tabla de transposición se conserva entre turnos.
 */
import { type SearchOptions, TranspositionTable, search } from '@equipo6/engine';
import type { MoveChooser } from './types.ts';

export interface SearchChooserOptions {
  readonly now?: () => number;
  readonly table?: TranspositionTable;
  /** Solo para pruebas deterministas: profundidad fija, sin reloj. */
  readonly maxDepth?: number;
}

export function createSearchChooser(options: SearchChooserOptions = {}): MoveChooser {
  const table = options.table ?? new TranspositionTable(20);
  const now = options.now ?? (() => performance.now());
  return {
    choose(position, legalMoves, budget) {
      const limits: SearchOptions =
        options.maxDepth === undefined
          ? { softMs: budget.softMs, hardMs: budget.hardMs, now }
          : { maxDepth: options.maxDepth };
      try {
        const result = search(position, { ...limits, legalMoves, table });
        const { column, depth, nodes, score } = result;
        return Promise.resolve({ column, depth, nodes, score });
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
}
