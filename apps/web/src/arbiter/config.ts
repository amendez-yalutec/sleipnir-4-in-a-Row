/**
 * Conexión al árbitro que el equipo configura desde la web (panel "Mi equipo").
 * - URL y team ID no son secretos: se recuerdan en este navegador (localStorage).
 * - El token sí: vive solo en esta pestaña (sessionStorage) y se borra al cerrarla. Nunca se manda a
 *   la API de la app ni se escribe en logs (AGENTS.md, "Qué no tocar").
 */
export interface ArbiterConfig {
  readonly url: string;
  readonly teamId: string;
  readonly token: string;
}

export const EMPTY_CONFIG: ArbiterConfig = { url: '', teamId: '', token: '' };

const KEYS = { url: 'arbitro.url', teamId: 'arbitro.teamId', token: 'arbitro.token' } as const;

function read(storage: () => Storage, key: string): string {
  try {
    return storage().getItem(key) ?? '';
  } catch {
    return ''; // almacenamiento bloqueado (modo privado, permisos)
  }
}

function write(storage: () => Storage, key: string, value: string): void {
  try {
    if (value) storage().setItem(key, value);
    else storage().removeItem(key);
  } catch {
    /* sin almacenamiento: la configuración dura lo que la página abierta */
  }
}

export function loadConfig(): ArbiterConfig {
  return {
    url: read(() => localStorage, KEYS.url),
    teamId: read(() => localStorage, KEYS.teamId),
    token: read(() => sessionStorage, KEYS.token),
  };
}

export function saveConfig(config: ArbiterConfig): void {
  write(() => localStorage, KEYS.url, config.url);
  write(() => localStorage, KEYS.teamId, config.teamId);
  write(() => sessionStorage, KEYS.token, config.token);
}

/** HTTPS, o HTTP solo para el árbitro simulado en esta misma computadora. */
export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export interface ConfigErrors {
  url?: string;
  teamId?: string;
}

/** Valida el formulario y devuelve la configuración lista para guardar, o los errores por campo. */
export function validateConfig(
  input: ArbiterConfig,
): { ok: true; config: ArbiterConfig } | { ok: false; errors: ConfigErrors } {
  const errors: ConfigErrors = {};
  const url = normalizeUrl(input.url);
  if (!url) errors.url = 'Usa una URL https:// (o http://localhost para el árbitro simulado).';
  const teamId = input.teamId.trim();
  if (!/^[\w-]{1,40}$/.test(teamId)) errors.teamId = 'Solo letras, números, guion y guion bajo.';
  if (errors.url || errors.teamId) return { ok: false, errors };
  return { ok: true, config: { url: url as string, teamId, token: input.token.trim() } };
}
