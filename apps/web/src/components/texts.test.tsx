import { describe, expect, it } from 'vitest';
import { EMPTY_GAME } from '../game/reducer.ts';
import { verdict } from './BotInsights.tsx';
import { headline } from './GameStatus.tsx';
import { describeStatus } from './Header.tsx';

describe('textos para la persona', () => {
  it('estado del bot en el encabezado', () => {
    expect(describeStatus({ online: null }).text).toBe('Conectando…');
    expect(describeStatus({ online: false })).toEqual({
      text: 'Sin conexión con el bot',
      tone: 'off',
    });
    const off = { enabled: false, state: 'disabled', lastTurnAt: null, gamesPlayed: 0 } as const;
    expect(describeStatus({ online: true, tournament: off }).text).toBe('Bot en línea');
    const playing = { ...off, enabled: true, state: 'playing' } as const;
    expect(describeStatus({ online: true, tournament: playing }).text).toBe(
      'Bot en línea · jugando en el torneo',
    );
  });

  it('titular de cada fase y del resultado', () => {
    expect(headline('humanTurn', EMPTY_GAME, 1)).toBe('Tu turno: elige una columna.');
    expect(headline('checking', EMPTY_GAME, 1)).toBe('Colocando tu ficha…');
    expect(headline('botThinking', EMPTY_GAME, 1)).toBe('El bot está pensando…');
    expect(headline('error', EMPTY_GAME, 1)).toBe('Algo falló.');
    const won = { ...EMPTY_GAME, status: 'won', winner: 2 } as const;
    expect(headline('finished', won, 2)).toBe('¡Ganaste!');
    expect(headline('finished', won, 1)).toBe('Ganó el bot.');
    expect(headline('finished', { ...EMPTY_GAME, status: 'draw' }, 1)).toBe(
      'Empate: el tablero se llenó.',
    );
  });

  it('cómo ve la partida el bot, según su puntaje', () => {
    expect([999, -998, 120, -120, 3].map(verdict)).toEqual([
      'Ya vio cómo ganar.',
      'Sabe que va a perder.',
      'Cree que va ganando.',
      'Cree que vas ganando tú.',
      'Lo ve parejo.',
    ]);
  });
});
