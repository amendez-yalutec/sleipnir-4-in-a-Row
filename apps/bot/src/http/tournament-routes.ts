/**
 * `GET /api/tournament/games` y `/:id`: repetición de partidas del torneo a través de las rutas
 * públicas del árbitro, sin token (invariante 11) y con `game_id` validado (SSRF, pentest #6).
 */
import { tournamentGameDetailSchema, tournamentGameListSchema } from '@equipo6/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { GAME_ID_PATTERN, type PublicArbiter } from '../arbiter/public-client.ts';
import { parseGame, parseGameList } from '../arbiter/schema.ts';
import type { Logger } from '../log.ts';
import { sendError } from './security.ts';
import { involves, toTournamentDetail, toTournamentGame } from './tournament.ts';

export interface TournamentDeps {
  readonly arbiter: Pick<PublicArbiter, 'listGames' | 'getGame'>;
  /** Id público de nuestro equipo en el árbitro (p. ej. "eq6"); sin él se listan todas. */
  readonly teamId?: string;
}

const unavailable = (reply: FastifyReply, message = 'No se pudo consultar al árbitro.') =>
  sendError(reply, 503, { error: 'tournament_unavailable', message });

export function registerTournamentRoutes(
  app: FastifyInstance,
  deps: TournamentDeps | undefined,
  log: Logger,
): void {
  app.get('/api/tournament/games', async (_request, reply) => {
    if (!deps) return unavailable(reply, 'Falta ARBITRO_URL: no hay torneo que mostrar.');
    try {
      const response = await deps.arbiter.listGames(200);
      const games = response.status === 200 ? parseGameList(response.body) : null;
      if (!games) return unavailable(reply);
      return tournamentGameListSchema.parse(
        games.filter((game) => involves(game, deps.teamId)).map(toTournamentGame),
      );
    } catch (error) {
      log('warn', 'torneo_lista_fallo', { detalle: (error as Error).message });
      return unavailable(reply);
    }
  });

  app.get('/api/tournament/games/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!GAME_ID_PATTERN.test(id)) {
      return sendError(reply, 400, { error: 'validation', message: 'Id de partida inválido.' });
    }
    if (!deps) return unavailable(reply, 'Falta ARBITRO_URL: no hay torneo que mostrar.');
    try {
      const response = await deps.arbiter.getGame(id);
      if (response.status === 404) {
        return sendError(reply, 404, { error: 'not_found', message: 'Esa partida no existe.' });
      }
      const game = response.status === 200 ? parseGame(response.body) : null;
      if (!game) return unavailable(reply);
      return tournamentGameDetailSchema.parse(toTournamentDetail(game));
    } catch (error) {
      log('warn', 'torneo_partida_fallo', { detalle: (error as Error).message });
      return unavailable(reply);
    }
  });
}
