import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

const TOKEN = 'TOKEN-DE-PRUEBA-NO-REAL-123';
const PLAYING = {
  ARBITRO_ENABLED: 'true',
  ARBITRO_URL: 'https://arbitro.example',
  TEAM_TOKEN: TOKEN,
};

function messageOf(env: Record<string, string>): string {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  return expect.fail('se esperaba ConfigError');
}

describe('configuración del bot', () => {
  it('valores por defecto del plan (§8)', () => {
    expect(loadConfig(PLAYING)).toEqual({
      ...PLAYING,
      ARBITRO_ENABLED: true,
      LONGPOLL_WAIT_S: 20,
      THINK_SOFT_MS: 1800,
      THINK_HARD_MS: 2200,
      PORT: 8080,
      HOST: '127.0.0.1',
      LOG_DIR: './logs',
      WEB_DIR: 'apps/web/dist',
      RATE_LIMIT_PER_MIN: 120,
      BOT_MOVE_PER_MIN: 30,
    });
  });

  it('con ARBITRO_ENABLED=false no hacen falta URL ni token (máquina de demo)', () => {
    expect(loadConfig({ ARBITRO_ENABLED: 'false' }).ARBITRO_ENABLED).toBe(false);
  });

  it('sin .env arranca en espera: la escucha se inicia desde la web', () => {
    expect(loadConfig({}).ARBITRO_ENABLED).toBe(false);
  });

  it('las variables vacías de .env cuentan como no definidas', () => {
    expect(messageOf({ ARBITRO_ENABLED: 'true', ARBITRO_URL: '', TEAM_TOKEN: '' })).toMatch(
      /TEAM_TOKEN: falta/,
    );
  });

  it('exige URL y token para jugar el torneo al arrancar', () => {
    const message = messageOf({ ARBITRO_ENABLED: 'true' });
    expect(message).toContain('TEAM_TOKEN: falta');
    expect(message).toContain('ARBITRO_URL: falta');
  });

  it('exige https salvo para el mock local', () => {
    expect(messageOf({ ...PLAYING, ARBITRO_URL: 'http://arbitro.example' })).toContain('https');
    expect(loadConfig({ ...PLAYING, ARBITRO_URL: 'http://127.0.0.1:8787' }).ARBITRO_URL).toBe(
      'http://127.0.0.1:8787',
    );
  });

  it('rechaza credenciales en la URL', () => {
    expect(messageOf({ ...PLAYING, ARBITRO_URL: 'https://u:p@arbitro.example' })).toContain(
      'credenciales',
    );
  });

  it.each([
    [{ LONGPOLL_WAIT_S: '30' }, 'LONGPOLL_WAIT_S'],
    [{ THINK_SOFT_MS: 'mucho' }, 'THINK_SOFT_MS'],
    [{ THINK_SOFT_MS: '1900', THINK_HARD_MS: '1800' }, 'THINK_SOFT_MS'],
    [{ ARBITRO_ENABLED: 'si' }, 'ARBITRO_ENABLED'],
    [{ ARBITRO_URL: 'no es url' }, 'ARBITRO_URL'],
    [{ TEAM_TOKEN: 'con espacio' }, 'TEAM_TOKEN'],
  ])('rechaza %j nombrando la variable', (env, name) => {
    expect(messageOf({ ...PLAYING, ...env })).toContain(name);
  });

  it('máquina de demo: sin torneo, la URL pública igual se valida (la usa el proxy)', () => {
    const demo = loadConfig({ ARBITRO_ENABLED: 'false', ARBITRO_URL: 'https://arbitro.example' });
    expect(demo.ARBITRO_URL).toBe('https://arbitro.example');
    expect(messageOf({ ARBITRO_ENABLED: 'false', ARBITRO_URL: 'http://evil.example' })).toContain(
      'https',
    );
  });

  it('TEAM_ID es un id simple', () => {
    expect(loadConfig({ ...PLAYING, TEAM_ID: 'eq6' }).TEAM_ID).toBe('eq6');
    expect(messageOf({ ...PLAYING, TEAM_ID: '../me' })).toContain('TEAM_ID');
  });

  it('el mensaje de error nunca repite el valor del token', () => {
    expect(messageOf({ TEAM_TOKEN: `${TOKEN} x` })).not.toContain(TOKEN);
  });
});
