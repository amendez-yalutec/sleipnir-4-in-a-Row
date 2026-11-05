import { type Position, replay } from '@equipo6/engine';
import { describe, expect, it } from 'vitest';
import { fallbackChooser } from '../chooser/fallback.ts';
import type { MoveChooser } from '../chooser/types.ts';
import type { Level } from '../log.ts';
import { ArbiterHttpError } from './client.ts';
import { SAFETY_MARGIN_MS, type TurnDeps, budgetFor, piecesOn, playTurn } from './play-turn.ts';
import { type ArbiterTurn, type HttpResponse, parseNext } from './schema.ts';

const EMPTY = Array.from({ length: 7 }, () => Array<number>(8).fill(0));

/** Ejemplo de turno del OpenAPI 0.9.0 (inconsistente). */
const OPENAPI_TURN = {
  status: 'turn',
  game_id: 'g_7f3a',
  kind: 'league',
  you: 2,
  opponent: 'Los Recursivos',
  turn: 9,
  board: [
    [0, 0, 1, 2, 1, 0, 0, 0],
    [0, 0, 2, 1, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 0, 0, 0],
    ...EMPTY.slice(3),
  ],
  moves: [3, 2, 3, 2, 4, 3, 2, 3],
  legal_moves: [0, 1, 2, 3, 4, 5, 6, 7],
  deadline_ms: 3000,
};

function turnFrom(body: object): ArbiterTurn {
  const result = parseNext({ status: 200, body: { ...OPENAPI_TURN, ...body } });
  if (result.kind !== 'turn') return expect.fail(result.kind);
  return result.turn;
}

type MoveReply = HttpResponse | Error;

function setup(options: { chooser?: MoveChooser; replies?: MoveReply[]; clock?: number[] } = {}) {
  const sent: { gameId: string; column: number; timeoutMs: number }[] = [];
  const logs: { level: Level; event: string; data: Record<string, unknown> }[] = [];
  const replies = [...(options.replies ?? [{ status: 200, body: { ok: true, state: 'playing' } }])];
  const ticks = [...(options.clock ?? [])];
  const deps: TurnDeps = {
    client: {
      move(gameId, column, timeoutMs) {
        sent.push({ gameId, column, timeoutMs });
        const reply = replies.shift() ?? { status: 200, body: { ok: true, state: 'playing' } };
        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
      },
    },
    chooser: options.chooser ?? fallbackChooser,
    log: (level, event, data = {}) => logs.push({ level, event, data }),
    signal: new AbortController().signal,
    now: () => ticks.shift() ?? 0,
    thinkSoftMs: 1_400,
    thinkHardMs: 1_800,
  };
  return { deps, sent, logs, events: () => logs.map((entry) => entry.event) };
}

describe('presupuesto', () => {
  it('con 3,000 ms: soft 1,400 y hard 1,800; se adapta si cambia deadline_ms', () => {
    expect(budgetFor(3_000, 1_400, 1_800)).toEqual({ softMs: 1_400, hardMs: 1_800 });
    // Topes nuevos: hard ≤ 0.72 · plazo y soft ≤ 0.6 · plazo (antes 0.6 y 0.47).
    expect(budgetFor(2_000, 1_400, 1_800)).toEqual({ softMs: 1_200, hardMs: 1_440 });
    // Aunque se configure de más, nunca pasa de 2,160 ms con el plazo de 3 s.
    expect(budgetFor(3_000, 2_500, 2_800)).toEqual({ softMs: 1_800, hardMs: 2_160 });
  });

  it('reparte el tiempo por fase: poco en la apertura, todo en el medio juego', () => {
    expect(budgetFor(3_000, 1_800, 2_200, 0)).toEqual({ softMs: 1_080, hardMs: 2_160 });
    expect(budgetFor(3_000, 1_800, 2_200, 5)).toEqual({ softMs: 1_080, hardMs: 2_160 });
    expect(budgetFor(3_000, 1_800, 2_200, 6)).toEqual({ softMs: 2_160, hardMs: 2_160 });
    expect(budgetFor(3_000, 1_800, 2_200, 24)).toEqual({ softMs: 2_160, hardMs: 2_160 });
    expect(budgetFor(3_000, 1_800, 2_200, 25)).toEqual({ softMs: 1_800, hardMs: 2_160 });
  });

  it('cuenta las fichas del tablero', () => {
    expect(piecesOn(EMPTY)).toBe(0);
    const board = EMPTY.map((row) => [...row]);
    board[0][3] = 1;
    board[0][4] = 2;
    board[1][3] = 1;
    expect(piecesOn(board)).toBe(3);
  });
});

describe('un turno', () => {
  it('en una posición del libro juega la del libro sin buscar', async () => {
    const moves = [3, 3, 3, 3, 3, 4, 4, 4, 4, 6, 7, 1, 4, 4, 3, 1, 4];
    const state = replay(moves);
    const arbiterBoard = state.board.map((row) => [...row]);
    const chooser: MoveChooser = { choose: () => Promise.reject(new Error('no debería buscar')) };
    const turn = turnFrom({ board: arbiterBoard, you: 2, legal_moves: [0, 1, 2, 3, 5, 6, 7] });
    const { deps, sent, logs } = setup({ chooser });
    await playTurn(deps, turn, 0);
    expect(sent[0]?.column).toBe(1);
    expect(logs.at(-1)).toMatchObject({ event: 'jugada', data: { source: 'libro' } });
  });

  it('tras una jugada aceptada piensa en el turno del rival (y no si la partida terminó)', async () => {
    const pondered: Position[] = [];
    const chooser: MoveChooser = {
      choose: () => Promise.resolve({ column: 3 }),
      ponder: (position) => pondered.push(position),
    };
    const empty = turnFrom({ board: EMPTY, you: 1, legal_moves: [0, 1, 2, 3, 4, 5, 6, 7] });
    await playTurn(setup({ chooser }).deps, empty, 0);
    expect(pondered).toHaveLength(1);
    expect(pondered[0]?.toMove).toBe(2);
    expect(pondered[0]?.board[0]?.[3]).toBe(1);

    const won = [{ status: 200, body: { ok: true, state: 'won' } }];
    await playTurn(setup({ chooser, replies: won }).deps, empty, 0);
    expect(pondered).toHaveLength(1);
  });

  it('el ejemplo inconsistente del OpenAPI → jugada legal y advertencias en el log', async () => {
    const { deps, sent, logs } = setup();
    const result = await playTurn(deps, turnFrom({}), 0);
    expect(result).toMatchObject({ kind: 'accepted' });
    expect(OPENAPI_TURN.legal_moves).toContain(sent[0]?.column);
    expect(logs.filter((entry) => entry.event === 'turno_inconsistente')).toHaveLength(2);
    expect(logs.at(-1)).toMatchObject({ event: 'jugada', data: { game_id: 'g_7f3a', you: 2 } });
  });

  it('si la búsqueda elige una columna fuera de legal_moves, se envía la más central legal', async () => {
    const chooser: MoveChooser = { choose: () => Promise.resolve({ column: 9 }) };
    const { deps, sent, events } = setup({ chooser });
    await playTurn(deps, turnFrom({ legal_moves: [0, 6, 7] }), 0);
    expect(sent.map((move) => move.column)).toEqual([6]);
    expect(events()).toContain('jugada_fuera_de_legal_moves');
  });

  it('si la búsqueda no responde, el temporizador de seguridad juega el respaldo', async () => {
    const chooser: MoveChooser = { choose: () => new Promise(() => undefined) };
    const { deps, sent, logs } = setup({ chooser });
    const started = performance.now();
    await playTurn({ ...deps, thinkHardMs: 50 }, turnFrom({}), 0);
    expect(performance.now() - started).toBeLessThan(50 + SAFETY_MARGIN_MS + 200);
    expect(sent).toHaveLength(1);
    expect(logs.at(-1)?.data.source).toBe('temporizador');
  });

  it('si la búsqueda falla, juega el respaldo y lo registra', async () => {
    const chooser: MoveChooser = { choose: () => Promise.reject(new Error('worker caído')) };
    const { deps, sent, events } = setup({ chooser });
    await playTurn(deps, turnFrom({}), 0);
    expect(sent).toHaveLength(1);
    expect(events()).toContain('busqueda_fallo');
  });

  it('con una sola jugada legal no consulta la búsqueda', async () => {
    const chooser: MoveChooser = { choose: () => Promise.reject(new Error('no debería llamarse')) };
    const { deps, sent } = setup({ chooser });
    await playTurn(deps, turnFrom({ legal_moves: [5] }), 0);
    expect(sent.map((move) => move.column)).toEqual([5]);
  });

  it('con un tablero imposible juega la más central de legal_moves', async () => {
    const { deps, sent, logs } = setup();
    await playTurn(deps, turnFrom({ board: 'roto', legal_moves: [1, 2, 7] }), 0);
    expect(sent.map((move) => move.column)).toEqual([2]);
    expect(logs.at(-1)?.data.source).toBe('respaldo');
  });

  it('sin jugadas legales no envía nada', async () => {
    const { deps, sent, events } = setup();
    expect(await playTurn(deps, turnFrom({ legal_moves: [] }), 0)).toBeNull();
    expect(sent).toEqual([]);
    expect(events()).toContain('sin_jugadas_legales');
  });
});

describe('envío con reintentos', () => {
  it('reintenta ante 5xx y error de red mientras haya tiempo', async () => {
    const replies: MoveReply[] = [
      { status: 503, body: undefined },
      new ArbiterHttpError('network', 'se cortó'),
      { status: 200, body: { ok: true, state: 'won', turn: 7 } },
    ];
    const { deps, sent, logs } = setup({ replies });
    const result = await playTurn(deps, turnFrom({}), 0);
    expect(result).toMatchObject({ kind: 'accepted', state: 'won' });
    expect(sent).toHaveLength(3);
    expect(logs.at(-1)?.data).toMatchObject({ attempts: 3, state: 'won' });
  });

  it('un 409 al reintentar significa que la primera ya se había registrado: no penaliza', async () => {
    const replies: MoveReply[] = [
      new ArbiterHttpError('timeout', 'sin respuesta'),
      { status: 409, body: { ok: false, error: 'not_your_turn' } },
    ];
    const { deps, events } = setup({ replies });
    expect(await playTurn(deps, turnFrom({}), 0)).toMatchObject({ kind: 'not_your_turn' });
    expect(events().at(-1)).toBe('jugada_409');
  });

  it('no reintenta pasados 2,600 ms desde que se recibió el turno', async () => {
    // Lecturas del reloj: think_ms (0), timeout del POST (0) y, al fallar, ya van 2,700 ms.
    const { deps, sent, events } = setup({
      replies: [{ status: 500, body: undefined }],
      clock: [0, 0, 2_700, 2_700],
    });
    expect(await playTurn(deps, turnFrom({}), 0)).toMatchObject({ kind: 'server_error' });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.timeoutMs).toBe(3_000);
    expect(events().at(-1)).toBe('jugada_sin_confirmar');
  });

  it('400 illegal_move o timeout: error visible (la partida se pierde)', async () => {
    const replies = [{ status: 400, body: { ok: false, error: 'timeout', message: 'tarde' } }];
    const { deps, logs } = setup({ replies });
    expect(await playTurn(deps, turnFrom({}), 0)).toMatchObject({ kind: 'rejected' });
    expect(logs.at(-1)).toMatchObject({ level: 'error', event: 'jugada_rechazada' });
  });

  it('si se cancela el ciclo no reintenta', async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps, sent } = setup({ replies: [new ArbiterHttpError('aborted', 'cancelada')] });
    expect(await playTurn({ ...deps, signal: controller.signal }, turnFrom({}), 0)).toBeNull();
    expect(sent).toHaveLength(1);
  });
});
