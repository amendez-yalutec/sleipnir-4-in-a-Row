/** Pausas crecientes ante errores: ningún ciclo contra el árbitro sin pausa (invariante 8). */
export interface Backoff {
  next(): number;
  reset(): void;
}

/** Red caída o 5xx en `next`: 1, 2, 4 y 5 s; tope de 5 s para no acercarse a los 30 s de ausencia. */
export const NETWORK_STEPS_MS = [1_000, 2_000, 4_000, 5_000] as const;
/** Token inválido o configuración rota (401, 3xx): de 5 a 60 s. */
export const AUTH_STEPS_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;

export function createBackoff(steps: readonly number[]): Backoff {
  let attempt = 0;
  return {
    next() {
      const delay = steps[Math.min(attempt, steps.length - 1)] ?? 0;
      attempt++;
      return delay;
    },
    reset() {
      attempt = 0;
    },
  };
}
