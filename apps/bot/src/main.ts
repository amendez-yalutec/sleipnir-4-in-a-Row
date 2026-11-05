/**
 * Arranque del servicio: la API de la app (siempre) y, con `ARBITRO_ENABLED=true`, el ciclo del
 * torneo. Cada uno busca en su propio worker, así una partida en la app no le quita tiempo al bot
 * que juega la liga (PLAN_BACKEND.md §3).
 * Desarrollo: `npm run bot` (lee .env). Torneo: build y supervisor en B10.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ArbiterClient } from './arbiter/client.ts';
import { runArbiterLoop } from './arbiter/loop.ts';
import { ArbiterMonitor } from './arbiter/monitor.ts';
import { PublicArbiter } from './arbiter/public-client.ts';
import { WorkerChooser } from './chooser/worker-chooser.ts';
import { ConfigError, loadConfig } from './config.ts';
import { buildAppServer } from './http/app.ts';
import { createJsonLogger } from './log.ts';

const log = createJsonLogger();

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(1);
}

const rootPackage = new URL('../../../package.json', import.meta.url);
const { version } = JSON.parse(readFileSync(rootPackage, 'utf8')) as { version: string };
const think = { softMs: config.THINK_SOFT_MS, hardMs: config.THINK_HARD_MS };
const monitor = new ArbiterMonitor(config.ARBITRO_ENABLED);
const appChooser = new WorkerChooser({ tableBits: 18, maxQueue: 3 });

const app = await buildAppServer({
  version,
  chooser: appChooser,
  think,
  arbiterStatus: () => monitor.snapshot(),
  ...(config.ARBITRO_URL && {
    tournament: {
      arbiter: new PublicArbiter({ baseUrl: config.ARBITRO_URL }),
      ...(config.TEAM_ID && { teamId: config.TEAM_ID }),
    },
  }),
  webDir: resolve(config.WEB_DIR),
  rateLimit: { max: config.RATE_LIMIT_PER_MIN, botMoveMax: config.BOT_MOVE_PER_MIN },
  log,
});
const url = await app.listen({ port: config.PORT, host: config.HOST });
log('info', 'api_lista', { url, host: config.HOST });

const controller = new AbortController();
let tournamentChooser: WorkerChooser | null = null;
const shutdown = () => {
  controller.abort();
  void Promise.all([app.close(), appChooser.close(), tournamentChooser?.close()]).then(() =>
    process.exit(0),
  );
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, shutdown);

if (!config.ARBITRO_ENABLED || !config.ARBITRO_URL || !config.TEAM_TOKEN) {
  log('info', 'arbitro_desactivado', { motivo: 'ARBITRO_ENABLED=false' });
} else {
  const client = new ArbiterClient({ baseUrl: config.ARBITRO_URL, token: config.TEAM_TOKEN });
  tournamentChooser = new WorkerChooser({ tableBits: 20, maxQueue: 0 });
  await tournamentChooser.warmUp();
  log('info', 'arranque', {
    arbitro: client.host,
    token: 'configurado',
    wait_s: config.LONGPOLL_WAIT_S,
    think_soft_ms: think.softMs,
    think_hard_ms: think.hardMs,
    eleccion: 'búsqueda alfa-beta en un worker, con temporizador de seguridad y respaldo',
  });
  const stats = await runArbiterLoop({
    client,
    chooser: tournamentChooser,
    log,
    signal: controller.signal,
    waitS: config.LONGPOLL_WAIT_S,
    thinkSoftMs: think.softMs,
    thinkHardMs: think.hardMs,
    onEvent: monitor.onEvent,
  });
  log('info', 'detenido', { ...stats });
}
