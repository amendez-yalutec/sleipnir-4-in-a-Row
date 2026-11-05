# Árbitro simulado

Implementa **todas** las rutas de `spec/arbitro-openapi.json` (**1.0.1, la versión final** del árbitro)
con estado real, para desarrollar y probar el bot sin el árbitro del torneo (paso B3 de
`PLAN_BACKEND.md`).

```bash
npm run mock
```

Escucha en `http://127.0.0.1:8787` con dos equipos de juguete: `eq6` (token `token-local-eq6`) y `rival`
(token `token-local-rival`). Son tokens locales y no sirven en el árbitro real.

Responde CORS solo a páginas de esta computadora (`http://localhost:*` y `http://127.0.0.1:*`), para
que el panel **Mi equipo** de la web (`npm run bot` en `:8080` o `npm run dev` en `:5173`) funcione
contra el mock igual que contra el árbitro de prueba.

## Partida con curl

```bash
export ARBITRO_URL=http://127.0.0.1:8787 TEAM_TOKEN=token-local-eq6
H="Authorization: Bearer $TEAM_TOKEN"

curl -s -X POST "$ARBITRO_URL/api/practice" -H "$H" -H 'content-type: application/json' \
  -d '{"opponent":"casa-basico","first":1}'          # → {"game_id":"g_p_01","you":1}
curl -s "$ARBITRO_URL/api/next?wait=20" -H "$H"        # → {"status":"turn", ... "legal_moves":[0..7]}
curl -s -X POST "$ARBITRO_URL/api/move" -H "$H" -H 'content-type: application/json' \
  -d '{"game_id":"g_p_01","column":3}'                 # → {"ok":true,"state":"playing","turn":2}
curl -s "$ARBITRO_URL/api/games/g_p_01"                # registro público de la partida
```

Repetir `next` y `move` hasta que `state` sea `won` o `draw`.

## Qué hace igual que el árbitro real

- **Long polling:** `GET /api/next?wait=N` (0–25, 20 por defecto) retiene la conexión y responde en
  cuanto aparece un turno; si no, `idle`. Con varias partidas entrega el turno más antiguo.
- **Reloj:** `deadline_ms` (3,000) se cuenta desde `served_at`. Una jugada tarde recibe `400 timeout` y
  la partida se pierde. Un turno que nadie recoge en 30 s se pierde por ausencia (`absent`).
- **Errores:** `400 illegal_move` (columna llena, pierde), `409 not_your_turn` (no penaliza), `401`,
  `423 practice_closed` / `submissions_closed`.
- **Bots de la casa:** `casa-aleatorio` juega al azar; `casa-basico` gana y bloquea cuatros inmediatos.
- **Reglas:** usa `packages/engine` (`rules.ts`): hay una sola implementación de las reglas en el repo.
- **Validación:** cada cuerpo que recibe se valida con los esquemas del propio OpenAPI (ajv): por
  ejemplo, `commit` debe ser hexadecimal y `repo_url` de GitHub o Bitbucket.
- **Partidas:** `players` con `team_id` (y `house: true` en los bots de la casa), `series`, `current` y,
  en las derrotas que no son cuatro en línea, `forfeited_by` con `ms`, `column` o `waited_ms`.
- **Rutas públicas de 1.0.1:** `GET /api/games` (lista sin tablero, `?kind=&limit=`), `/api/health`,
  `/api/openapi.json` (con la URL del mock en `servers`), `/api/state` y `/api/live` (Server-Sent
  Events).

## Lo que confirmó el OpenAPI 1.0.1 y lo que sigue siendo supuesto

| Caso | Qué hace el mock | Estado |
|---|---|---|
| Cuerpo que no cumple el esquema | `400 validation`, no se pierde la partida | confirmado en 1.0.1 |
| `game_id` que no existe en `/api/move` | `409 unknown_game` | confirmado en 1.0.1 |
| Repetir una jugada ya registrada | `409 not_your_turn`, no penaliza | confirmado en 1.0.1 |
| Puntos de la tabla | victoria 3, empate 1, derrota 0 | confirmado (tablero en vivo del árbitro) |
| Desempates | puntos y diferencia V−D; el mock omite el enfrentamiento directo y cambia el sorteo por el id | simplificado |
| Forma de `/api/state` y del evento de `/api/live` | campos propios del mock (`phase`, `teams`, `standings`, `live`, `recent`) | supuesto: el OpenAPI solo dice "object" |
| `wait` fuera de 0–25 | `400 validation` | supuesto |
| Pedir dos veces el mismo turno | mismo `served_at`: el reloj no se reinicia | supuesto |
| Jugar sin haber pedido el turno con `next` | se acepta y cuenta 0 ms | supuesto |
| Jugada después de perder por tiempo | `400 timeout` otra vez | supuesto |
| Respuesta del bot de la casa | inmediata | supuesto |

## Variables de entorno (todas opcionales)

| Variable | Por defecto | Uso |
|---|---|---|
| `MOCK_PORT` / `MOCK_HOST` | `8787` / `127.0.0.1` | dónde escucha |
| `MOCK_TEAMS` | `eq6` y `rival` | `id:token:Nombre;id2:token2:Nombre 2` |
| `MOCK_DEADLINE_MS` / `MOCK_ABSENCE_MS` | `3000` / `30000` | plazo por jugada y regla de ausencia |
| `MOCK_PRACTICE_OPEN` / `MOCK_SUBMISSIONS_OPEN` | `true` | `false` simula el congelamiento (423) |
| `MOCK_SEED` | `6` | semilla de los bots de la casa y de las fallas |
| `MOCK_LOG` | `false` | logs de Fastify |

**Fallas inyectadas** (solo en rutas `/api`), para las pruebas de caos del cliente:

| Variable | Efecto |
|---|---|
| `MOCK_LATENCY_MS` | latencia fija por petición |
| `MOCK_JITTER_MS` | latencia extra al azar entre 0 y este valor |
| `MOCK_ERROR_RATE` | probabilidad (0–1) de responder 503 |
| `MOCK_DROP_RATE` | probabilidad (0–1) de cortar la conexión sin responder |

Ejemplo: `MOCK_LATENCY_MS=800 MOCK_ERROR_RATE=0.1 npm run mock`.

## Ruta extra del mock

`POST /_mock/games` con `{ "first": "eq6", "second": "rival", "kind": "league" }` crea una partida
entre dos equipos (o contra `casa-*`). No existe en el árbitro real; sirve para enfrentar dos instancias
del bot o probar la tabla de posiciones.

## Pruebas

- `contract.test.ts`: cada respuesta del mock se valida contra el OpenAPI, igual que los ejemplos del
  propio OpenAPI. Al reemplazar 0.9.0 por 1.0.1, estas pruebas marcaron exactamente lo que cambió
  (ver `docs/BITACORA_IA.md`).
- `arbiter.test.ts`: turnos, plazos y ausencia con un reloj falso.
- `server.test.ts`: long polling, errores HTTP y fallas inyectadas sobre un servidor real.
