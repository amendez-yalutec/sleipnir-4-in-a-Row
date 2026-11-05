/**
 * Las respuestas del árbitro que lee la web, según el OpenAPI 1.0.1 (spec/arbitro-openapi.json). Es
 * el único lugar de `apps/web` que interpreta JSON del árbitro, como `apps/bot/src/arbiter/schema.ts`
 * en el bot (invariante 2). Los esquemas toleran campos extra: el árbitro puede agregar datos.
 * Los nombres de equipos son texto no confiable: solo se muestran como texto (invariante 9).
 */
import { z } from 'zod';

const player = z.union([z.literal(1), z.literal(2)]);

export const meSchema = z.object({
  team: z.object({ id: z.string(), name: z.string() }),
  standing: z
    .object({
      position: z.number().int(),
      played: z.number().int(),
      won: z.number().int(),
      drawn: z.number().int(),
      lost: z.number().int(),
      points: z.number().int(),
    })
    .nullable()
    .optional(),
  pending_turns: z.array(z.string()).optional(),
  submission: z
    .object({ repo_url: z.string(), commit: z.string(), registered_at: z.string().optional() })
    .nullable()
    .optional(),
  phase: z.string().optional(),
});
export type Me = z.infer<typeof meSchema>;

export const practiceSchema = z.object({ game_id: z.string(), you: player.optional() });

export const submissionSchema = z.object({
  repo_url: z.string(),
  commit: z.string(),
  registered_at: z.string().optional(),
});

const playerRef = z.object({
  team_id: z.string(),
  name: z.string(),
  house: z.boolean().optional(),
});

export const gameSummarySchema = z.object({
  game_id: z.string(),
  kind: z.string(),
  status: z.string(),
  players: z.object({ '1': playerRef, '2': playerRef }),
  moves: z.array(z.unknown()),
  result: z.object({ winner: player.nullable(), reason: z.string() }).nullable().optional(),
  finished_at: z.string().nullable().optional(),
});
export type GameSummary = z.infer<typeof gameSummarySchema>;

export const gamesSchema = z.array(gameSummarySchema);

export const healthSchema = z.object({ ok: z.literal(true), phase: z.string().optional() });

export const errorSchema = z.object({ error: z.string(), message: z.string().optional() });
