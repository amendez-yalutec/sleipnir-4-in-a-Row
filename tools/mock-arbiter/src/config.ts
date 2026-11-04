/** Configuración del árbitro simulado desde variables de entorno (todas opcionales). */
import type { TeamInfo } from './game.ts';
import type { MockServerOptions } from './server.ts';

export interface MockConfig extends MockServerOptions {
  readonly port: number;
  readonly host: string;
}

/** Tokens de juguete, solo para el mock local. El token real nunca va en el repo. */
const DEFAULT_TEAMS: readonly TeamInfo[] = [
  {
    id: 'eq6',
    name: 'Equipo 6',
    token: 'token-local-eq6',
    members: [
      'Pedro Alexander Lancerio Alvarado',
      'Daniel Alberto Mendez Díaz',
      'Henry David Juárez Alvarado',
      'Luis Eduardo Godoy Morales',
    ],
  },
  { id: 'rival', name: 'Rival local', token: 'token-local-rival', members: [] },
];

type Env = Readonly<Record<string, string | undefined>>;

function number(env: Env, name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${name} debe ser un número entre 0 y ${max} (recibido: "${raw}").`);
  }
  return value;
}

function flag(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw !== 'true' && raw !== 'false') throw new Error(`${name} debe ser true o false.`);
  return raw === 'true';
}

/** `MOCK_TEAMS="id:token:Nombre;id2:token2:Nombre 2"`. */
function teams(raw: string | undefined): readonly TeamInfo[] {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TEAMS;
  return raw.split(';').map((entry) => {
    const [rawId = '', rawToken = '', ...rest] = entry.split(':');
    const [id, token, name] = [rawId.trim(), rawToken.trim(), rest.join(':').trim()];
    if (!id || !token || !name) {
      throw new Error(`MOCK_TEAMS: "${entry}" no tiene la forma id:token:Nombre.`);
    }
    return { id, token, name, members: [] };
  });
}

export function parseMockConfig(env: Env): MockConfig {
  return {
    port: number(env, 'MOCK_PORT', 8787, 65_535),
    host: env.MOCK_HOST ?? '127.0.0.1',
    teams: teams(env.MOCK_TEAMS),
    seed: number(env, 'MOCK_SEED', 6),
    deadlineMs: number(env, 'MOCK_DEADLINE_MS', 3_000),
    absenceMs: number(env, 'MOCK_ABSENCE_MS', 30_000),
    practiceOpen: flag(env, 'MOCK_PRACTICE_OPEN', true),
    submissionsOpen: flag(env, 'MOCK_SUBMISSIONS_OPEN', true),
    faults: {
      latencyMs: number(env, 'MOCK_LATENCY_MS', 0),
      jitterMs: number(env, 'MOCK_JITTER_MS', 0),
      errorRate: number(env, 'MOCK_ERROR_RATE', 0, 1),
      dropRate: number(env, 'MOCK_DROP_RATE', 0, 1),
    },
    logger: flag(env, 'MOCK_LOG', false),
  };
}
