/** Respuestas con el vocabulario de errores del OpenAPI (`Error.error`). */
export type ErrorCode =
  | 'illegal_move'
  | 'timeout'
  | 'not_your_turn'
  | 'unauthorized'
  | 'practice_closed'
  | 'submissions_closed'
  | 'unknown_game'
  | 'validation';

export interface Reply {
  readonly status: number;
  readonly body: unknown;
}

export const errorReply = (status: number, error: ErrorCode, message: string): Reply => ({
  status,
  body: { ok: false, error, message },
});

export const notYourTurn = (gameId: string) =>
  errorReply(
    409,
    'not_your_turn',
    `La partida ${gameId} no tiene un turno pendiente para tu equipo.`,
  );
