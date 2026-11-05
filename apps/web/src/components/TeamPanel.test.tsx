/** Panel "Mi equipo" en la app real, con un árbitro falso (sin red). */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { createFakeClient } from '../api/fake-client.ts';
import { type ArbiterClient, ArbiterError } from '../arbiter/client.ts';

function fakeArbiter(overrides: Partial<ArbiterClient> = {}): ArbiterClient {
  return {
    health: vi.fn(() => Promise.resolve({ phase: 'practice' })),
    me: vi.fn(() =>
      Promise.resolve({
        team: { id: 'eq6', name: 'Equipo 6' },
        standing: { position: 2, played: 3, won: 2, drawn: 0, lost: 1, points: 6 },
        pending_turns: [],
        submission: null,
        phase: 'practice',
      }),
    ),
    practice: vi.fn(() => Promise.resolve({ game_id: 'g_p_07' })),
    submit: vi.fn(() => Promise.resolve({ commit: 'a1b2c3d' })),
    teamGames: vi.fn(() =>
      Promise.resolve([
        {
          game_id: 'g_1',
          kind: 'league',
          status: 'finished',
          players: {
            '1': { team_id: 'eq6', name: 'Equipo 6' },
            '2': { team_id: 'eq3', name: 'Los Recursivos' },
          },
          moves: [],
          result: { winner: 1 as const, reason: 'connect4' },
        },
      ]),
    ),
    ...overrides,
  };
}

function openPanel(arbiter: ArbiterClient) {
  const makeArbiterClient = vi.fn(() => arbiter);
  render(<App client={createFakeClient()} makeArbiterClient={makeArbiterClient} />);
  return makeArbiterClient;
}

async function connect() {
  await userEvent.type(screen.getByLabelText('URL del árbitro'), 'https://arbitro.example');
  await userEvent.type(screen.getByLabelText('Team ID'), 'eq6');
  await userEvent.type(screen.getByLabelText('Token del equipo'), 'tok');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y probar' }));
}

beforeEach(() => {
  location.hash = '#equipo';
});
afterEach(() => {
  location.hash = '';
  localStorage.clear();
  sessionStorage.clear();
});

describe('panel Mi equipo', () => {
  it('con la conexión guardada muestra posición, puntos y partidas del equipo', async () => {
    const makeClient = openPanel(fakeArbiter());
    await connect();
    expect(await screen.findByRole('heading', { name: 'Equipo 6' })).toBeTruthy();
    expect(screen.getByText('2.º')).toBeTruthy();
    expect(screen.getByText('Ganamos por cuatro en línea')).toBeTruthy();
    expect(makeClient).toHaveBeenCalledWith({
      url: 'https://arbitro.example',
      teamId: 'eq6',
      token: 'tok',
    });
    expect(sessionStorage.getItem('arbitro.token')).toBe('tok');
    expect(localStorage.getItem('arbitro.token')).toBeNull();
  });

  it('valida la URL y el team ID antes de guardar', async () => {
    const makeClient = openPanel(fakeArbiter());
    await userEvent.type(screen.getByLabelText('URL del árbitro'), 'http://arbitro.example');
    await userEvent.type(screen.getByLabelText('Team ID'), 'eq 6');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y probar' }));
    expect(screen.getByText(/Usa una URL https/)).toBeTruthy();
    expect(screen.getByText(/Solo letras/)).toBeTruthy();
    expect(makeClient).not.toHaveBeenCalled();
  });

  it('crea una práctica y registra la entrega', async () => {
    const practice = vi.fn(() => Promise.resolve({ game_id: 'g_p_07' }));
    const submit = vi.fn(() => Promise.resolve({ commit: 'a1b2c3d' }));
    openPanel(fakeArbiter({ practice, submit }));
    await connect();
    await userEvent.click(await screen.findByRole('button', { name: 'Crear práctica' }));
    expect(await screen.findByText(/Práctica g_p_07 creada/)).toBeTruthy();
    expect(practice).toHaveBeenCalledWith('casa-basico', 1);

    await userEvent.type(screen.getByLabelText('URL del repositorio'), 'https://github.com/x/y');
    await userEvent.type(screen.getByLabelText('Hash del commit'), 'zz');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar entrega' }));
    expect(screen.getByText(/Hash hexadecimal/)).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Hash del commit'));
    await userEvent.type(screen.getByLabelText('Hash del commit'), 'a1b2c3d');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar entrega' }));
    expect(await screen.findByText(/Entrega registrada con el commit a1b2c3d/)).toBeTruthy();
  });

  it('un token rechazado se explica y olvidar el token lo borra de la pestaña', async () => {
    openPanel(
      fakeArbiter({
        me: () => Promise.reject(new ArbiterError('El árbitro rechazó el token.', 401)),
      }),
    );
    await connect();
    expect((await screen.findByRole('alert')).textContent).toMatch(/rechazó el token/);
    await userEvent.click(screen.getByRole('button', { name: 'Olvidar token' }));
    await waitFor(() => expect(sessionStorage.getItem('arbitro.token')).toBeNull());
  });

  it('las pestañas cambian entre jugar y el panel', async () => {
    openPanel(fakeArbiter());
    expect(screen.getByRole('link', { name: 'Mi equipo' }).getAttribute('aria-current')).toBe(
      'page',
    );
    location.hash = '';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('button', { name: 'Jugar' })).toBeTruthy();
  });
});
