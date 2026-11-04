import { describe, expect, it } from 'vitest';
import { ArbiterMonitor } from './monitor.ts';

describe('estado del ciclo para /api/health', () => {
  it('sin torneo: disabled', () => {
    expect(new ArbiterMonitor(false).snapshot()).toEqual({
      enabled: false,
      state: 'disabled',
      lastTurnAt: null,
      gamesPlayed: 0,
    });
  });

  it('cuenta partidas distintas y sigue el último evento', () => {
    const monitor = new ArbiterMonitor(true, () => new Date('2026-11-05T15:00:00Z'));
    expect(monitor.snapshot().state).toBe('starting');
    monitor.onEvent({ type: 'idle' });
    expect(monitor.snapshot().state).toBe('waiting');
    monitor.onEvent({ type: 'turn', gameId: 'g1' });
    monitor.onEvent({ type: 'turn', gameId: 'g1' });
    monitor.onEvent({ type: 'turn', gameId: 'g2' });
    expect(monitor.snapshot()).toEqual({
      enabled: true,
      state: 'playing',
      lastTurnAt: '2026-11-05T15:00:00.000Z',
      gamesPlayed: 2,
    });
    monitor.onEvent({ type: 'problem' });
    expect(monitor.snapshot().state).toBe('error');
    monitor.onEvent({ type: 'stopped' });
    expect(monitor.snapshot().state).toBe('stopped');
  });
});
