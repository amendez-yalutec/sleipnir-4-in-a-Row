/**
 * Conecta la máquina de estados con la API: cuando la fase lo pide, hace la llamada y despacha el
 * resultado. Cada llamada se cancela si la fase cambia antes (y en el doble montaje de StrictMode).
 */
import { useCallback, useEffect, useReducer } from 'react';
import type { ApiClient } from '../api/types.ts';
import { columnFromKey } from '../ui/coords.ts';
import { type Action, currentGame, initialState, reducer } from './reducer.ts';

/** `?moves=3,4,3` (columnas 0–7, como la API) → lista; `null` si el formato no sirve. */
export function parseMovesParam(value: string | null): number[] | null {
  if (!value || !/^[0-7](,[0-7]){0,55}$/.test(value)) return null;
  return value.split(',').map(Number);
}

export function useGame(client: ApiClient, initialMoves: string | null = null) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const game = currentGame(state);
  const { phase, pendingColumn, level } = state;

  // Jugada de la persona: la API la valida y devuelve el tablero nuevo.
  useEffect(() => {
    if (phase !== 'checking' || pendingColumn === null) return;
    const controller = new AbortController();
    void client.state([...game.moves, pendingColumn], controller.signal).then((result) => {
      if (result.ok) dispatch({ type: 'humanConfirmed', game: result.data });
      else if (result.kind === 'rejected') {
        dispatch({ type: 'humanRejected', message: result.message });
      } else if (result.kind === 'failed') dispatch({ type: 'failed', message: result.message });
    });
    return () => controller.abort();
  }, [client, phase, pendingColumn, game]);

  // Turno del bot.
  useEffect(() => {
    if (phase !== 'botThinking') return;
    const controller = new AbortController();
    void client.botMove(game.moves, level, controller.signal).then((result) => {
      if (result.ok) dispatch({ type: 'botMoved', game: result.data });
      else if (result.kind !== 'aborted') dispatch({ type: 'failed', message: result.message });
    });
    return () => controller.abort();
  }, [client, phase, game, level]);

  // Posición desde la URL (?moves=), para demos, pruebas y el manual.
  useEffect(() => {
    const moves = parseMovesParam(initialMoves);
    if (!moves) return;
    const controller = new AbortController();
    void client.state(moves, controller.signal).then((result) => {
      if (result.ok) dispatch({ type: 'loaded', game: result.data });
    });
    return () => controller.abort();
  }, [client, initialMoves]);

  // Teclas 1–8.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
      const column = columnFromKey(event.key);
      if (column !== null) dispatch({ type: 'columnClicked', column });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const send = useCallback((action: Action) => dispatch(action), []);
  return { state, game, send };
}
