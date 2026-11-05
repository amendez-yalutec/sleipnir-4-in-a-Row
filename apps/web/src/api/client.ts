/**
 * Cliente de nuestra API (nunca habla con el árbitro). Timeout de 10 s, respuestas validadas con el
 * contrato compartido y errores traducidos a frases para la persona. La única llamada que lleva el
 * token es `startListening`, y va al servidor del bot en esta misma computadora.
 */
import {
  type ApiError,
  type Level,
  apiErrorSchema,
  controlStatusSchema,
  gameStateSchema,
  healthSchema,
} from '@equipo6/contracts';
import type { ZodType } from 'zod';
import type { ApiClient, ApiResult } from './types.ts';

export const TIMEOUT_MS = 10_000;

const MESSAGES: Readonly<Record<ApiError['error'], string>> = {
  illegal_move: 'Esa jugada no se puede hacer.',
  validation: 'La jugada no es válida.',
  busy: 'El bot está atendiendo otra partida. Intenta de nuevo en unos segundos.',
  rate_limited: 'Muchas jugadas seguidas. Espera unos segundos e intenta de nuevo.',
  not_found: 'El servidor no reconoce esa petición.',
  tournament_unavailable: 'No se pudo consultar el torneo.',
  forbidden: 'El bot del torneo solo se controla desde la página abierta en su computadora.',
  conflict: 'El bot ya está escuchando. Detenlo antes de cambiar de árbitro.',
  internal: 'El servidor tuvo un problema. Intenta de nuevo.',
};

const NETWORK = 'No hay conexión con el bot. Revisa que el servidor esté encendido.';
const TIMEOUT = 'El bot tardó demasiado en responder. Intenta de nuevo.';
const UNEXPECTED = 'El servidor respondió algo inesperado. Intenta de nuevo.';

async function call<T>(
  fetchImpl: typeof fetch,
  path: string,
  schema: ZodType<T>,
  init: RequestInit,
  signal: AbortSignal | undefined,
): Promise<ApiResult<T>> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(path, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
  } catch {
    if (signal?.aborted) return { ok: false, kind: 'aborted', message: '' };
    return { ok: false, kind: 'failed', message: timeout.aborted ? TIMEOUT : NETWORK };
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const parsed = schema.safeParse(body);
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, kind: 'failed', message: UNEXPECTED };
  }
  const error = apiErrorSchema.safeParse(body);
  const code = error.success ? error.data.error : 'internal';
  const kind = response.status === 400 ? 'rejected' : 'failed';
  return { ok: false, kind, code, message: MESSAGES[code] };
}

const post = (payload: object): RequestInit => ({ method: 'POST', body: JSON.stringify(payload) });

export function createApiClient(fetchImpl: typeof fetch = fetch.bind(globalThis)): ApiClient {
  return {
    state: (moves, signal) =>
      call(fetchImpl, '/api/game/state', gameStateSchema, post({ moves }), signal),
    botMove: (moves, level: Level, signal) =>
      call(fetchImpl, '/api/game/bot-move', gameStateSchema, post({ moves, level }), signal),
    health: (signal) => call(fetchImpl, '/api/health', healthSchema, { method: 'GET' }, signal),
    control: (signal) =>
      call(fetchImpl, '/api/control', controlStatusSchema, { method: 'GET' }, signal),
    startListening: (url, token) =>
      call(fetchImpl, '/api/control/start', controlStatusSchema, post({ url, token }), undefined),
    stopListening: () =>
      call(fetchImpl, '/api/control/stop', controlStatusSchema, post({}), undefined),
  };
}
