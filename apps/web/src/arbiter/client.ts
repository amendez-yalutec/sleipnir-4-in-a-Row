/**
 * Cliente del árbitro para el panel "Mi equipo": el navegador habla directo con el árbitro, con el
 * token que el equipo escribió en esta pestaña. El token va solo al árbitro; nunca a la API de la app.
 * Sin redirecciones (invariante 11) y con límite de tiempo por petición.
 */
import type { z } from 'zod';
import type { ArbiterConfig } from './config.ts';
import {
  type GameSummary,
  type Me,
  errorSchema,
  gamesSchema,
  healthSchema,
  meSchema,
  practiceSchema,
  submissionSchema,
} from './schema.ts';

export const ARBITER_TIMEOUT_MS = 10_000;

export class ArbiterError extends Error {
  /** Código HTTP; 0 si no hubo respuesta (red, CORS o tiempo agotado). */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ArbiterError';
    this.status = status;
  }
}

const MESSAGES: Readonly<Record<string, string>> = {
  unauthorized: 'El árbitro rechazó el token. Revísalo en la configuración.',
  practice_closed: 'Las prácticas ya cerraron.',
  submissions_closed: 'Las entregas ya cerraron.',
};

export type HouseBot = 'casa-basico' | 'casa-aleatorio';

export interface ArbiterClient {
  health(): Promise<{ phase?: string }>;
  me(): Promise<Me>;
  practice(opponent: HouseBot, first: 1 | 2): Promise<{ game_id: string }>;
  submit(repoUrl: string, commit: string): Promise<{ commit: string }>;
  /** Partidas recientes en las que juega el equipo configurado, de la más nueva a la más vieja. */
  teamGames(): Promise<GameSummary[]>;
}

export function createArbiterClient(
  config: ArbiterConfig,
  fetchImpl: typeof fetch = fetch.bind(globalThis),
): ArbiterClient {
  async function call<S extends z.ZodType>(
    path: string,
    schema: S,
    init: { method?: string; body?: unknown; auth?: boolean } = {},
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.auth) {
      if (!config.token) throw new ArbiterError('Falta el token del equipo.', 401);
      headers.authorization = `Bearer ${config.token}`;
    }
    let response: Response;
    try {
      response = await fetchImpl(`${config.url}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: 'error',
        signal: AbortSignal.timeout(ARBITER_TIMEOUT_MS),
      });
    } catch {
      throw new ArbiterError(
        'No se pudo conectar con el árbitro. Revisa la URL y que el árbitro acepte conexiones desde el navegador.',
        0,
      );
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = errorSchema.safeParse(data);
      const code = error.success ? error.data.error : '';
      const message =
        MESSAGES[code] ??
        (error.success ? error.data.message : undefined) ??
        `Error ${response.status}.`;
      throw new ArbiterError(message, response.status);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new ArbiterError('El árbitro respondió algo inesperado.', response.status);
    return parsed.data;
  }

  return {
    health: () => call('/api/health', healthSchema),
    me: () => call('/api/me', meSchema, { auth: true }),
    practice: (opponent, first) =>
      call('/api/practice', practiceSchema, {
        method: 'POST',
        body: { opponent, first },
        auth: true,
      }),
    submit: (repoUrl, commit) =>
      call('/api/me/submission', submissionSchema, {
        method: 'PUT',
        body: { repo_url: repoUrl, commit },
        auth: true,
      }),
    teamGames: async () => {
      const games = await call('/api/games?limit=100', gamesSchema);
      return games.filter((game) =>
        [game.players['1'], game.players['2']].some((p) => p.team_id === config.teamId),
      );
    },
  };
}
