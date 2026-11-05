/** Panel "Mi equipo" en la app real, con un árbitro falso (sin red). */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { createFakeClient } from '../api/fake-client.ts';
import { type ArbiterClient, ArbiterError } from '../arbiter/client.ts';

const EMPTY_BOARD = Array.from({ length: 7 }, () => Array<number>(8).fill(0));

/** Partida del árbitro con su tablero: nuestro equipo abre y lleva dos jugadas en la columna 3. */
function detail(id: string, finished: boolean) {
  const board = EMPTY_BOARD.map((row) => [...row]);
  board[0][3] = 1;
  board[0][4] = 2;
  return {
    game_id: id,
    kind: 'practice',
    status: finished ? 'finished' : 'playing',
    players: {
      '1': { team_id: 'eq6', name: 'Equipo 6' },
      '2': { team_id: 'casa-basico', name: 'casa-basico', house: true },
    },
    moves: [
      { turn: 1, by: 1 as const, column: 3 },
      { turn: 2, by: 2 as const, column: 4 },
    ],
    current: finished ? null : (1 as const),
    result: finished ? { winner: 1 as const, reason: 'connect4', winning_cells: [] } : null,
    board,
  };
}

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
    game: vi.fn((id: string) => Promise.resolve(detail(id, id !== 'g_p_09'))),
    ...overrides,
  };
}

function openPanel(arbiter: ArbiterClient, client = createFakeClient()) {
  const makeArbiterClient = vi.fn(() => arbiter);
  render(<App client={client} makeArbiterClient={makeArbiterClient} />);
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

  it('en la laptop: inicia y detiene la escucha del bot con la URL y el token guardados', async () => {
    const client = createFakeClient({ control: true });
    openPanel(fakeArbiter(), client);
    expect(await screen.findByRole('heading', { name: 'Bot del torneo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Iniciar escucha' }).hasAttribute('disabled')).toBe(
      true,
    );

    await connect();
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar escucha' }));
    expect(await screen.findByText('Escuchando: esperando turno')).toBeTruthy();
    expect(screen.getByText('· arbitro.example')).toBeTruthy();
    expect(client.calls).toContain('start https://arbitro.example');

    await userEvent.click(screen.getByRole('button', { name: 'Detener escucha' }));
    expect(await screen.findByRole('button', { name: 'Iniciar escucha' })).toBeTruthy();
    expect(client.calls).toContain('stop');
  });

  it('si el servidor no permite controlar el bot, la tarjeta no aparece', async () => {
    openPanel(fakeArbiter());
    await connect();
    await screen.findByRole('heading', { name: 'Equipo 6' });
    expect(screen.queryByRole('heading', { name: 'Bot del torneo' })).toBeNull();
  });

  it('la partida en curso del equipo aparece sola con su tablero', async () => {
    const live = { ...detail('g_p_09', false), board: undefined };
    openPanel(fakeArbiter({ teamGames: () => Promise.resolve([live]) }));
    await connect();
    expect(await screen.findByRole('heading', { name: 'Partida g_p_09' })).toBeTruthy();
    expect(await screen.findByText('Turno de nuestro bot')).toBeTruthy();
    expect(screen.getByText(/Blancas: Equipo 6 \(nuestro bot\)/)).toBeTruthy();
    expect(screen.getByRole('group', { name: /Tablero de 8 columnas/ })).toBeTruthy();
  });

  it('una partida de la lista se abre con un clic y se cierra', async () => {
    openPanel(fakeArbiter());
    await connect();
    await userEvent.click(await screen.findByRole('button', { name: 'Ver tablero de g_1' }));
    expect(await screen.findByRole('heading', { name: 'Partida g_1' })).toBeTruthy();
    // Una vez en la fila de la lista y otra en el visor.
    expect(await screen.findAllByText('Ganamos por cuatro en línea')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('heading', { name: 'Partida g_1' })).toBeNull();
  });

  it('al terminar la partida en vivo, el tablero se queda con el resultado y la lista se refresca', async () => {
    let finished = false;
    const summary = () => ({ ...detail('g_p_10', finished), board: undefined });
    const teamGames = vi.fn(() => Promise.resolve([summary()]));
    openPanel(
      fakeArbiter({
        teamGames,
        game: () => {
          const next = detail('g_p_10', finished);
          finished = true; // la segunda consulta ya la ve terminada
          return Promise.resolve(next);
        },
      }),
    );
    await connect();
    expect(await screen.findByText('Turno de nuestro bot')).toBeTruthy();
    const before = teamGames.mock.calls.length;
    expect(
      await screen.findAllByText('Ganamos por cuatro en línea', {}, { timeout: 4000 }),
    ).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Partida g_p_10' })).toBeTruthy();
    expect(teamGames.mock.calls.length).toBeGreaterThan(before);
  });

  it('al crear otra práctica, el tablero pasa de la partida terminada a la nueva', async () => {
    // Primera práctica en curso que termina; luego el panel crea la segunda.
    const finished = new Set<string>();
    const games: string[] = ['g_p_11'];
    const summary = (id: string) => ({ ...detail(id, finished.has(id)), board: undefined });
    openPanel(
      fakeArbiter({
        teamGames: () => Promise.resolve([...games].reverse().map(summary)),
        game: (id: string) => {
          const next = detail(id, finished.has(id));
          finished.add(id); // cada partida se ve en curso una vez y luego terminada
          return Promise.resolve(next);
        },
        practice: () => {
          games.push('g_p_12');
          return Promise.resolve({ game_id: 'g_p_12' });
        },
      }),
    );
    await connect();
    expect(await screen.findByRole('heading', { name: 'Partida g_p_11' })).toBeTruthy();
    expect(
      await screen.findAllByText('Ganamos por cuatro en línea', {}, { timeout: 4000 }),
    ).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Crear práctica' }));
    expect(await screen.findByRole('heading', { name: 'Partida g_p_12' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Partida g_p_11' })).toBeNull();
  });

  it('la partida en curso tiene prioridad; al cerrarla se puede ver una terminada', async () => {
    const live = { ...detail('g_p_09', false), board: undefined };
    const done = { ...detail('g_1', true), board: undefined };
    openPanel(
      fakeArbiter({
        teamGames: () => Promise.resolve([live, done]),
        game: (id: string) => Promise.resolve(detail(id, id !== 'g_p_09')),
      }),
    );
    await connect();
    expect(await screen.findByRole('heading', { name: 'Partida g_p_09' })).toBeTruthy();
    const finishedButton = screen.getByRole('button', { name: 'Ver tablero de g_1' });
    expect(finishedButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Hay una partida en curso/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ver tablero de g_1' }));
    expect(await screen.findByRole('heading', { name: 'Partida g_1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver tablero de g_1' }).textContent).toBe('Viendo');
  });

  it('una partida que crea otro equipo (amistoso o liga) aparece sola y se abre en vivo', async () => {
    const friendly = { ...detail('g_amistoso', false), kind: 'friendly', board: undefined };
    let created = false;
    const teamGames = vi.fn(() => Promise.resolve(created ? [friendly] : []));
    openPanel(fakeArbiter({ teamGames, game: (id: string) => Promise.resolve(detail(id, false)) }));
    await connect();
    await waitFor(() => expect(teamGames).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Partida g_amistoso' })).toBeNull();

    created = true; // el árbitro crea la partida sin que el panel haga nada
    expect(
      await screen.findByRole('heading', { name: 'Partida g_amistoso' }, { timeout: 5000 }),
    ).toBeTruthy();
  }, 10_000);
});
