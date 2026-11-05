/** `npm run mock`: levanta el árbitro simulado. Variables en tools/mock-arbiter/README.md. */
import { parseMockConfig } from './config.ts';
import { hasFaults } from './faults.ts';
import { buildMockServer } from './server.ts';

const config = parseMockConfig(process.env);
const { app } = buildMockServer(config);
const url = await app.listen({ port: config.port, host: config.host });

const [team] = config.teams;
console.log(`Árbitro simulado en ${url}`);
console.log(`Equipos: ${config.teams.map((t) => t.id).join(', ')}`);
if (config.faults && hasFaults(config.faults)) console.log('Fallas inyectadas:', config.faults);
if (team?.token.startsWith('token-local-')) {
  console.log(`\nPrueba rápida:\n  export ARBITRO_URL=${url} TEAM_TOKEN=${team.token}`);
  console.log(
    '  curl -s -X POST "$ARBITRO_URL/api/practice" -H "Authorization: Bearer $TEAM_TOKEN" ' +
      `-H 'content-type: application/json' -d '{"opponent":"casa-basico"}'`,
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
