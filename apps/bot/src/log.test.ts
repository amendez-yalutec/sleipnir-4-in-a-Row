import { describe, expect, it } from 'vitest';
import { createJsonLogger } from './log.ts';

describe('log JSON por línea', () => {
  it('escribe una línea JSON con hora, nivel y evento', () => {
    const lines: string[] = [];
    const log = createJsonLogger(
      (line) => lines.push(line),
      () => new Date('2026-11-05T15:00:00Z'),
    );
    log('warn', 'prueba', { game_id: 'g1' });
    log('info', 'sin_datos');
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { t: '2026-11-05T15:00:00.000Z', level: 'warn', event: 'prueba', game_id: 'g1' },
      { t: '2026-11-05T15:00:00.000Z', level: 'info', event: 'sin_datos' },
    ]);
  });

  it('un nombre de rival con secuencias de terminal sale escapado e inerte', () => {
    const lines: string[] = [];
    createJsonLogger((line) => lines.push(line))('info', 'x', { opponent: '\u001b[2J<img>' });
    expect(lines[0]).toContain('\\u001b[2J<img>');
    expect(lines[0]).not.toContain('\u001b');
  });

  it('por defecto escribe en stdout', () => {
    expect(() => createJsonLogger()('info', 'arranque_de_prueba')).not.toThrow();
  });
});
