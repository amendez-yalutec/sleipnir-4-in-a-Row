/**
 * Cliente del torneo (con token). Solo transporta: `schema.ts` interpreta las respuestas.
 *
 * Controles (PLAN_CALIDAD_SEGURIDAD.md §4.3, API10), además de los de `http.ts`:
 * - el token vive en un campo privado y nunca sale en errores ni logs;
 * - una columna fuera de 0–7 no se envía.
 */
import { baseUrl, requestJson } from './http.ts';
import type { HttpResponse } from './schema.ts';

export { ArbiterHttpError, type HttpFailure } from './http.ts';

export interface ArbiterClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  /** Tope de bytes por respuesta; un turno ocupa ~1 KB. */
  readonly maxBodyBytes?: number;
  readonly fetch?: typeof fetch;
}

/** Margen sobre `wait`: detecta una conexión muerta antes de la regla de ausencia de 30 s. */
export const LONG_POLL_MARGIN_MS = 4_000;

export class ArbiterClient {
  readonly #token: string;
  readonly #base: URL;
  readonly #maxBodyBytes: number;
  readonly #fetch: typeof fetch | undefined;

  constructor(options: ArbiterClientOptions) {
    this.#token = options.token;
    this.#base = baseUrl(options.baseUrl);
    this.#maxBodyBytes = options.maxBodyBytes ?? 256 * 1024;
    this.#fetch = options.fetch;
  }

  /** Host del árbitro, para mostrarlo al arrancar sin exponer nada más. */
  get host(): string {
    return this.#base.host;
  }

  next(waitS: number, signal?: AbortSignal): Promise<HttpResponse> {
    const url = new URL(`api/next?wait=${waitS}`, this.#base);
    return this.#request('GET', url, undefined, waitS * 1000 + LONG_POLL_MARGIN_MS, signal);
  }

  move(gameId: string, column: number, timeoutMs: number, signal?: AbortSignal) {
    if (!Number.isInteger(column) || column < 0 || column > 7) {
      throw new RangeError(`Columna ${column} fuera de 0–7: no se envía.`);
    }
    const url = new URL('api/move', this.#base);
    return this.#request('POST', url, { game_id: gameId, column }, timeoutMs, signal);
  }

  #request(
    method: 'GET' | 'POST',
    url: URL,
    body: object | undefined,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<HttpResponse> {
    return requestJson(url, {
      method,
      headers: { authorization: `Bearer ${this.#token}` },
      ...(body && { body }),
      timeoutMs,
      maxBytes: this.#maxBodyBytes,
      ...(signal && { signal }),
      ...(this.#fetch && { fetch: this.#fetch }),
    });
  }
}
