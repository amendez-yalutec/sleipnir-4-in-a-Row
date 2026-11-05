import type { ApiError, ControlStatus, GameState, Health, Level } from '@equipo6/contracts';

/**
 * Resultado de una llamada a la API:
 * - `rejected`: la API dijo que la jugada no vale (400); se vuelve a "tu turno" con el motivo;
 * - `failed`: red, tiempo, servidor ocupado o error; se muestra "Reintentar";
 * - `aborted`: la llamada se canceló (la pantalla ya no la necesita).
 */
export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly kind: 'rejected' | 'failed' | 'aborted';
      readonly message: string;
      readonly code?: ApiError['error'];
    };

export interface ApiClient {
  state(moves: readonly number[], signal?: AbortSignal): Promise<ApiResult<GameState>>;
  botMove(
    moves: readonly number[],
    level: Level,
    signal?: AbortSignal,
  ): Promise<ApiResult<GameState>>;
  health(signal?: AbortSignal): Promise<ApiResult<Health>>;
  /** Estado del bot del torneo; falla con 404 donde no se puede controlar (Vercel). */
  control(signal?: AbortSignal): Promise<ApiResult<ControlStatus>>;
  /** Inicia la escucha del torneo con la URL y el token del panel "Mi equipo" (solo en la laptop). */
  startListening(url: string, token: string): Promise<ApiResult<ControlStatus>>;
  stopListening(): Promise<ApiResult<ControlStatus>>;
}
