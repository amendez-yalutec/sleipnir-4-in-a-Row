/**
 * Único lugar que interpreta el JSON del árbitro (invariante 2 de AGENTS.md). Es tolerante: acepta
 * campos extra, completa los opcionales que falten y nunca lanza; lo que no cuadra se devuelve como
 * advertencia. Mandan `board` y `you`; `legal_moves` es el filtro final (PLAN_BACKEND.md §5.1).
 */
import {
  type Board,
  type Player,
  type Position,
  legalMoves as boardLegalMoves,
  fromArbiterBoard,
  replay,
} from '@equipo6/engine';
import { z } from 'zod';

export interface HttpResponse {
  readonly status: number;
  /** JSON ya decodificado, o `undefined` si el cuerpo no era JSON. */
  readonly body: unknown;
}

export interface ArbiterTurn {
  readonly gameId: string;
  readonly kind: string;
  readonly you: Player;
  /** Texto no confiable: lo elige cada equipo. */
  readonly opponent: string;
  readonly turn: number | null;
  /** `null` si `board` no es un tablero posible: entonces se juega la más central de `legalMoves`. */
  readonly position: Position | null;
  /** Solo enteros de 0 a 7, sin repetidos y ordenados. */
  readonly legalMoves: readonly number[];
  readonly deadlineMs: number;
  readonly warnings: readonly string[];
}

const MAX_TEXT = 100;
const text = z
  .string()
  .catch('')
  .transform((value) => value.slice(0, MAX_TEXT));
const player = z.union([z.literal(1), z.literal(2)]);
const isColumn = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 7;

const turnShape = z.object({
  status: z.literal('turn'),
  game_id: z.string().min(1).max(128),
  kind: text,
  you: player,
  opponent: text,
  turn: z.number().int().nullable().catch(null),
  board: z.unknown(),
  moves: z.unknown(),
  legal_moves: z.array(z.unknown()).max(64),
  deadline_ms: z.number().int().min(500).max(60_000).catch(3_000),
});

const errorShape = z.object({ error: z.string().catch('desconocido'), message: text });

function readBoard(raw: unknown, you: Player, warnings: string[]): Board | null {
  const cells = z.array(z.array(z.number())).safeParse(raw);
  if (!cells.success) {
    warnings.push('board no es una matriz de números');
    return null;
  }
  try {
    return fromArbiterBoard(cells.data, you).board;
  } catch (error) {
    warnings.push(`board imposible: ${(error as Error).message}`);
    return null;
  }
}

/** A quién le toca según la cantidad de fichas; `null` si las cantidades son imposibles. */
function toMoveByParity(ones: number, twos: number): Player | null {
  if (ones === twos) return 1;
  return ones === twos + 1 ? 2 : null;
}

function checkConsistency(board: Board, raw: z.infer<typeof turnShape>, legal: number[]) {
  const warnings: string[] = [];
  const pieces = board.flat();
  const ones = pieces.filter((cell) => cell === 1).length;
  const twos = pieces.filter((cell) => cell === 2).length;
  if (toMoveByParity(ones, twos) !== raw.you) {
    warnings.push(`paridad: ${ones} fichas del 1 y ${twos} del 2, pero you = ${raw.you}`);
  }
  if (Array.isArray(raw.moves) && raw.moves.every(isColumn)) {
    try {
      const rebuilt = replay(raw.moves).board;
      if (JSON.stringify(rebuilt) !== JSON.stringify(board)) {
        warnings.push('moves no reconstruye board');
      }
    } catch {
      warnings.push('moves contiene jugadas ilegales');
    }
  }
  if (JSON.stringify(boardLegalMoves(board)) !== JSON.stringify(legal)) {
    warnings.push('legal_moves no coincide con board');
  }
  return warnings;
}

function toTurn(raw: z.infer<typeof turnShape>): ArbiterTurn {
  const warnings: string[] = [];
  const legalMoves = [...new Set(raw.legal_moves.filter(isColumn))].sort((a, b) => a - b);
  if (legalMoves.length !== raw.legal_moves.length) {
    warnings.push('legal_moves traía valores fuera de 0–7 o repetidos');
  }
  const board = readBoard(raw.board, raw.you, warnings);
  if (board) warnings.push(...checkConsistency(board, raw, legalMoves));

  return {
    gameId: raw.game_id,
    kind: raw.kind,
    you: raw.you,
    opponent: raw.opponent,
    turn: raw.turn,
    position: board && { board, toMove: raw.you },
    legalMoves,
    deadlineMs: raw.deadline_ms,
    warnings,
  };
}

/** Errores HTTP comunes a `next` y `move`. */
type HttpProblem =
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'server_error'; readonly status: number }
  | { readonly kind: 'unexpected'; readonly status: number; readonly error: string };

function problemOf(response: HttpResponse): HttpProblem {
  if (response.status === 401) return { kind: 'unauthorized' };
  if (response.status >= 500) return { kind: 'server_error', status: response.status };
  const { error } = errorShape.catch({ error: 'desconocido', message: '' }).parse(response.body);
  return { kind: 'unexpected', status: response.status, error };
}

export type NextResult =
  | { readonly kind: 'turn'; readonly turn: ArbiterTurn }
  | { readonly kind: 'idle' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | HttpProblem;

export function parseNext(response: HttpResponse): NextResult {
  if (response.status !== 200) return problemOf(response);
  const status = (response.body as { status?: unknown } | undefined)?.status;
  if (status === 'idle') return { kind: 'idle' };
  const parsed = turnShape.safeParse(response.body);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => issue.path.join('.') || '(raíz)').join(', ');
    return { kind: 'invalid', reason: `respuesta de next sin forma de turno: ${reason}` };
  }
  return { kind: 'turn', turn: toTurn(parsed.data) };
}

const accepted = z.object({
  ok: z.literal(true),
  state: z.enum(['playing', 'won', 'draw']),
  turn: z.number().int().nullable().catch(null),
});

export type MoveResult =
  | {
      readonly kind: 'accepted';
      readonly state: 'playing' | 'won' | 'draw';
      readonly turn: number | null;
    }
  /** 400: la partida se pierde (illegal_move, timeout) o un error que el OpenAPI no documenta. */
  | { readonly kind: 'rejected'; readonly error: string; readonly message: string }
  /** 409: no penaliza (p. ej. la jugada ya se había registrado). */
  | { readonly kind: 'not_your_turn'; readonly error: string; readonly message: string }
  | { readonly kind: 'invalid'; readonly reason: string }
  | HttpProblem;

export function parseMove(response: HttpResponse): MoveResult {
  if (response.status === 200) {
    const parsed = accepted.safeParse(response.body);
    if (!parsed.success) return { kind: 'invalid', reason: 'respuesta 200 de move sin forma' };
    return { kind: 'accepted', state: parsed.data.state, turn: parsed.data.turn };
  }
  if (response.status === 400 || response.status === 409) {
    const { error, message } = errorShape
      .catch({ error: 'desconocido', message: '' })
      .parse(response.body);
    return { kind: response.status === 400 ? 'rejected' : 'not_your_turn', error, message };
  }
  return problemOf(response);
}

// ── Registro público de una partida (/api/games/{id}) ────────────────────────────────────────────

/** `PlayerRef` (OpenAPI 1.0.1): `team_id`; se acepta también `id` por si vuelve el esquema 0.9.0. */
const gamePlayer = z
  .object({
    team_id: z.string().optional(),
    id: z.string().optional(),
    name: text,
    house: z.boolean().catch(false).optional(),
  })
  .transform(({ team_id, id, name, house }) => ({
    id: team_id ?? id ?? '',
    name,
    house: house === true,
  }));

const gameResult = z
  .object({
    winner: z.union([player, z.null()]),
    reason: text,
    winning_cells: z
      .array(z.tuple([z.number().int(), z.number().int()]))
      .max(56)
      .catch([]),
  })
  .nullable()
  .catch(null);

const gameShape = z.object({
  game_id: z.string().min(1).max(128),
  kind: text,
  status: z.enum(['scheduled', 'playing', 'finished']).catch('playing'),
  players: z.object({ '1': gamePlayer, '2': gamePlayer }),
  moves: z
    .array(z.object({ turn: z.number().int(), by: player, column: z.number().int().min(0).max(7) }))
    .max(56),
  result: gameResult.optional().transform((value) => value ?? null),
  started_at: z.string().max(40).nullable().catch(null).optional(),
});

export type ArbiterGame = z.infer<typeof gameShape>;

/**
 * Registro de `/api/games/{id}` (o un elemento de `/api/games`). Desde el OpenAPI 1.0.1 los jugadores
 * traen `team_id`; se acepta también `id`. `null` si la respuesta no tiene forma de partida.
 */
export function parseGame(body: unknown): ArbiterGame | null {
  const parsed = gameShape.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/** Lista de `/api/games`. Descarta los elementos sin forma de partida en lugar de fallar entera. */
export function parseGameList(body: unknown): ArbiterGame[] | null {
  if (!Array.isArray(body)) return null;
  return body.slice(0, 500).flatMap((item) => {
    const game = parseGame(item);
    return game ? [game] : [];
  });
}
