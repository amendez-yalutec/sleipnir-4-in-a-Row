import { legalMoves, replay } from '@equipo6/engine';
import { describe, expect, it } from 'vitest';
import { chooseHouseMove, isHouseBot } from './house-bots.ts';
import { createRandom } from './random.ts';

describe('bots de la casa', () => {
  it('reconoce solo los nombres del OpenAPI', () => {
    expect(isHouseBot('casa-basico')).toBe(true);
    expect(isHouseBot('casa-aleatorio')).toBe(true);
    expect(isHouseBot('casa-experto')).toBe(false);
  });

  it('casa-basico gana cuando tiene cuatro inmediato', () => {
    // Jugador 1 tiene 0, 1, 2 en la fila 0; le toca.
    const { board } = replay([0, 0, 1, 1, 2, 2]);
    expect(chooseHouseMove('casa-basico', board, 1, createRandom(1))).toBe(3);
  });

  it('casa-basico bloquea el cuatro inmediato del rival', () => {
    // Jugador 1 amenaza con la columna 3; le toca al 2.
    const { board } = replay([0, 6, 1, 6, 2]);
    expect(chooseHouseMove('casa-basico', board, 2, createRandom(1))).toBe(3);
  });

  it('prefiere ganar a bloquear', () => {
    // El 1 gana en la columna 3 y el 2 amenaza con la 7; le toca al 1.
    const { board } = replay([0, 7, 1, 7, 2, 7]);
    expect(chooseHouseMove('casa-basico', board, 1, createRandom(7))).toBe(3);
  });

  it('casa-aleatorio juega siempre una columna legal y es reproducible con semilla', () => {
    const { board } = replay([3, 3, 3, 3, 3, 3, 3]);
    const pick = (seed: number) => {
      const random = createRandom(seed);
      return Array.from({ length: 50 }, () => chooseHouseMove('casa-aleatorio', board, 2, random));
    };
    expect(pick(42).every((column) => legalMoves(board).includes(column))).toBe(true);
    expect(pick(42)).toEqual(pick(42));
    expect(new Set(pick(42)).size).toBeGreaterThan(3);
  });
});
