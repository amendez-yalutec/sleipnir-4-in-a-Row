/**
 * Transporte HTTP hacia el árbitro, común al cliente del torneo (con token) y al proxy público (sin
 * token). Controles (PLAN_CALIDAD_SEGURIDAD.md §4.3, API7 y API10):
 * - no sigue redirecciones: un 3xx es error, así nada viaja a otro dominio;
 * - timeout en cada petición y tamaño máximo de respuesta;
 * - solo decodifica JSON a `unknown`: lo interpreta `schema.ts`.
 */
import type { HttpResponse } from './schema.ts';

export type HttpFailure = 'network' | 'timeout' | 'redirect' | 'too_large' | 'aborted';

export class ArbiterHttpError extends Error {
  override readonly name = 'ArbiterHttpError';
  readonly reason: HttpFailure;

  constructor(reason: HttpFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface RequestOptions {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: object;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof fetch;
}

/** Normaliza la URL base para que `new URL('api/…', base)` respete un prefijo de ruta. */
export function baseUrl(value: string): URL {
  return new URL(value.endsWith('/') ? value : `${value}/`);
}

export async function requestJson(url: URL, options: RequestOptions): Promise<HttpResponse> {
  // AbortSignal.timeout exige un entero; el reloj monótono da fracciones de ms.
  const timeout = AbortSignal.timeout(Math.max(1, Math.ceil(options.timeoutMs)));
  const { signal, body } = options;
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const fail = (error: unknown) => {
    if (error instanceof ArbiterHttpError) return error;
    if (signal?.aborted) return new ArbiterHttpError('aborted', 'Petición cancelada.');
    if (timeout.aborted) {
      return new ArbiterHttpError('timeout', `Sin respuesta en ${options.timeoutMs} ms.`);
    }
    return new ArbiterHttpError('network', `Error de red: ${(error as Error).message}`);
  };

  try {
    const response = await (options.fetch ?? fetch)(url, {
      method: options.method,
      redirect: 'manual',
      signal: combined,
      headers: {
        accept: 'application/json',
        'user-agent': 'equipo6-bot',
        ...options.headers,
        ...(body && { 'content-type': 'application/json' }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new ArbiterHttpError(
        'redirect',
        `El árbitro respondió ${response.status}: no se siguen redirecciones (revisa ARBITRO_URL).`,
      );
    }
    const text = await readLimited(response, options.maxBytes);
    return { status: response.status, body: decode(text) };
  } catch (error) {
    throw fail(error);
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const tooLarge = () =>
    new ArbiterHttpError('too_large', `Respuesta de más de ${maxBytes} bytes.`);
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > maxBytes) throw tooLarge();
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

function decode(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
