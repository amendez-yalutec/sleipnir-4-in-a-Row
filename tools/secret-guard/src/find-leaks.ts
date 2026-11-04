/**
 * Detecta secretos en lo que está por commitearse. Son funciones puras: `cli.ts` les pasa los
 * archivos en stage, el diff y el token leído del `.env` local.
 *
 * Por qué existe: el token del árbitro tiene un formato que ningún escáner conoce (GitGuardian y
 * GitHub buscan patrones conocidos). Buscar su valor exacto no tiene falsos negativos.
 */

export interface Leak {
  readonly file: string;
  readonly reason: string;
}

export interface StagedChanges {
  readonly files: readonly string[];
  readonly diff: string;
  readonly token: string | undefined;
}

/** Longitud mínima para buscar el token: evita falsos positivos con valores vacíos o cortos. */
export const MIN_TOKEN_LENGTH = 8;

const ENV_FILE = /(?:^|\/)\.env(?:\.[^/]+)?$/;
const ENV_LINE = /^(?:export\s+)?([A-Za-z_]\w*)\s*=(.*)$/;

export function isEnvFile(path: string): boolean {
  return ENV_FILE.test(path) && !path.endsWith('.env.example');
}

function cleanValue(raw: string): string {
  const value = raw.trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  const comment = value.indexOf(' #');
  return comment === -1 ? value : value.slice(0, comment).trim();
}

/** Lee un `.env` sencillo: `CLAVE=valor`, comentarios con `#`, comillas opcionales. */
export function parseEnv(content: string): Readonly<Partial<Record<string, string>>> {
  const values: Partial<Record<string, string>> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = ENV_LINE.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values[match[1]] = cleanValue(match[2]);
    }
  }
  return values;
}

/** Archivos cuyas líneas agregadas contienen el token. Nunca devuelve el token en el mensaje. */
export function findTokenInDiff(diff: string, token: string): Leak[] {
  const leakyFiles = new Set<string>();
  let currentFile = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      currentFile = line.slice(4).replace(/^b\//, '');
    } else if (line.startsWith('+') && line.includes(token)) {
      leakyFiles.add(currentFile);
    }
  }
  return [...leakyFiles].map((file) => ({
    file,
    reason: 'contiene el valor de TEAM_TOKEN de tu .env',
  }));
}

export function findLeaks({ files, diff, token }: StagedChanges): Leak[] {
  const envFiles = files.filter(isEnvFile).map((file) => ({
    file,
    reason: 'es un archivo de entorno; solo .env.example puede subirse',
  }));
  const tokenLeaks =
    token !== undefined && token.length >= MIN_TOKEN_LENGTH ? findTokenInDiff(diff, token) : [];
  return [...envFiles, ...tokenLeaks];
}
