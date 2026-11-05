/** Tabla de estados de PLAN_FRONTEND.md §6, fila por fila. */
import type { GameState } from '@equipo6/contracts';
import { describe, expect, it } from 'vitest';
import {
  type Action,
  EMPTY_GAME,
  type UiState,
  canUndo,
  currentGame,
  humanPlayer,
  initialState,
  reducer,
} from './reducer.ts';

const game = (moves: number[], extra: Partial<GameState> = {}): GameState => ({
  ...EMPTY_GAME,
  moves,
  toMove: moves.length % 2 === 0 ? 1 : 2,
  ...extra,
});
const run = (state: UiState, ...actions: Action[]) => actions.reduce(reducer, state);
const playing = (humanFirst = true) =>
  run(initialState, { type: 'configure', humanFirst }, { type: 'start' });

describe('máquina de estados de la partida', () => {
  it('setup → Jugar (empiezo yo) → humanTurn', () => {
    const state = playing(true);
    expect(state.phase).toBe('humanTurn');
    expect(currentGame(state)).toBe(EMPTY_GAME);
    expect(humanPlayer(state)).toBe(1);
  });

  it('setup → Jugar (empieza el bot) → botThinking', () => {
    const state = playing(false);
    expect(state.phase).toBe('botThinking');
    expect(humanPlayer(state)).toBe(2);
  });

  it('configure solo cambia opciones en setup', () => {
    const state = run(initialState, { type: 'configure', level: 'hard' });
    expect(state.level).toBe('hard');
    expect(run(playing(), { type: 'configure', level: 'easy' }).level).toBe('medium');
  });

  it('humanTurn + clic en columna disponible → checking con la columna', () => {
    const state = run(playing(), { type: 'columnClicked', column: 3 });
    expect(state).toMatchObject({ phase: 'checking', pendingColumn: 3, notice: null });
  });

  it('humanTurn + clic en columna llena → sigue en humanTurn con aviso', () => {
    const full = { ...playing(), history: [game([], { legalMoves: [0, 1, 2, 4, 5, 6, 7] })] };
    const state = run(full, { type: 'columnClicked', column: 3 });
    expect(state.phase).toBe('humanTurn');
    expect(state.notice).toMatchObject({
      tone: 'warning',
      text: 'Esa columna está llena. Elige otra.',
    });
  });

  it('checking + la API confirma → botThinking, o finished si terminó', () => {
    const checking = run(playing(), { type: 'columnClicked', column: 3 });
    expect(run(checking, { type: 'humanConfirmed', game: game([3]) }).phase).toBe('botThinking');
    const won = game([0, 0, 1, 1, 2, 2, 3], { status: 'won', winner: 1 });
    const final = run(checking, { type: 'humanConfirmed', game: won });
    expect(final.phase).toBe('finished');
    expect(currentGame(final)).toBe(won);
  });

  it('checking + la API rechaza → humanTurn con el motivo', () => {
    const checking = run(playing(), { type: 'columnClicked', column: 3 });
    const state = run(checking, {
      type: 'humanRejected',
      message: 'Esa jugada no se puede hacer.',
    });
    expect(state).toMatchObject({ phase: 'humanTurn', pendingColumn: null });
    expect(state.notice?.text).toBe('Esa jugada no se puede hacer.');
  });

  it('botThinking (o checking) + clic → "Espera, es turno del bot"', () => {
    for (const state of [playing(false), run(playing(), { type: 'columnClicked', column: 2 })]) {
      const next = run(state, { type: 'columnClicked', column: 1 });
      expect(next.phase).toBe(state.phase);
      expect(next.notice?.text).toBe('Espera, es turno del bot.');
    }
  });

  it('botThinking + respuesta del bot → humanTurn (o finished) con "Cómo pensó el bot"', () => {
    const bot = { column: 3, depth: 9, nodes: 1000, ms: 150, score: 12, level: 'medium' as const };
    const state = run(playing(false), { type: 'botMoved', game: game([3], { bot }) });
    expect(state.phase).toBe('humanTurn');
    expect(state.insight).toEqual(bot);
    const lost = run(playing(false), {
      type: 'botMoved',
      game: game([3], { status: 'won', winner: 1 }),
    });
    expect(lost).toMatchObject({ phase: 'finished', insight: null });
  });

  it('humanTurn + Deshacer → retira tu jugada y la del bot', () => {
    let state = playing(true);
    state = run(
      state,
      { type: 'columnClicked', column: 3 },
      { type: 'humanConfirmed', game: game([3]) },
      { type: 'botMoved', game: game([3, 4]) },
    );
    expect(canUndo(state)).toBe(true);
    const undone = run(state, { type: 'undo' });
    expect(currentGame(undone).moves).toEqual([]);
    expect(canUndo(undone)).toBe(false);
    expect(run(undone, { type: 'undo' })).toBe(undone);
  });

  it('si empezó el bot, no se puede deshacer más allá de su primera jugada', () => {
    const state = run(playing(false), { type: 'botMoved', game: game([3]) });
    expect(canUndo(state)).toBe(false);
  });

  it('finished + Jugar otra vez → setup con las mismas opciones', () => {
    const configured = run(initialState, { type: 'configure', humanFirst: false, level: 'hard' });
    let state = run(configured, { type: 'start' });
    state = run(state, { type: 'botMoved', game: game([3], { status: 'won', winner: 1 }) });
    const again = run(state, { type: 'playAgain' });
    expect(again).toMatchObject({ phase: 'setup', humanFirst: false, level: 'hard', history: [] });
    expect(run(playing(), { type: 'playAgain' }).phase).toBe('humanTurn');
  });

  it('falla de red → error con mensaje; Reintentar → la fase que falló', () => {
    const thinking = playing(false);
    const failed = run(thinking, { type: 'failed', message: 'No hay conexión con el bot.' });
    expect(failed).toMatchObject({ phase: 'error', resumePhase: 'botThinking' });
    expect(failed.notice).toMatchObject({ tone: 'error' });
    expect(run(failed, { type: 'retry' })).toMatchObject({ phase: 'botThinking', notice: null });

    const checking = run(playing(), { type: 'columnClicked', column: 5 });
    const retried = run(checking, { type: 'failed', message: 'x' }, { type: 'retry' });
    expect(retried).toMatchObject({ phase: 'checking', pendingColumn: 5 });
  });

  it('Reiniciar vuelve a setup desde cualquier fase', () => {
    expect(run(playing(false), { type: 'reset' }).phase).toBe('setup');
  });

  it('posición cargada desde la URL: la persona juega con el color al que le toca', () => {
    const loaded = run(initialState, { type: 'loaded', game: game([3, 4, 3]) });
    expect(loaded).toMatchObject({ phase: 'humanTurn', humanFirst: false });
    const over = run(initialState, {
      type: 'loaded',
      game: game([0, 0, 1, 1, 2, 2, 3], { status: 'won', winner: 1 }),
    });
    expect(over.phase).toBe('finished');
  });

  it('acciones fuera de lugar no cambian nada', () => {
    const setup = initialState;
    for (const action of [
      { type: 'columnClicked', column: 1 },
      { type: 'humanConfirmed', game: game([1]) },
      { type: 'humanRejected', message: 'x' },
      { type: 'botMoved', game: game([1]) },
      { type: 'failed', message: 'x' },
      { type: 'retry' },
    ] as const) {
      expect(run(setup, action)).toBe(setup);
    }
    expect(run(playing(), { type: 'start' }).phase).toBe('humanTurn');
  });

  it('cerrar el aviso', () => {
    const state = run(
      playing(false),
      { type: 'columnClicked', column: 1 },
      { type: 'dismissNotice' },
    );
    expect(state.notice).toBeNull();
  });
});
