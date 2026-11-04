/**
 * Proxy de las rutas **públicas** del árbitro para la repetición de partidas en la app (API7, SSRF):
 * - nunca envía el token (invariante 11): no hay credencial que robar;
 * - el host es fijo (`ARBITRO_URL`) y no sigue redirecciones;
 * - `game_id` se valida con `^[A-Za-z0-9_-]{1,64}$` antes de armar la URL.
 */
import { baseUrl, requestJson } from './http.ts';
import type { HttpResponse } from './schema.ts';

export const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface PublicArbiterOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly maxBodyBytes?: number;
  readonly fetch?: typeof fetch;
}

export class PublicArbiter {
  readonly #base: URL;
  readonly #options: PublicArbiterOptions;

  constructor(options: PublicArbiterOptions) {
    this.#base = baseUrl(options.baseUrl);
    this.#options = options;
  }

  listGames(limit: number): Promise<HttpResponse> {
    const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
    return this.#get(new URL(`api/games?limit=${safeLimit}`, this.#base));
  }

  getGame(gameId: string): Promise<HttpResponse> {
    if (!GAME_ID_PATTERN.test(gameId)) throw new RangeError('game_id inválido: no se envía.');
    return this.#get(new URL(`api/games/${gameId}`, this.#base));
  }

  #get(url: URL): Promise<HttpResponse> {
    return requestJson(url, {
      method: 'GET',
      headers: {},
      timeoutMs: this.#options.timeoutMs ?? 5_000,
      maxBytes: this.#options.maxBodyBytes ?? 1024 * 1024,
      ...(this.#options.fetch && { fetch: this.#options.fetch }),
    });
  }
}
