/** Invariante 3 de AGENTS.md: nunca se envía al árbitro una columna que no esté en `legal_moves`. */
import { CENTER_ORDER } from '@equipo6/engine';

export function mostCentral(legalMoves: readonly number[]): number | null {
  return CENTER_ORDER.find((column) => legalMoves.includes(column)) ?? null;
}

export interface GuardedColumn {
  /** Columna que se envía; `null` si no hay ninguna jugada legal. */
  readonly column: number | null;
  /** `true` si la elegida no estaba en `legal_moves` y se reemplazó por la más central. */
  readonly overridden: boolean;
}

export function guardColumn(choice: number | null, legalMoves: readonly number[]): GuardedColumn {
  if (choice !== null && legalMoves.includes(choice)) return { column: choice, overridden: false };
  return { column: mostCentral(legalMoves), overridden: true };
}
