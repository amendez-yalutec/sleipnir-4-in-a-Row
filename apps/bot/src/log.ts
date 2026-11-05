/**
 * Log en JSON por línea. Nunca recibe el token ni headers: el cliente HTTP no los expone. JSON escapa
 * los caracteres de control, así que un nombre de rival con secuencias de terminal se imprime inerte.
 */
export type Level = 'info' | 'warn' | 'error';
export type Logger = (
  level: Level,
  event: string,
  data?: Readonly<Record<string, unknown>>,
) => void;

export function createJsonLogger(
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
  now: () => Date = () => new Date(),
): Logger {
  return (level, event, data = {}) => {
    write(JSON.stringify({ t: now().toISOString(), level, event, ...data }));
  };
}
