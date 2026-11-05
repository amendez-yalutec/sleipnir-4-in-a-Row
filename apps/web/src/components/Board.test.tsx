import type { GameState } from '@equipo6/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_GAME } from '../game/reducer.ts';
import { Board } from './Board.tsx';

/** Ejemplo del OpenAPI: asimétrico, para detectar un tablero dibujado al revés. */
const OPENAPI: GameState = {
  ...EMPTY_GAME,
  moves: [2, 3, 3, 2, 4, 3],
  board: [
    [0, 0, 1, 2, 1, 0, 0, 0],
    [0, 0, 2, 1, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 0, 0, 0],
    ...Array.from({ length: 4 }, () => [0, 0, 0, 0, 0, 0, 0, 0] as (0 | 1 | 2)[]),
  ],
};

const column = (n: number) => screen.getByRole('button', { name: new RegExp(`^Columna ${n},`) });
const cells = (button: HTMLElement) =>
  Array.from(button.querySelectorAll<HTMLElement>('[data-cell]')).map((cell) => cell.dataset.owner);

describe('Board', () => {
  it('orientación: la fila 0 del árbitro se dibuja abajo', () => {
    render(<Board game={OPENAPI} human={1} interactive onPlay={() => undefined} />);
    // Columna 4 en pantalla = columna 3 de la API: de arriba hacia abajo, vacías y luego 2, 1, 2.
    expect(cells(column(4))).toEqual(['empty', 'empty', 'empty', 'empty', 'bot', 'human', 'bot']);
    expect(cells(column(3))).toEqual(['empty', 'empty', 'empty', 'empty', 'empty', 'bot', 'human']);
  });

  it('los colores siguen a la persona, no al número de jugador', () => {
    render(<Board game={OPENAPI} human={2} interactive onPlay={() => undefined} />);
    expect(cells(column(3)).slice(-2)).toEqual(['human', 'bot']);
  });

  it('cada columna dice cuántos espacios quedan, numerada 1–8', () => {
    render(<Board game={OPENAPI} human={1} interactive onPlay={() => undefined} />);
    expect(column(1).getAttribute('aria-label')).toBe('Columna 1, quedan 7 espacios');
    expect(column(4).getAttribute('aria-label')).toBe('Columna 4, quedan 4 espacios');
    const full = {
      ...EMPTY_GAME,
      board: EMPTY_GAME.board.map((row) => row.map((_, c) => (c === 0 ? 1 : 0))),
      legalMoves: [1, 2, 3, 4, 5, 6, 7],
    } as GameState;
    render(<Board game={full} human={1} interactive onPlay={() => undefined} />);
    expect(screen.getAllByRole('button', { name: 'Columna 1, llena' })).toHaveLength(1);
  });

  it('un clic avisa la columna de la API (0–7)', async () => {
    const onPlay = vi.fn();
    render(<Board game={EMPTY_GAME} human={1} interactive onPlay={onPlay} />);
    await userEvent.click(column(8));
    expect(onPlay).toHaveBeenCalledWith(7);
  });

  it('marca las casillas ganadoras', () => {
    const won: GameState = {
      ...EMPTY_GAME,
      status: 'won',
      winner: 1,
      board: [[1, 1, 1, 1, 0, 0, 0, 0], [2, 2, 2, 0, 0, 0, 0, 0], ...EMPTY_GAME.board.slice(2)],
      winningCells: [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ],
      legalMoves: [],
      moves: [0, 0, 1, 1, 2, 2, 3],
    };
    const { container } = render(
      <Board game={won} human={1} interactive={false} onPlay={() => undefined} />,
    );
    const ring = (row: number, col: number) =>
      container.querySelector(`[data-cell="${row}:${col}"] > span`)?.className ?? '';
    expect(ring(0, 3)).toContain('animate-win');
    expect(ring(1, 0)).toContain('opacity-40');
    expect(column(1).getAttribute('aria-disabled')).toBe('true');
  });
});
