/** `POST /api/game/state` y `POST /api/game/bot-move` (PLAN_BACKEND.md §7). */
import { botMoveRequestSchema, gameStateSchema, stateRequestSchema } from '@equipo6/contracts';
import { IllegalMoveError, replay } from '@equipo6/engine';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { BusyError } from '../chooser/worker-chooser.ts';
import { type BotMoveDeps, botMove, toGameState } from './game-service.ts';
import { sendError } from './security.ts';

const ILLEGAL: Readonly<Record<IllegalMoveError['reason'], string>> = {
  out_of_range: 'está fuera del tablero',
  column_full: 'va a una columna llena',
  game_over: 'llega cuando la partida ya terminó',
};

function invalid(reply: FastifyReply, error: ZodError) {
  const fields = [...new Set(error.issues.map((issue) => issue.path.join('.') || 'cuerpo'))];
  return sendError(reply, 400, {
    error: 'validation',
    message: `Datos inválidos en: ${fields.join(', ')}.`,
  });
}

function illegal(reply: FastifyReply, error: IllegalMoveError) {
  const which = error.index === undefined ? 'La jugada' : `La jugada ${error.index + 1}`;
  return sendError(reply, 400, {
    error: 'illegal_move',
    message: `${which} ${ILLEGAL[error.reason]}.`,
  });
}

export function registerGameRoutes(
  app: FastifyInstance,
  deps: BotMoveDeps,
  botMoveMaxPerMinute: number,
): void {
  app.post('/api/game/state', (request, reply) => {
    const parsed = stateRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return gameStateSchema.parse(toGameState(replay(parsed.data.moves)));
    } catch (error) {
      if (error instanceof IllegalMoveError) return illegal(reply, error);
      throw error;
    }
  });

  app.post(
    '/api/game/bot-move',
    { config: { rateLimit: { max: botMoveMaxPerMinute, timeWindow: 60_000 } } },
    async (request, reply) => {
      const parsed = botMoveRequestSchema.safeParse(request.body);
      if (!parsed.success) return invalid(reply, parsed.error);
      try {
        return gameStateSchema.parse(await botMove(parsed.data.moves, parsed.data.level, deps));
      } catch (error) {
        if (error instanceof IllegalMoveError) return illegal(reply, error);
        if (error instanceof BusyError) {
          return sendError(reply, 429, {
            error: 'busy',
            message: 'El bot está ocupado; intenta en un momento.',
          });
        }
        throw error;
      }
    },
  );
}
