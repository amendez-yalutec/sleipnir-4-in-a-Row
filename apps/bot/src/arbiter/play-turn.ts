/**
 * Un turno del torneo: elegir con red de seguridad, filtrar por `legal_moves` y enviar con reintentos.
 * Todo el tiempo se mide desde que se **recibió** el turno (invariante 6), nunca contra `served_at`.
 */
import { fallbackMove } from '../chooser/fallback.ts';
import type { Budget, Choice, MoveChooser } from '../chooser/types.ts';
import type { Logger } from '../log.ts';
import type { ArbiterClient } from './client.ts';
import { guardColumn, mostCentral } from './guard.ts';
import { type ArbiterTurn, type MoveResult, parseMove } from './schema.ts';

export interface TurnDeps {
  readonly client: Pick<ArbiterClient, 'move'>;
  readonly chooser: MoveChooser;
  readonly log: Logger;
  readonly signal: AbortSignal;
  readonly now: () => number;
  readonly thinkSoftMs: number;
  readonly thinkHardMs: number;
}

/** Hasta cuándo vale la pena reintentar el POST: 400 ms antes del plazo (2,600 de 3,000). */
const RETRY_MARGIN_MS = 400;
const MAX_ATTEMPTS = 3;
/** El hilo principal no espera a la búsqueda más de `hard` + este margen. */
export const SAFETY_MARGIN_MS = 100;

/** `soft = min(THINK_SOFT_MS, 0.47 · deadline)`, `hard = min(THINK_HARD_MS, 0.6 · deadline)`. */
export function budgetFor(deadlineMs: number, softMs: number, hardMs: number): Budget {
  return {
    softMs: Math.min(softMs, Math.floor(0.47 * deadlineMs)),
    hardMs: Math.min(hardMs, Math.floor(0.6 * deadlineMs)),
  };
}

type Source = 'busqueda' | 'unica' | 'respaldo' | 'temporizador';

async function choose(deps: TurnDeps, turn: ArbiterTurn, budget: Budget) {
  const { position, legalMoves } = turn;
  const fallback = () => (position ? fallbackMove(position, legalMoves) : mostCentral(legalMoves));
  if (legalMoves.length === 1) return { column: legalMoves[0] ?? null, source: 'unica' as Source };
  if (!position) return { column: fallback(), source: 'respaldo' as Source };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const safety = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budget.hardMs + SAFETY_MARGIN_MS);
  });
  try {
    const choice: Choice | null = await Promise.race([
      deps.chooser.choose(position, legalMoves, budget),
      safety,
    ]);
    if (choice === null) return { column: fallback(), source: 'temporizador' as Source };
    return { column: choice.column, source: 'busqueda' as Source, choice };
  } catch (error) {
    deps.log('error', 'busqueda_fallo', {
      game_id: turn.gameId,
      detalle: (error as Error).message,
    });
    return { column: fallback(), source: 'respaldo' as Source };
  } finally {
    clearTimeout(timer);
  }
}

async function submit(deps: TurnDeps, turn: ArbiterTurn, column: number, receivedAt: number) {
  const retryUntil = receivedAt + turn.deadlineMs - RETRY_MARGIN_MS;
  let last: MoveResult | null = null;
  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    const timeoutMs = Math.max(250, receivedAt + turn.deadlineMs - deps.now());
    try {
      last = parseMove(await deps.client.move(turn.gameId, column, timeoutMs, deps.signal));
      if (last.kind !== 'server_error') break;
    } catch (error) {
      if (deps.signal.aborted) break;
      deps.log('warn', 'move_error_de_red', {
        game_id: turn.gameId,
        attempt,
        detalle: String(error),
      });
    }
    if (deps.now() >= retryUntil) break;
  }
  return { result: last, attempts: attempt };
}

export async function playTurn(deps: TurnDeps, turn: ArbiterTurn, receivedAt: number) {
  const base = { game_id: turn.gameId, kind: turn.kind, opponent: turn.opponent, turn: turn.turn };
  for (const warning of turn.warnings)
    deps.log('warn', 'turno_inconsistente', { ...base, warning });

  const budget = budgetFor(turn.deadlineMs, deps.thinkSoftMs, deps.thinkHardMs);
  const decided = await choose(deps, turn, budget);
  const guarded = guardColumn(decided.column, turn.legalMoves);
  if (guarded.column === null) {
    deps.log('error', 'sin_jugadas_legales', base);
    return null;
  }
  if (guarded.overridden && decided.column !== null) {
    deps.log('error', 'jugada_fuera_de_legal_moves', { ...base, elegida: decided.column });
  }

  const thinkMs = Math.round(deps.now() - receivedAt);
  const { result, attempts } = await submit(deps, turn, guarded.column, receivedAt);
  const entry = {
    ...base,
    you: turn.you,
    column: guarded.column,
    source: decided.source,
    depth: decided.choice?.depth,
    nodes: decided.choice?.nodes,
    score: decided.choice?.score,
    think_ms: thinkMs,
    post_ms: Math.round(deps.now() - receivedAt) - thinkMs,
    attempts,
    result: result?.kind ?? 'sin_respuesta',
  };

  if (result?.kind === 'accepted') deps.log('info', 'jugada', { ...entry, state: result.state });
  else if (result?.kind === 'not_your_turn') deps.log('warn', 'jugada_409', entry);
  else if (result?.kind === 'rejected') {
    // illegal_move o timeout: la partida se pierde. Severidad alta y visible.
    deps.log('error', 'jugada_rechazada', {
      ...entry,
      error: result.error,
      message: result.message,
    });
  } else deps.log('error', 'jugada_sin_confirmar', entry);
  return result;
}
