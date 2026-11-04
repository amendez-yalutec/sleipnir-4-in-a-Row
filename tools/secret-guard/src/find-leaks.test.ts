import { describe, expect, it } from 'vitest';
import { findLeaks, findTokenInDiff, isEnvFile, parseEnv } from './find-leaks.ts';

const FAKE_TOKEN = 'TOKEN-DE-PRUEBA-NO-REAL-123';

const diffAdding = (file: string, ...lines: string[]) =>
  [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -0,0 +1 @@',
    ...lines,
  ].join('\n');

describe('isEnvFile', () => {
  it('detecta .env en cualquier carpeta y sus variantes', () => {
    expect(isEnvFile('.env')).toBe(true);
    expect(isEnvFile('.env.local')).toBe(true);
    expect(isEnvFile('apps/bot/.env')).toBe(true);
    expect(isEnvFile('apps/bot/.env.production')).toBe(true);
  });

  it('permite .env.example y archivos que solo se parecen', () => {
    expect(isEnvFile('.env.example')).toBe(false);
    expect(isEnvFile('apps/bot/.env.example')).toBe(false);
    expect(isEnvFile('docs/env.md')).toBe(false);
    expect(isEnvFile('src/dotenv.ts')).toBe(false);
  });
});

describe('parseEnv', () => {
  it('lee claves, quita comillas, comentarios y el prefijo export', () => {
    const env = parseEnv(
      [
        '# comentario',
        '',
        'ARBITRO_URL=https://arbitro.example',
        `TEAM_TOKEN="${FAKE_TOKEN}"`,
        "OTRO='con espacios'",
        'export HOST=127.0.0.1',
        'PORT=8080 # puerto de la app',
        'línea inválida',
      ].join('\n'),
    );

    expect(env).toEqual({
      ARBITRO_URL: 'https://arbitro.example',
      TEAM_TOKEN: FAKE_TOKEN,
      OTRO: 'con espacios',
      HOST: '127.0.0.1',
      PORT: '8080',
    });
  });

  it('acepta finales de línea de Windows', () => {
    expect(parseEnv(`TEAM_TOKEN=${FAKE_TOKEN}\r\nPORT=1\r\n`)).toEqual({
      TEAM_TOKEN: FAKE_TOKEN,
      PORT: '1',
    });
  });
});

describe('findTokenInDiff', () => {
  it('encuentra el token en una línea agregada y nombra el archivo', () => {
    const diff = diffAdding('apps/bot/src/config.ts', `+const token = '${FAKE_TOKEN}';`);
    expect(findTokenInDiff(diff, FAKE_TOKEN)).toEqual([
      { file: 'apps/bot/src/config.ts', reason: 'contiene el valor de TEAM_TOKEN de tu .env' },
    ]);
  });

  it('ignora líneas borradas o de contexto', () => {
    const diff = diffAdding('a.ts', `-const viejo = '${FAKE_TOKEN}';`, ` contexto ${FAKE_TOKEN}`);
    expect(findTokenInDiff(diff, FAKE_TOKEN)).toEqual([]);
  });

  it('reporta cada archivo una sola vez', () => {
    const diff = [
      diffAdding('a.ts', `+uno ${FAKE_TOKEN}`, `+dos ${FAKE_TOKEN}`),
      diffAdding('b.md', `+tres ${FAKE_TOKEN}`),
    ].join('\n');
    expect(findTokenInDiff(diff, FAKE_TOKEN).map((leak) => leak.file)).toEqual(['a.ts', 'b.md']);
  });

  it('nunca incluye el valor del token en el mensaje', () => {
    const [leak] = findTokenInDiff(diffAdding('a.ts', `+${FAKE_TOKEN}`), FAKE_TOKEN);
    expect(JSON.stringify(leak)).not.toContain(FAKE_TOKEN);
  });
});

describe('findLeaks', () => {
  it('bloquea un .env en stage aunque no haya token configurado', () => {
    expect(findLeaks({ files: ['.env', 'README.md'], diff: '', token: undefined })).toEqual([
      { file: '.env', reason: 'es un archivo de entorno; solo .env.example puede subirse' },
    ]);
  });

  it('combina archivos de entorno y fugas del token', () => {
    const leaks = findLeaks({
      files: ['.env.local', 'a.ts'],
      diff: diffAdding('a.ts', `+${FAKE_TOKEN}`),
      token: FAKE_TOKEN,
    });
    expect(leaks.map((leak) => leak.file)).toEqual(['.env.local', 'a.ts']);
  });

  it('no busca tokens vacíos o demasiado cortos', () => {
    const diff = diffAdding('a.ts', '+abc', '+');
    expect(findLeaks({ files: ['a.ts'], diff, token: '' })).toEqual([]);
    expect(findLeaks({ files: ['a.ts'], diff, token: 'abc' })).toEqual([]);
  });

  it('no reporta nada en un commit limpio', () => {
    const diff = diffAdding('a.ts', '+const ok = true;');
    expect(findLeaks({ files: ['a.ts'], diff, token: FAKE_TOKEN })).toEqual([]);
  });
});
