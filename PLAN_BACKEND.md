# Plan de ejecución — Backend (bot)

**Equipo 6** · Challenge Cuatro en línea 8×7 · v1 — 3 de noviembre de 2026

> Plan escrito **antes de la primera línea de código**. No es una profecía: los cambios de rumbo se
> registran en `docs/TECNICO.md` § Desviaciones, sin reescribir este archivo. Aquí solo se completan
> datos pendientes (responsables, respuestas de los organizadores).

---

## 0. Equipo y roles

Somos **4 activos**: Pedro Alexander Lancerio Alvarado, Daniel Alberto Mendez Díaz, Henry David Juárez
Alvarado y Luis Eduardo Godoy Morales. Andrés Estuardo Mandrox López figura en la lista oficial, pero no
podrá participar.

| Rol | Alcance | Responsable |
|---|---|---|
| R1 Motor | reglas, representación, búsqueda, heurística, arena | _por asignar_ |
| R2 Árbitro, API y confiabilidad | cliente del árbitro, API de la app, workers, supervisor; de guardia en la máquina A durante la liga | _por asignar_ |
| R3 Plataforma, QA y seguridad | monorepo, CI, árbitro simulado, casos de prueba desde las bases, herramientas de calidad y seguridad, pentest interno | Luis Godoy |
| R4 Frontend y manual | app web y `docs/MANUAL.md` (ver `PLAN_FRONTEND.md`) | _por asignar_ |

Documentación técnica, bitácora de IA y exposición: **todos**, cada quien su parte; coordina Luis.
Git, entornos, QA y seguridad tienen su propio plan: `PLAN_CALIDAD_SEGURIDAD.md`.

**Todos deben poder explicar §4 (algoritmo) y §4.4 (tiempo):** el jurado puede preguntarle a cualquiera.

---

## 1. Objetivo y criterio de éxito

Un servicio en TypeScript que:

1. juega el torneo contra el árbitro sin perder **nunca** una partida por tiempo, jugada ilegal o ausencia;
2. elige su jugada con minimax y poda alfa-beta adaptado a 8×7;
3. expone una API HTTP para que la app web juegue contra **el mismo motor**.

| Métrica | Meta | Cómo se mide |
|---|---|---|
| Derrotas por timeout, jugada ilegal o ausencia | **0** | logs del bot + `GET /api/games/{id}` |
| Victorias contra `casa-basico` (abriendo y respondiendo) | ≥ 95 % en 20 partidas | mock el miércoles; árbitro real el jueves |
| Tiempo local por jugada, p99 | < 1,900 ms | logs JSONL (`think_ms + post_ms`) |
| Cobertura de `packages/engine` (reglas + algoritmo) | ≥ 90 % de líneas (las bases piden 70 %) | `npm test`; el umbral falla el build |
| Pruebas | un comando, 100 % en verde | `npm test` local y en CI |

---

## 2. Alcance

**Dentro**

- Reglas 8×7: caída de fichas, legalidad, victoria en 4 direcciones, empate, celdas ganadoras.
- Motor de búsqueda con control de tiempo.
- Cliente del árbitro robusto y árbitro simulado fiel al OpenAPI.
- API sin estado para la app web y proxy de partidas públicas del torneo (para repetirlas).
- Arena: mini-liga local entre versiones del motor para afinar con datos.
- Pruebas automatizadas, cobertura y CI.

**Fuera, y por qué**

| Excluido | Razón |
|---|---|
| Monte Carlo, redes neuronales | ver §4 |
| WebSocket | el juego es por turnos; petición/respuesta HTTP alcanza |
| Base de datos | la API de la app no guarda estado; el torneo se registra en archivos JSONL |
| Pensar en el turno del rival (*pondering*) | ganancia marginal frente a su complejidad; conservar la tabla de transposición entre turnos da parte del beneficio sin costo |

---

## 3. Arquitectura

Núcleo puro + adaptadores delgados. El motor no sabe nada de HTTP; el cliente del árbitro y la API de
la app son dos adaptadores alrededor del **mismo** motor (las bases lo exigen: "el algoritmo del torneo
y el de la app deben ser el mismo código").

```
                     ┌──────────────── apps/bot (un proceso Node) ────────────────┐
  Árbitro ◀──HTTPS──▶│ arbiter/loop ──▶ WorkerChooser "torneo" ──┐                │
  (long polling)     │                                            ▼                │
                     │                                   packages/engine (puro)    │
  App web ◀──HTTP───▶│ http/server  ──▶ WorkerChooser "app" ─────┘                │
  (navegador)        └─────────────────────────────────────────────────────────────┘
```

**Por qué dos workers (`worker_threads`).** Una búsqueda bloquea el hilo donde corre. La liga se juega
*mientras exponemos*: si una partida de demo en la app compartiera hilo con el torneo, podría retrasar
la lectura de un turno cuyo reloj ya corre. Con un worker por canal, el hilo principal queda libre para
la red y para el temporizador de seguridad (§4.4).

### 3.1 Estructura de carpetas

```
.
├── PLAN_BACKEND.md · PLAN_FRONTEND.md · AGENTS.md · CLAUDE.md · README.md
├── docs/                 TECNICO.md · MANUAL.md · BITACORA_IA.md · img/
├── spec/                 arbitro-openapi.json (0.9.0; se reemplaza por el definitivo el jueves)
├── packages/
│   ├── engine/           reglas + búsqueda; sin red, sin fs, sin process.env
│   └── contracts/        tipos y esquemas compartidos entre la API de la app y la web
├── apps/
│   ├── bot/              servicio: cliente del árbitro + API de la app
│   └── web/              React + Vite (PLAN_FRONTEND.md)
└── tools/
    ├── mock-arbiter/     árbitro simulado
    └── arena/            mini-liga local entre versiones del motor
```

### 3.2 Módulos y responsabilidades

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `engine/rules.ts` | representación legible (56 celdas); `fromArbiterBoard`, `play`, `legalMoves`, `winner`, `winningCells`, `isDraw` | — |
| `engine/bitboard.ts` | representación rápida para la búsqueda (64 bits en dos `uint32`) | — |
| `engine/eval.ts` | heurística de hojas | bitboard |
| `engine/tt.ts` | tabla de transposición en arreglos tipados | — |
| `engine/search.ts` | negamax alfa-beta, profundización iterativa, ordenamiento, control de tiempo | bitboard, eval, tt |
| `bot/arbiter/schema.ts` | **único** lugar que interpreta JSON del árbitro (zod, tolerante a campos extra) | — |
| `bot/arbiter/client.ts` | `nextTurn()`, `submitMove()` con timeouts y reintentos | schema |
| `bot/arbiter/loop.ts` | ciclo del torneo, pausas, logs | client, chooser |
| `bot/chooser/` | interfaz `MoveChooser`: `InlineChooser` (pruebas) y `WorkerChooser` (producción); `fallback.ts` | engine |
| `bot/http/` | API de la app, proxy del torneo, archivos estáticos del frontend | engine, chooser, contracts |
| `bot/config.ts` | variables de entorno validadas al arrancar | — |
| `tools/mock-arbiter` | árbitro simulado | engine/rules |
| `tools/arena` | partidas motor contra motor, sin HTTP | engine |

**Stack:** Node.js ≥ 22, TypeScript estricto, npm workspaces, Fastify, zod, Vitest + cobertura v8,
fast-check (pruebas de propiedad), ajv (contrato), ESLint + Prettier. En el torneo se ejecuta JS
compilado (`npm run build && npm start`), nada de transpilar en caliente.

---

## 4. Algoritmo elegido y por qué

| Opción | A favor | En contra | Decisión |
|---|---|---|---|
| Minimax + alfa-beta + profundización iterativa + tabla de transposición | clásico para juegos tácticos de información perfecta con ramificación ≤ 8; determinista a profundidad fija, así que se prueba y se explica; los solvers conocidos de 7×6 (p. ej. el de Pascal Pons) son negamax alfa-beta | depende de una buena heurística y un buen ordenamiento | **Elegida** |
| Monte Carlo Tree Search | no necesita heurística | estocástico (pruebas y explicación más difíciles); con ~1.4 s en JS cae en trampas tácticas que alfa-beta ve | descartada |
| Solo heurística, sin búsqueda | trivial | débil | solo como respaldo (`fallback.ts`) |
| Red neuronal | — | sin tiempo para entrenarla ni forma de explicarla | descartada |

### 4.1 Representación: bitboard 8×7 en dos palabras de 32 bits

- Cada columna usa 8 bits: 7 casillas + 1 bit centinela arriba, siempre en 0, que impide que una línea
  "dé la vuelta" de una columna a la siguiente. 8 columnas × 8 bits = **64 bits exactos**.
- JavaScript no tiene enteros de 64 bits rápidos (`BigInt` es muy lento para esto), así que se parte en
  dos `uint32`: `lo` = columnas 0–3, `hi` = columnas 4–7. Los desplazamientos que cruzan de una palabra
  a otra se resuelven en una sola función (`shr64`).
- Bit de (columna c, fila r) = `8c + r`. Desplazamientos: vertical 1, horizontal 8, diagonal ↗ 9,
  diagonal ↘ 7. Cuatro en línea en la dirección `s`: `m = x & (x >> s)`; hay victoria si
  `m & (m >> 2s) ≠ 0`.
- Clave única de la posición para la tabla de transposición: `posición + máscara` (truco de Pons; con
  8 bits por columna la suma nunca desborda a la columna vecina).
- **Fuente:** Pascal Pons, *Solving Connect 4: how to build a perfect AI* (blog.gamesolver.org).
  Adaptación nuestra: de 7×6 (49 bits) a 8×7 (64 bits) y a dos palabras de 32 bits.
- **Plan B:** si la representación rápida no pasa las pruebas de propiedad para el hito H2, la búsqueda
  usa `rules.ts` (más lenta, ya probada). Costo estimado: alrededor de un nivel de profundidad.

### 4.2 Búsqueda

- **Negamax con poda alfa-beta.** Victoria = `WIN − ply`: prefiere ganar pronto y perder tarde.
- **Profundización iterativa:** profundidad 1, 2, 3… hasta agotar el presupuesto; siempre hay una
  jugada lista de la última profundidad completa.
- **Tabla de transposición:** ~1 M de entradas en arreglos tipados (≈ 14 MB por worker); guarda cota
  (exacta, inferior o superior), profundidad y mejor jugada. Se conserva entre turnos.
- **Ordenamiento:** mejor jugada según la tabla → jugadas que ganan → jugadas que crean más amenazas →
  centro primero (3, 4, 2, 5, 1, 6, 0, 7).
- **Atajos tácticos en cada nodo:** si hay jugada ganadora, se juega; si el rival amenaza ganar, solo se
  consideran los bloqueos; se descartan las jugadas que dejan al rival ganar justo encima, salvo que no
  quede otra.
- **Final de partida:** con pocas casillas libres la profundización llega al final y el resultado es exacto.

### 4.3 Heurística (evaluación de hojas)

- El tablero 8×7 tiene **107 ventanas de 4 casillas**: 35 horizontales, 32 verticales, 40 diagonales.
- **Amenazas:** casillas vacías que completarían un cuatro, calculadas con operaciones de bits. Son el
  componente principal, ponderado por fila.
- **Paridad (hipótesis H1).** La teoría de Allis (1988) dice que en 7×6 al que abre le sirven las
  amenazas en filas impares y al que responde las de filas pares. Se derivó para **altura par**; con
  **7 filas** no aplica tal cual. H1: ponderar por paridad sigue mejorando el juego en 8×7. Se acepta solo
  si la versión con paridad gana ≥ 55 % a la versión sin paridad en 400 partidas de arena.
- **Centro:** las columnas 3 y 4 participan en 4 ventanas horizontales por fila; las de los bordes, en 1.
- Pesos iniciales pocos y explicables; se cambian solo con resultados de arena.

### 4.4 Manejo del tiempo

- El árbitro da `deadline_ms` (3,000) contado desde `served_at` **con su reloj**. No restamos `served_at`
  a nuestro reloj (pueden estar desfasados): medimos desde que **recibimos** el turno.
- **Presupuestos:** `soft = min(THINK_SOFT_MS, 0.47 · deadline_ms)` → 1,400 ms; `hard = min(THINK_HARD_MS,
  0.6 · deadline_ms)` → 1,800 ms. Quedan ~1,200 ms para red. Si cambian `deadline_ms`, se adapta solo.
- Una profundidad nueva solo empieza si el tiempo usado es < 50 % de `soft` (cada nivel cuesta varias
  veces el anterior).
- El worker mira el reloj cada 2,048 nodos y aborta al pasar `hard`.
- **Doble red de seguridad:** el worker reporta su mejor jugada al terminar cada profundidad. El hilo
  principal tiene su propio temporizador a `hard + 100 ms`; si el worker no terminó, envía la mejor jugada
  recibida (o la de `fallback.ts`: ganar en 1 → bloquear → la más central) y reinicia el worker.
- **Salidas inmediatas:** una sola jugada legal, ganar en 1, o resultado ya demostrado.
- **Calibración el jueves:** el campo `ms` de `/api/games/{id}` dice cuánto tardó cada jugada según el
  árbitro. Comparado con nuestro `think_ms` da la latencia real, y se ajustan `THINK_*` sin tocar código.

---

## 5. Cliente del árbitro

1. `GET /api/next?wait=20` con timeout de cliente de **24 s** (`wait + 4 s`): una conexión muerta en
   silencio se detecta antes de la regla de ausencia de 30 s.
2. `idle` → volver a preguntar de inmediato.
3. `turn` → validar con zod → construir la posición con `board` + `you` → elegir jugada → **comprobar que
   esté en `legal_moves`** (si no, jugar la más central de `legal_moves` y registrar error) →
   `POST /api/move`.

### 5.1 Fuente de verdad

El ejemplo de turno del OpenAPI 0.9.0 (igual en la pág. 7 de las bases) no es coherente: `moves` tiene
8 jugadas y `board` 6 fichas, `you: 2` en un turno impar, y `last_move.by: 1` aunque la 8.ª la hizo el
jugador 2. **Decisión:** mandan `board` y `you`; `legal_moves` es el filtro final; si `moves` no
reconstruye `board`, se registra una advertencia. Ese ejemplo exacto es un caso de prueba. Se preguntó a
los organizadores (§14).

### 5.2 Manejo de respuestas

| Respuesta | Acción |
|---|---|
| 200 `playing` | log, volver a `next` |
| 200 `won` / `draw` | log del resultado y `winning_cells`, volver a `next` |
| 400 `illegal_move` / `timeout` | log de severidad alta (partida perdida), aviso visible en consola, continuar |
| 400 `validation` u otro código no documentado | log alto, continuar (pendiente §14) |
| 409 `not_your_turn` | log, continuar (no penaliza) |
| 401 | pausa creciente de 5 a 60 s y mensaje "token inválido"; **nunca** un ciclo sin pausa |
| error de red o 5xx en `move` | hasta 2 reintentos mientras el tiempo local sea < 2,600 ms; si ya se había registrado, el árbitro responde 409 |
| error de red o 5xx en `next` | pausas de 1, 2, 4 y 5 s (tope de 5 s para no acercarse a los 30 s de ausencia) |

### 5.3 Reglas de operación

- **Un solo proceso y un solo ciclo por token.** Cualquier otra máquina corre con `ARBITRO_ENABLED=false`.
- **Secuencial:** `/api/next` entrega un turno a la vez (el más antiguo) y el reloj de cada turno arranca
  al entregarlo, así que no hace falta paralelismo.
- HTTP con `keep-alive` para no pagar el handshake TLS en cada jugada.
- `npm run bot:forever`: supervisor que reinicia el proceso si muere (pausa de 1 s).
- macOS: `caffeinate -dimsu` mientras corre; laptop conectada a la corriente.
- El header `Authorization` nunca se imprime; el token vive solo en `.env` (ignorado por git).
- Log JSONL por jugada: `game_id, kind, opponent, turn, you, column, depth, nodes, score, think_ms,
  post_ms, http_status, state`. Alimenta `docs/TECNICO.md` y los ejemplos de la exposición.

---

## 6. Árbitro simulado (`tools/mock-arbiter`)

Las bases piden trabajar con mocks hasta el jueves; lo tratamos como producto, no como stub:

- Implementa **todos** los endpoints del OpenAPI 0.9.0 con estado real: long polling (retiene hasta
  `wait`), `served_at`, rechazo por `timeout` según `deadline_ms`, 409, 401, ausencia a los 30 s,
  `/api/practice` con `casa-aleatorio` y `casa-basico` (gana y bloquea cuatros inmediatos),
  `/api/games/{id}`, `/api/me`, `/api/me/submission`, `/api/standings`.
- Usa `engine/rules` para validar jugadas: una sola implementación de las reglas en todo el repo.
- **Inyección de fallas** configurable: latencia, 5xx al azar, conexiones cortadas, respuestas lentas.
  Con eso se hacen las pruebas de caos del cliente.
- **Pruebas de contrato:** cada respuesta del mock se valida con ajv contra los esquemas de
  `spec/arbitro-openapi.json`. El jueves se reemplaza el archivo por el definitivo y estas pruebas
  muestran qué cambió.

---

## 7. API para la app web

**Sin estado:** el navegador manda la lista de jugadas; el servidor valida, calcula y responde el estado
completo. Deshacer = mandar la lista con dos jugadas menos. El frontend no implementa reglas.

Son rutas de **nuestro** servidor; no confundir con las del árbitro (`/api/games/{id}` es del árbitro,
`/api/game/*` y `/api/tournament/*` son nuestras).

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/health` | — | `{ ok, version, arbiter: { enabled, state, lastTurnAt, gamesPlayed } }` |
| `POST /api/game/state` | `{ moves }` | `GameState`; valida cada jugada (se usa para la jugada humana, deshacer y cargar posiciones) |
| `POST /api/game/bot-move` | `{ moves, level }` | `GameState` después de la jugada del bot, con `bot` |
| `GET /api/tournament/games` | — | partidas del torneo jugadas por nuestro bot (desde los logs), con resultado |
| `GET /api/tournament/games/:id` | — | registro público del árbitro + tablero después de cada jugada, para repetirla |

```ts
GameState = {
  moves: number[]; board: number[][];        // mismo formato que el árbitro: board[fila][columna], fila 0 abajo
  toMove: 1 | 2; legalMoves: number[];
  status: 'playing' | 'won' | 'draw'; winner: 1 | 2 | null; winningCells: [number, number][];
  bot?: { column: number; depth: number; nodes: number; ms: number; score: number; level: Level };
}
```

- Errores con el mismo vocabulario del árbitro: `400 { error: 'illegal_move', message }` (columna llena,
  fuera de rango o partida terminada) y `400 { error: 'validation', message }`.
- Fastify: las pruebas usan `app.inject()` sin abrir puertos.
- En producción el mismo servidor sirve el build del frontend en `/`. Por defecto escucha solo en
  `127.0.0.1`; en la máquina de demo se usa `HOST=0.0.0.0` para que un celular en la misma red pueda
  abrir la app (`PLAN_CALIDAD_SEGURIDAD.md` §2).
- Límites y controles de seguridad de esta API (tamaño, rate limit, cola de búsquedas, SSRF en el proxy,
  headers): `PLAN_CALIDAD_SEGURIDAD.md` §4.3.

**Niveles** (mismo código; solo cambian parámetros):

| Nivel | Parámetros |
|---|---|
| Fácil | profundidad máx. 2; 30 % de las veces elige al azar entre las jugadas que no pierden de inmediato (azar con semilla, para poder probarlo) |
| Medio | presupuesto de 150 ms |
| Difícil | el presupuesto del torneo (1,400 ms): es el mismo bot que compite |

---

## 8. Configuración

| Variable | Por defecto | Uso |
|---|---|---|
| `ARBITRO_URL` | — | URL base del árbitro (se publica el jueves a las 8:00) |
| `TEAM_TOKEN` | — | token del equipo; solo en `.env`, nunca en git ni en logs |
| `ARBITRO_ENABLED` | `true` | `false` en máquinas de demo y desarrollo |
| `PORT` / `HOST` | `8080` / `127.0.0.1` | API de la app; `HOST=0.0.0.0` solo en la máquina de demo |
| `THINK_SOFT_MS` / `THINK_HARD_MS` | `1400` / `1800` | presupuesto de búsqueda |
| `LONGPOLL_WAIT_S` | `20` | parámetro `wait` de `/api/next` |
| `LOG_DIR` | `./logs` | logs JSONL por jugada |

`ARBITRO_URL` y `TEAM_TOKEN` son los mismos nombres del cliente de referencia de las bases.

---

## 9. Pruebas

**Comando único: `npm test`** → Vitest en todos los paquetes + reporte de cobertura (resumen en consola,
HTML en `coverage/`). Umbral de 90 % en `packages/engine`; si baja, falla.

| Lo que piden las bases | Archivo | Casos |
|---|---|---|
| Reglas: caída de fichas | `rules.test.ts` | cae a la fila libre más baja; columna llena rechazada; columna < 0 o > 7 rechazada |
| Reglas: jugadas legales | `rules.test.ts` | `legalMoves` excluye columnas llenas; tablero lleno → `[]` |
| Reglas: 4 direcciones | `rules.test.ts` | horizontal, vertical, ↗, ↘, en bordes y esquinas; tres en línea no gana; `winningCells` correctas |
| Reglas: empate | `rules.test.ts` | 56 casillas sin ganador → empate; si la última ficha gana → victoria, no empate |
| Algoritmo: nunca ilegal | `search.property.test.ts` | 1,000 posiciones al azar → jugada ∈ `legalMoves` |
| Algoritmo: presupuesto | `search.time.test.ts` | con 100 ms de presupuesto responde a tiempo (con tolerancia) en 200 posiciones |
| Algoritmo: tableros límite | `search.test.ts` | una sola columna disponible; una casilla libre; tablero a punto de llenarse, con y sin victoria |
| Algoritmo: táctica | `puzzles.test.ts` | gana en 1, bloquea en 1, gana en 3, no juega debajo de una amenaza rival |
| Algoritmo: poda correcta | `search.property.test.ts` | alfa-beta da el mismo valor que minimax sin poda a profundidad ≤ 4 |
| Representación rápida | `bitboard.property.test.ts` | 10,000 partidas al azar: bitboard y `rules` coinciden en legalidad, victoria y empate |
| Cliente (con árbitro simulado) | `arbiter/*.test.ts` | `idle` → vuelve a preguntar; `turn` → POST con columna legal; el ejemplo inconsistente del OpenAPI → jugada legal; 409 continúa; 401 hace pausa; red caída reintenta; campos extra tolerados; `players` con `id` o `team_id` |
| Mock fiel al contrato | `contract.test.ts` | cada respuesta valida con ajv contra el OpenAPI |
| API de la app | `http/*.test.ts` | jugada ilegal → 400; el bot abre; victoria con celdas; empate; deshacer |

"Qué tan bien juega el bot no se prueba con unit tests" (bases): eso se mide en la arena y en el torneo.
Para que las pruebas sean deterministas, la búsqueda acepta profundidad fija y semilla.

**CI:** GitHub Actions en cada push y PR: `npm ci` → lint → typecheck → `npm test`, con el resumen de
cobertura en el job. Además: E2E, SonarQube Cloud, secretos, dependencias, CodeQL y ZAP
(`PLAN_CALIDAD_SEGURIDAD.md` §3.2).

**Arena:** motor contra motor, sin HTTP, 100 ms por jugada, en paralelo por núcleos. Cada enfrentamiento
arranca desde aperturas de 4 jugadas al azar y cada apertura se juega dos veces con colores invertidos
(dos motores deterministas, si no, repetirían siempre la misma partida).

---

## 10. Pasos en orden

Hitos propuestos (se ajustan en la reunión de arranque según la disponibilidad real):
**H0** mar 3 noche · **H1** mié 11:00 · **H2** mié 15:00 · **H3** mié 19:00 · **H4** mié 22:00.

| # | Paso | Rol | Listo cuando… | Hito |
|---|---|---|---|---|
| B0 | Planes + `AGENTS.md` | todos | están en `main` antes de cualquier código | H0 |
| B1 | Esqueleto: workspaces, TS estricto, Vitest + cobertura, ESLint/Prettier, CI, `spec/` | R3 | `npm test` corre y CI está en verde | H1 |
| B2 | Reglas (`rules.ts`); R3 escribe primero los casos desde el texto de las bases | R1 + R3 | filas de reglas de §9 en verde; 100 % de cobertura en `rules.ts` | H1 |
| B3 | Árbitro simulado v1: `next`, `move`, `practice`, `games`, `me`, auth, bots de la casa | R3 | pruebas de contrato en verde; se juega una partida con `curl` | H1 |
| B4 | Cliente v1 con elección provisional (la más central legal) | R2 | 20 partidas completas contra el mock sin errores; pruebas del cliente en verde | H2 |
| B5 | Bitboard en dos palabras de 32 bits | R1 | 10,000 partidas de propiedad coinciden con `rules`; benchmark (nodos/s) documentado | H2 |
| B6 | Búsqueda: negamax alfa-beta, profundización iterativa, TT, ordenamiento, tiempo | R1 | puzzles, alfa-beta = minimax, presupuesto y tableros límite en verde | H2 |
| B7 | Heurística v1 + arena | R1 | heurística v1 gana ≥ 60 % a "solo centro" en 400 partidas | H3 |
| B8 | Workers, temporizador de seguridad, fallback, logs JSONL | R2 | 50 partidas contra `casa-basico` en el mock con 150 ms de latencia: 0 timeouts, ≥ 95 % victorias | H3 |
| B9 | API de la app + proxy del torneo + estáticos | R2 | pruebas con `inject` en verde; R4 juega una partida completa desde el navegador | H3 |
| B10 | Endurecimiento: supervisor, `.env.example`, `npm run smoke`, `npm run submit`, pruebas de caos (5xx, cortes, 800 ms de latencia) | R2 + R3 | `kill -9` en plena partida → se recupera y recoge el turno en < 5 s; 0 derrotas por ausencia con fallas inyectadas | H4 |
| B11 | Afinación con datos: H1, pesos, (opcional) libro de aperturas | R1 | tabla de resultados de arena en `docs/TECNICO.md` | H4 |
| B12 | Jueves: conexión real (§12) | R2 + R3 | entrega registrada y bot jugando | jue 9:45 |

Los pasos de git, QA y seguridad (G1, Q1–Q6, S1–S4) están en `PLAN_CALIDAD_SEGURIDAD.md` §5; B1 y Q1
se hacen juntos, y B9 y S1 también.

**Paralelismo:** desde H0 avanzan a la vez B1, B2, B3 y el frontend (F1–F3). B4 depende de B3; B6 de B5;
B8 de B4 y B6; B9 de B6.

**Si vamos tarde, se recorta en este orden:** libro de aperturas → H1 → pruebas de caos extra → proxy del
torneo. **Nunca se recorta:** control de tiempo, fallback, filtro de `legal_moves`, pruebas mínimas de
las bases, documentación.

---

## 11. Qué se delega a la IA y cómo se verifica

Principio: **la IA escribe; nosotros definimos antes qué es correcto y lo comprobamos con algo que no
escribió la misma IA.**

| Paso | Se delega | Verificación |
|---|---|---|
| B1 | configuración del monorepo y CI | CI en verde en un PR; cada dependencia nueva justificada |
| B2 | implementación de `rules.ts` | casos escritos por R3 desde el texto de las bases **antes** del código |
| B3 | mock a partir del OpenAPI | validación ajv contra el OpenAPI; R3 revisa a mano long polling y deadlines |
| B4, B8 | cliente, reintentos, workers | pruebas de caos con el mock; R2 revisa la tabla §5.2 línea por línea |
| B5 | bitboard en dos palabras | oráculo: 10,000 partidas comparadas contra `rules.ts` |
| B6 | alfa-beta, TT, ordenamiento | alfa-beta = minimax; puzzles con solución conocida; nunca ilegal |
| B7, B11 | propuestas de heurística y pesos | solo entran si ganan en la arena: deciden los datos, no la IA |
| Documentación | borradores | revisión humana; cada integrante debe poder explicar cada sección |

**No se delega:** el criterio de listo de cada paso, las decisiones de arquitectura, la revisión del manejo
del tiempo y la exposición. Cada error relevante de la IA va a `docs/BITACORA_IA.md`: qué pedimos, qué
devolvió mal, cómo lo detectamos.

---

## 12. Checklist del jueves 5

| Hora | Acción |
|---|---|
| 7:30 | **Máquina A (bot):** corriente, red estable, `npm ci && npm run build`, `caffeinate`, `HOST=127.0.0.1`. **Máquina B (demo):** `ARBITRO_ENABLED=false`, sin token, `HOST=0.0.0.0` |
| 8:00 | URL y token a `.env`; reemplazar `spec/arbitro-openapi.json` por el definitivo y correr `npm test` (las pruebas de contrato muestran los cambios) |
| 8:05 | `npm run smoke`: `GET /api/me` (token OK) y prácticas contra `casa-basico` abriendo y respondiendo |
| 8:15–9:15 | Prácticas y amistosos; comparar `ms` del árbitro contra `think_ms` y ajustar `THINK_*` si hace falta |
| 9:15 | `npm run submit` (`PUT /api/me/submission` con URL y hash) y verificar con `GET /api/me` |
| 9:30 | Go / no-go (`PLAN_CALIDAD_SEGURIDAD.md` §3.3) |
| 9:40 | Último commit, tag `v1.0.0` y nuevo registro con ese hash si hubo cambios (cuenta el último registro) |
| 9:45 | Congelado. Nadie toca la máquina A; el bot sigue jugando la liga |

---

## 13. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| La búsqueda se pasa del tiempo (CPU ocupada, error en el corte) | media | partida perdida | worker propio + temporizador en el hilo principal + fallback; prueba de presupuesto |
| El proceso se cae durante la liga | baja | derrotas por ausencia | supervisor; errores capturados en el ciclo; prueba con `kill -9` |
| Laptop en reposo o Wi-Fi caído | media | derrotas por ausencia | `caffeinate`, corriente, timeout de 24 s, reintentos con tope de 5 s |
| Dos procesos con el mismo token | media | turnos duplicados | `ARBITRO_ENABLED`; solo la máquina A juega |
| Cambia el OpenAPI definitivo | alta | cliente roto a las 8:00 | todo el parseo en `schema.ts`; pruebas de contrato; campos extra tolerados |
| Bitboard con errores sutiles | media | jugadas malas | oráculo de propiedad; plan B con `rules.ts` |
| Heurística mal calibrada para altura 7 | media | bot más débil | H1 medida en arena, no supuesta |
| `validation` / `unknown_game` sin código HTTP documentado | media | comportamiento inesperado | manejo genérico + pregunta a organizadores |
| Token filtrado | baja | token nuevo o sanción | `.env` ignorado; logs sin headers; hook que busca el valor real del token; GitGuardian en cada push y PR (`PLAN_CALIDAD_SEGURIDAD.md` §4) |

---

## 14. Preguntas abiertas a los organizadores

| # | Pregunta | Estado |
|---|---|---|
| 1 | Si `board`, `moves`, `turn`, `you` y `last_move` no coinciden (ejemplo del OpenAPI), ¿cuál manda? | por enviar (el ejemplo sigue igual en 1.0.1) |
| 2 | ¿Qué código HTTP devuelven `validation` y `unknown_game`? ¿Un `validation` hace perder la partida? | **respondida en el OpenAPI 1.0.1:** `validation` = 400 y no penaliza; `unknown_game` = 409 en `move` y 404 en `games` |
| 3 | ¿Es seguro reintentar `POST /api/move` ante un error de red? | **respondida en el OpenAPI 1.0.1:** si ya se registró, responde 409, que no penaliza |
| 4 | ¿Los endpoints públicos (`/api/games/{id}`, `/api/standings`) permiten CORS? | por enviar |
| 5 | ¿Quién abre cada partida del tercer puesto y de la final? | por enviar |
| 6 | ¿El repositorio puede ser privado hasta el jueves y hacerse público antes de registrar la entrega? | por enviar |
