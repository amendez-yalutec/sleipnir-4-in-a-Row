/**
 * Contrato entre la API de la app (apps/bot/src/http) y la web (apps/web): esquemas zod y tipos.
 * La API valida con ellos lo que recibe; la web, lo que le llega. Si cambia un campo, el compilador
 * avisa en los dos lados (PLAN_FRONTEND.md §2). Los objetos son estrictos: un campo de más es error.
 */
import { z } from 'zod';

export const LEVELS = ['easy', 'medium', 'hard'] as const;
export const levelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof levelSchema>;

/** Columnas 0–7 en todo el código; 1–8 solo en pantalla (apps/web/src/ui/coords.ts). */
export const columnSchema = z.number().int().min(0).max(7);
export const movesSchema = z.array(columnSchema).max(56);
const playerSchema = z.union([z.literal(1), z.literal(2)]);
const cellSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const isoDate = z.string().max(40);
/** Texto que viene del árbitro: lo elige cada equipo y se muestra siempre como texto. */
const untrustedText = z.string().max(100);

// ── Peticiones ───────────────────────────────────────────────────────────────────────────────────

export const stateRequestSchema = z.strictObject({ moves: movesSchema });
export type StateRequest = z.infer<typeof stateRequestSchema>;

export const botMoveRequestSchema = z.strictObject({ moves: movesSchema, level: levelSchema });
export type BotMoveRequest = z.infer<typeof botMoveRequestSchema>;

// ── Respuestas ───────────────────────────────────────────────────────────────────────────────────

/** `board[fila][columna]`, fila 0 abajo: el mismo formato del árbitro. */
export const boardSchema = z.array(z.array(cellSchema).length(8)).length(7);

export const botInsightSchema = z.strictObject({
  column: columnSchema,
  depth: z.number().int().min(0),
  nodes: z.number().int().min(0),
  ms: z.number().int().min(0),
  score: z.number().int(),
  level: levelSchema,
});
export type BotInsight = z.infer<typeof botInsightSchema>;

export const gameStateSchema = z.strictObject({
  moves: movesSchema,
  board: boardSchema,
  toMove: playerSchema,
  legalMoves: z.array(columnSchema),
  status: z.enum(['playing', 'won', 'draw']),
  winner: playerSchema.nullable(),
  winningCells: z.array(z.tuple([z.number().int(), z.number().int()])),
  bot: botInsightSchema.optional(),
});
export type GameState = z.infer<typeof gameStateSchema>;

export const API_ERRORS = [
  'illegal_move',
  'validation',
  'busy',
  'rate_limited',
  'not_found',
  'tournament_unavailable',
  'forbidden',
  'conflict',
  'internal',
] as const;
export const apiErrorSchema = z.strictObject({
  error: z.enum(API_ERRORS),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Estado del ciclo del bot contra el árbitro del torneo. */
export const arbiterStatusSchema = z.strictObject({
  enabled: z.boolean(),
  state: z.enum(['disabled', 'starting', 'waiting', 'playing', 'error', 'stopped']),
  lastTurnAt: isoDate.nullable(),
  gamesPlayed: z.number().int().min(0),
});

export const healthSchema = z.strictObject({
  ok: z.literal(true),
  version: z.string(),
  arbiter: arbiterStatusSchema,
});
export type Health = z.infer<typeof healthSchema>;

// ── Control del bot del torneo desde la web (solo en la laptop) ──────────────────────────────────

/**
 * `POST /api/control/start`: la web pasa la URL del árbitro y el token que el equipo escribió en
 * "Mi equipo". Solo se acepta desde la misma computadora; el token no se guarda ni se loguea.
 */
export const controlStartRequestSchema = z.strictObject({
  url: z.string().max(200),
  token: z.string().min(1).max(512),
});
export type ControlStartRequest = z.infer<typeof controlStartRequestSchema>;

/** `GET /api/control`: si el ciclo corre, contra qué árbitro y cómo va. */
export const controlStatusSchema = z.strictObject({
  running: z.boolean(),
  arbiterHost: z.string().max(200).nullable(),
  arbiter: arbiterStatusSchema,
});
export type ControlStatus = z.infer<typeof controlStatusSchema>;

// ── Partidas del torneo (proxy de las rutas públicas del árbitro, sin token) ─────────────────────

const tournamentPlayerSchema = z.strictObject({
  id: untrustedText,
  name: untrustedText,
  house: z.boolean(),
});

export const tournamentGameSchema = z.strictObject({
  id: z.string().max(64),
  kind: untrustedText,
  status: z.enum(['scheduled', 'playing', 'finished']),
  players: z.strictObject({ '1': tournamentPlayerSchema, '2': tournamentPlayerSchema }),
  moves: movesSchema,
  winner: playerSchema.nullable(),
  reason: untrustedText.nullable(),
  startedAt: isoDate.nullable(),
});
export type TournamentGame = z.infer<typeof tournamentGameSchema>;

export const tournamentGameListSchema = z.array(tournamentGameSchema);

/** Detalle para repetir una partida: el tablero después de cada jugada (`frames[0]` = vacío). */
export const tournamentGameDetailSchema = z.strictObject({
  game: tournamentGameSchema,
  frames: z.array(boardSchema),
  winningCells: z.array(z.tuple([z.number().int(), z.number().int()])),
});
export type TournamentGameDetail = z.infer<typeof tournamentGameDetailSchema>;
