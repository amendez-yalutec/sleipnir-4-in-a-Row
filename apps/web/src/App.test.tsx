/**
 * Partidas completas en la pantalla real, contra el cliente falso (reglas reales del motor y una
 * búsqueda corta). Cualquier `console.error` hace fallar la prueba (test-setup.ts).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { createFakeClient } from './api/fake-client.ts';

const status = () =>
  screen.getByText(/Tu turno|pensando|Colocando|Ganaste|Ganó el bot|Empate|Algo falló/);
const column = (n: number) => screen.getByRole('button', { name: new RegExp(`^Columna ${n},`) });

async function startGame(options: { botFirst?: boolean; level?: RegExp } = {}) {
  const client = createFakeClient();
  render(<App client={client} />);
  if (options.botFirst) await userEvent.click(screen.getByLabelText(/El bot/));
  if (options.level) await userEvent.click(screen.getByLabelText(options.level));
  await userEvent.click(screen.getByRole('button', { name: 'Jugar' }));
  return client;
}

/** Juega siempre la primera columna disponible hasta que termine la partida. */
async function playToTheEnd() {
  for (let turn = 0; turn < 40; turn++) {
    await waitFor(() =>
      expect(status().textContent).toMatch(/Tu turno|Ganaste|Ganó el bot|Empate/),
    );
    if (!/Tu turno/.test(status().textContent ?? '')) return;
    const free = screen
      .getAllByRole('button', { name: /^Columna \d, quedan/ })
      .find((button) => button.getAttribute('aria-disabled') !== 'true');
    if (!free) return;
    await userEvent.click(free);
  }
}

describe('una partida completa en la app', () => {
  it('empezando yo: juego hasta el final y aparece el resultado', async () => {
    await startGame();
    expect(status().textContent).toBe('Tu turno: elige una columna.');
    await playToTheEnd();
    expect(status().textContent).toMatch(/Ganaste|Ganó el bot|Empate/);
    await userEvent.click(screen.getByRole('button', { name: 'Jugar otra vez' }));
    expect(screen.getByRole('heading', { name: 'Nueva partida' })).toBeTruthy();
  });

  it('empezando el bot: juega primero y explica cómo pensó', async () => {
    const client = await startGame({ botFirst: true, level: /Difícil/ });
    await waitFor(() => expect(status().textContent).toBe('Tu turno: elige una columna.'));
    expect(client.calls[0]).toBe('bot  hard');
    expect(screen.getByText('Cómo pensó el bot').parentElement?.textContent).toMatch(/Profundidad/);
    expect(screen.getByText(/1\. Bot → columna/)).toBeTruthy();
    await playToTheEnd();
  });

  it('teclas 1–8, deshacer y reiniciar', async () => {
    const client = await startGame();
    await userEvent.keyboard('4');
    await waitFor(() => expect(screen.getByText('1. Tú → columna 4')).toBeTruthy());
    await waitFor(() => expect(status().textContent).toBe('Tu turno: elige una columna.'));
    expect(client.calls.slice(0, 2)).toEqual(['state 3', 'bot 3 medium']);

    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(screen.getByText('Todavía no hay jugadas.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deshacer' })).toHaveProperty('disabled', true);

    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }));
    expect(screen.getByRole('heading', { name: 'Nueva partida' })).toBeTruthy();
  });

  it('columna llena: aviso y no se manda nada a la API', async () => {
    const client = createFakeClient();
    // Siete fichas alternadas en la columna 0 (sin cuatro en línea): llena, y le toca al 2.
    render(<App client={client} initialMoves="0,0,0,0,0,0,0" />);
    await waitFor(() => expect(column(1).getAttribute('aria-label')).toBe('Columna 1, llena'));
    const calls = client.calls.length;
    await userEvent.click(column(1));
    expect(screen.getByRole('alert').textContent).toBe('Esa columna está llena. Elige otra.');
    expect(client.calls).toHaveLength(calls);
  });

  it('falla de red: mensaje claro, Reintentar y la partida sigue', async () => {
    const client = await startGame();
    client.failNext();
    await userEvent.click(column(5));
    await waitFor(() => expect(status().textContent).toBe('Algo falló.'));
    expect(screen.getByRole('alert').textContent).toBe('No hay conexión con el bot.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('1. Tú → columna 5')).toBeTruthy());
  });

  it('posición desde la URL (?moves=, columnas 0–7): juegas con el color al que le toca', async () => {
    render(<App client={createFakeClient()} initialMoves="3,4,3" />);
    await waitFor(() => expect(screen.getByText('3. Bot → columna 4')).toBeTruthy());
    expect(screen.getByText('2. Tú → columna 5')).toBeTruthy();
    expect(status().textContent).toBe('Tu turno: elige una columna.');
  });

  it('una URL con jugadas mal escritas se ignora', async () => {
    render(<App client={createFakeClient()} initialMoves="9,x" />);
    expect(await screen.findByRole('heading', { name: 'Nueva partida' })).toBeTruthy();
  });
});
