import { describe, expect, it } from 'vitest';
import { AUTH_STEPS_MS, NETWORK_STEPS_MS, createBackoff } from './backoff.ts';

describe('pausas crecientes', () => {
  it('red: 1, 2, 4, 5 s y se queda en 5 s (lejos de los 30 s de ausencia)', () => {
    const backoff = createBackoff(NETWORK_STEPS_MS);
    expect(Array.from({ length: 6 }, () => backoff.next())).toEqual([
      1000, 2000, 4000, 5000, 5000, 5000,
    ]);
  });

  it('token inválido: de 5 a 60 s; reset vuelve al principio', () => {
    const backoff = createBackoff(AUTH_STEPS_MS);
    expect(Array.from({ length: 6 }, () => backoff.next())).toEqual([
      5000, 10000, 20000, 40000, 60000, 60000,
    ]);
    backoff.reset();
    expect(backoff.next()).toBe(5000);
  });

  it('sin pasos no hay pausa', () => {
    expect(createBackoff([]).next()).toBe(0);
  });
});
