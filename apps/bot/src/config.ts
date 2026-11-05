/**
 * Variables de entorno validadas al arrancar (PLAN_BACKEND.md §8). Los mensajes de error nombran la
 * variable pero nunca repiten su valor: el token no debe aparecer en la consola.
 */
import { z } from 'zod';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const flag = z.enum(['true', 'false'], { error: 'debe ser true o false' });
const int = (min: number, max: number, fallback: number) =>
  z.coerce
    .number({ error: 'debe ser un número' })
    .int({ error: 'debe ser entero' })
    .min(min, { error: `mínimo ${min}` })
    .max(max, { error: `máximo ${max}` })
    .default(fallback);

const envSchema = z
  .object({
    // Por defecto el servidor arranca en espera: la escucha se inicia desde la web ("Mi equipo").
    // Con `true`, el bot arranca solo con ARBITRO_URL y TEAM_TOKEN del .env.
    ARBITRO_ENABLED: flag.default('false').transform((value) => value === 'true'),
    ARBITRO_URL: z.url({ error: 'debe ser una URL' }).optional(),
    TEAM_TOKEN: z.string().regex(/^\S+$/, { error: 'no puede tener espacios' }).optional(),
    LONGPOLL_WAIT_S: int(1, 25, 20),
    THINK_SOFT_MS: int(50, 2_500, 1_400),
    THINK_HARD_MS: int(50, 2_800, 1_800),
    PORT: int(1, 65_535, 8_080),
    HOST: z.string().min(1).default('127.0.0.1'),
    LOG_DIR: z.string().min(1).default('./logs'),
    /** Id público del equipo en el árbitro (p. ej. "eq6"): filtra las partidas en la app. */
    TEAM_ID: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/, { error: 'solo letras, números, - y _' })
      .optional(),
    /** Build del frontend que sirve el mismo servidor. */
    WEB_DIR: z.string().min(1).default('apps/web/dist'),
    /** Límites por IP y por minuto de la API de la app (las pruebas E2E los suben). */
    RATE_LIMIT_PER_MIN: int(1, 100_000, 120),
    BOT_MOVE_PER_MIN: int(1, 100_000, 30),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (env.THINK_SOFT_MS > env.THINK_HARD_MS)
      issue('THINK_SOFT_MS', 'no puede ser mayor que THINK_HARD_MS');
    // La URL se revisa aunque el torneo esté apagado: la máquina de demo la usa para el proxy.
    // zod 4 corre este refinamiento aunque la URL ya haya fallado: ese error ya quedó reportado.
    if (env.ARBITRO_URL && URL.canParse(env.ARBITRO_URL)) {
      const url = new URL(env.ARBITRO_URL);
      if (url.protocol !== 'https:' && !LOCAL_HOSTS.has(url.hostname)) {
        issue('ARBITRO_URL', 'debe usar https (http solo para el mock local)');
      }
      if (url.username || url.password) issue('ARBITRO_URL', 'no debe llevar credenciales');
    }
    if (!env.ARBITRO_ENABLED) return;
    if (!env.TEAM_TOKEN) issue('TEAM_TOKEN', 'falta (o usa ARBITRO_ENABLED=false)');
    if (!env.ARBITRO_URL) issue('ARBITRO_URL', 'falta (o usa ARBITRO_ENABLED=false)');
  });

export type Config = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  // En .env, `VARIABLE=` (vacía) cuenta como no definida.
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = envSchema.safeParse(defined);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
  throw new ConfigError(`Configuración inválida:\n${lines.join('\n')}`);
}
