import { describe, expect, it } from 'vitest';
import { parseMockConfig } from './config.ts';
import { hasFaults } from './faults.ts';

describe('configuración del mock', () => {
  it('valores por defecto: 127.0.0.1:8787, plazos del OpenAPI y sin fallas', () => {
    const config = parseMockConfig({});
    expect(config).toMatchObject({
      port: 8787,
      host: '127.0.0.1',
      deadlineMs: 3000,
      absenceMs: 30000,
      practiceOpen: true,
      submissionsOpen: true,
      logger: false,
    });
    expect(config.teams.map((team) => team.id)).toEqual(['eq6', 'rival']);
    expect(hasFaults(config.faults ?? {})).toBe(false);
  });

  it('lee equipos, fallas y banderas', () => {
    const config = parseMockConfig({
      MOCK_TEAMS: 'a:tok-a:Equipo A; b:tok-b:Equipo: B',
      MOCK_LATENCY_MS: '800',
      MOCK_ERROR_RATE: '0.2',
      MOCK_PRACTICE_OPEN: 'false',
      MOCK_LOG: 'true',
    });
    expect(config.teams).toEqual([
      { id: 'a', token: 'tok-a', name: 'Equipo A', members: [] },
      { id: 'b', token: 'tok-b', name: 'Equipo: B', members: [] },
    ]);
    expect(config.faults).toMatchObject({ latencyMs: 800, errorRate: 0.2 });
    expect(hasFaults(config.faults ?? {})).toBe(true);
    expect(config.practiceOpen).toBe(false);
    expect(config.logger).toBe(true);
  });

  it.each([
    { MOCK_PORT: 'abc' },
    { MOCK_PORT: '70000' },
    { MOCK_ERROR_RATE: '1.5' },
    { MOCK_DEADLINE_MS: '-1' },
    { MOCK_PRACTICE_OPEN: 'sí' },
    { MOCK_TEAMS: 'solo-id' },
  ])('rechaza %j con un mensaje que nombra la variable', (env) => {
    const [name] = Object.keys(env);
    expect(() => parseMockConfig(env)).toThrow(name);
  });
});
