/** Rutas del OpenAPI del árbitro. Cada cuerpo se valida con el esquema del propio OpenAPI. */
import type { Player } from '@equipo6/engine';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import type { MockArbiter } from './arbiter.ts';
import type { HouseBotName } from './house-bots.ts';
import { describeErrors, schemaAt } from './openapi.ts';
import { type Reply, errorReply } from './replies.ts';

const IDLE = { status: 'idle' } as const;
const MAX_WAIT_S = 25;
const DEFAULT_WAIT_S = 20;

const validateMove = schemaAt('#/components/schemas/MoveRequest');
const validatePractice = schemaAt('#/components/schemas/PracticeRequest');
const validateSubmission = schemaAt('#/components/schemas/Submission');

const unauthorized = errorReply(401, 'unauthorized', 'Token inválido.');
const invalid = (validate: ValidateFunction) =>
  errorReply(400, 'validation', describeErrors(validate));
const send = (reply: FastifyReply, { status, body }: Reply) => reply.code(status).send(body);

/** `wait` del query: entero de 0 a 25; 20 si no viene. `null` si es inválido. */
export function parseWait(query: unknown): number | null {
  const raw = (query as { wait?: unknown } | undefined)?.wait;
  if (raw === undefined) return DEFAULT_WAIT_S;
  if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw)) return null;
  const wait = Number(raw);
  return wait <= MAX_WAIT_S ? wait : null;
}

/** Espera hasta que el equipo tenga turno, venza el plazo o el cliente cierre la conexión. */
function waitForTurn(arbiter: MockArbiter, teamId: string, ms: number, reply: FastifyReply) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      reply.raw.off('close', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const unsubscribe = arbiter.subscribe(teamId, done);
    reply.raw.once('close', done);
  });
}

export function registerArbiterRoutes(app: FastifyInstance, arbiter: MockArbiter): void {
  const authenticate = (request: FastifyRequest) => {
    const header = request.headers.authorization ?? '';
    return header.startsWith('Bearer ') ? arbiter.teamByToken(header.slice(7)) : undefined;
  };

  app.get('/api/next', async (request, reply) => {
    const team = authenticate(request);
    if (!team) return send(reply, unauthorized);
    const wait = parseWait(request.query);
    if (wait === null) {
      return send(reply, errorReply(400, 'validation', 'wait debe ser un entero de 0 a 25.'));
    }
    const ready = arbiter.nextTurn(team);
    if (ready) return ready;
    if (wait > 0) await waitForTurn(arbiter, team.id, wait * 1000, reply);
    return arbiter.nextTurn(team) ?? IDLE;
  });

  app.post('/api/move', (request, reply) => {
    const team = authenticate(request);
    if (!team) return send(reply, unauthorized);
    if (!validateMove(request.body)) return send(reply, invalid(validateMove));
    const { game_id, column } = request.body as { game_id: string; column: number };
    return send(reply, arbiter.submitMove(team, game_id, column));
  });

  app.post('/api/practice', (request, reply) => {
    const team = authenticate(request);
    if (!team) return send(reply, unauthorized);
    if (!validatePractice(request.body)) return send(reply, invalid(validatePractice));
    // OpenAPI 1.0.1: opponent es opcional y por defecto casa-basico.
    const { opponent = 'casa-basico', first = 1 } = request.body as {
      opponent?: HouseBotName;
      first?: Player;
    };
    return send(reply, arbiter.createPractice(team, opponent, first));
  });

  app.get('/api/me', (request, reply) => {
    const team = authenticate(request);
    if (!team) return send(reply, unauthorized);
    const row = arbiter.standings().find((standing) => standing.team.id === team.id);
    return {
      team: { id: team.id, name: team.name, members: [...team.members] },
      standing: row && {
        position: row.position,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        points: row.points,
      },
      pending_turns: arbiter.pendingTurns(team.id),
      submission: arbiter.submissionOf(team.id),
      phase: arbiter.phase,
    };
  });

  app.put('/api/me/submission', (request, reply) => {
    const team = authenticate(request);
    if (!team) return send(reply, unauthorized);
    if (!validateSubmission(request.body)) return send(reply, invalid(validateSubmission));
    const { repo_url, commit } = request.body as { repo_url: string; commit: string };
    return send(reply, arbiter.registerSubmission(team, { repo_url, commit }));
  });
}
