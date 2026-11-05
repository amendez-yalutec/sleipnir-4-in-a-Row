# Documentación técnica

> **En construcción.** Cubre lo implementado hasta B6, B9 (con S1) y F1–F4. Las secciones marcadas como _pendiente_ se
> completan en su paso del plan.

## 1. Arquitectura

Un motor de juego puro y dos adaptadores delgados alrededor del **mismo** motor. Detalle y motivos en
`PLAN_BACKEND.md` §3.

```
  Árbitro ◀──HTTP──▶ apps/bot (cliente del torneo) ──┐
                                                       ├──▶ packages/engine (reglas + búsqueda)
  App web ◀──HTTP──▶ apps/bot (API de la app, B9) ────┘
```

| Paquete | Qué hace |
|---|---|
| `packages/engine` | reglas (`rules.ts`), representación rápida (`bitboard.ts`), búsqueda (`search.ts`), heurística (`eval.ts`), tabla de transposición (`tt.ts`). Sin red, sin disco, sin reloj ni azar propios. |
| `apps/bot` | cliente del árbitro: `schema.ts` interpreta el JSON, `client.ts` hace HTTP, `loop.ts` y `play-turn.ts` juegan, `chooser/` elige la jugada. |
| `tools/mock-arbiter` | árbitro simulado fiel al OpenAPI, con fallas inyectables. |

## 2. El motor

### 2.1 Reglas

`rules.ts` es la referencia: tablero legible `board[fila][columna]` (fila 0 abajo), igual que el árbitro.
Todo lo demás (bitboard, búsqueda, mock) se prueba contra este módulo. Tiene 100 % de cobertura
obligatoria.

### 2.2 Bitboard: 64 bits en dos palabras de 32

- Columna c, fila r → bit `8c + r`. Cada columna tiene 7 casillas más un **bit centinela** siempre en 0.
  Ese bit corta las líneas para que una vertical no "dé la vuelta" a la columna siguiente.
- 8 columnas × 8 bits = 64 bits. JavaScript no tiene enteros de 64 bits rápidos, así que se parten en
  `lo` (columnas 0–3) y `hi` (columnas 4–7).
- **Cuatro en línea:** para la dirección `s` (1 vertical, 8 horizontal, 9 ↗, 7 ↘), `m = x & (x >> s)`;
  hay cuatro si `m & (m >> 2s) ≠ 0`.
- **Clave para la tabla de transposición:** `fichas del que mueve + todas las fichas`. Es única, y con 8
  bits por columna la suma nunca invade la columna vecina.
- **Fuente:** Pascal Pons, *Solving Connect 4: how to build a perfect AI* (blog.gamesolver.org).
  Adaptación nuestra: de 7×6 (49 bits) a 8×7 (64 bits) en dos palabras.
- **Verificación:** 10,000 partidas al azar en las que bitboard y reglas coinciden en todo
  (`bitboard.property.test.ts`).

### 2.3 Búsqueda

- **Negamax con poda alfa-beta.** Victoria = `1000 − ply`: prefiere ganar pronto y perder tarde.
- **Profundización iterativa:** busca a profundidad 1, 2, 3… y siempre tiene lista la jugada de la última
  profundidad completa.
- **Atajos en cada nodo:**
  - si puede ganar ya, gana;
  - si el rival amenaza, solo considera bloquear, y con dos amenazas la posición está perdida;
  - nunca juega justo debajo de una casilla que le da la victoria al rival.
- **Tabla de transposición:** 2^20 entradas (≈ 13 MB) en arreglos tipados. Guarda valor, cota,
  profundidad y mejor jugada, y se conserva entre turnos.
- **Ordenamiento:** primero la jugada de la tabla, luego las que crean más amenazas y luego el centro
  (3, 4, 2, 5, 1, 6, 0, 7).
- **Heurística v1** (`eval.ts`): 12 puntos por amenaza propia (casilla vacía que completaría un cuatro),
  menos las del rival, más un bono por fichas en el centro (3, 2 y 1 por columna). La hipótesis de
  paridad H1 se mide en la arena (B7, _pendiente_).

### 2.4 Tiempo

- El árbitro da 3,000 ms desde `served_at`. Medimos desde que **recibimos** el turno.
- **soft** = 1,400 ms: no empieza una profundidad nueva si ya usó la mitad.
- **hard** = 1,800 ms: aborta la profundidad en curso; el motor mira el reloj cada 2,048 nodos.
- **Red de seguridad:**
  - la búsqueda corre en un **worker** (hilo aparte), así que el hilo principal sigue libre para la red;
  - un temporizador del hilo principal actúa en hard + 100 ms y juega el respaldo (ganar en 1 →
    bloquear → centro);
  - si el worker no responde en hard + 500 ms, se descarta y se crea otro;
  - torneo y app usan **workers distintos**: una partida en la app no le quita tiempo al bot de la liga.

## 3. Rendimiento

`npm run bench`, presupuesto del torneo (soft 1,400 ms, hard 1,800 ms), Apple M4, Node 26:

| Posición | Jugada | Profundidad | Nodos | ms | Nodos/s | Resuelta |
|---|---|---|---|---|---|---|
| tablero vacío | 3 | 17 | 8,468,475 | 1406 | 6,024,159 | no |
| apertura (4 jugadas) | 3 | 17 | 4,610,486 | 742 | 6,217,352 | no |
| medio juego (14 jugadas) | 2 | 21 | 7,246,922 | 1063 | 6,817,723 | no |
| medio juego (24 jugadas) | 3 | 25 | 2,893,794 | 384 | 7,545,610 | sí |
| final (34 jugadas) | 6 | 17 | 39,343 | 5 | 8,291,320 | sí |

"Resuelta" significa que el valor es exacto: victoria, derrota o empate demostrados. Desde el medio juego
el bot calcula la partida hasta el final.

**Contra los bots de la casa**, con procesos reales (`npm run mock` + `npm run bot`), presupuesto
reducido a 300/400 ms: 8 de 8 partidas ganadas (4 contra `casa-basico`, 4 contra `casa-aleatorio`),
42 jugadas sin errores. La jugada más lenta tardó 402 ms según el árbitro.

Los bots de la casa son débiles: esto prueba que el bot es **confiable** (jugadas legales, a tiempo y
sin caerse), no qué tan **fuerte** es contra otros equipos. La fuerza relativa la mide la arena (B7,
_pendiente_).

## 4. Pruebas

`npm test` corre todo y reporta cobertura (umbral de 90 % en el motor y 100 % en `rules.ts`).

| Qué | Dónde |
|---|---|
| Reglas desde las bases: caída, legalidad, 4 direcciones, empate | `packages/engine/src/rules.test.ts` |
| Bitboard = reglas en 10,000 partidas al azar | `packages/engine/src/bitboard.property.test.ts` |
| Puzzles: gana en 1 y en 3, bloquea, no juega debajo de una amenaza | `packages/engine/src/search.test.ts` |
| Alfa-beta = minimax sin poda (profundidad 1–4); jugada siempre legal | `packages/engine/src/search.property.test.ts` |
| Presupuesto: 200 posiciones con corte de 100 ms | `packages/engine/src/search.time.test.ts` |
| El mock cumple el OpenAPI (ajv) | `tools/mock-arbiter/src/contract.test.ts` |
| Cliente: 20 partidas sin errores, fallas inyectadas, pausas, el token nunca en logs | `apps/bot/src/arbiter/*.test.ts` |
| E2E en navegador (escritorio y celular): partidas completas, cada estado de §6, teclado, accesibilidad con axe; falla con cualquier error de consola | `e2e/*.spec.ts` (`npm run test:e2e`) |

## 5. Desviaciones del plan

| Plan | Qué hicimos | Por qué |
|---|---|---|
| B4: elección provisional "la más central legal" | la jugada de respaldo (ganar en 1 → bloquear → centro) | es la misma que necesita el temporizador de seguridad; así se prueba desde el principio |
| F1: diseños de v0 votados por el equipo | tokens del **migo Design System** (Figma, modo migo-light): Outfit, colores de acción y feedback, radios y medidas de botón | v0 no estaba conectado; Luis pidió usar el sistema de diseño de Migo. Cada token lleva en `apps/web/src/index.css` el nombre de su variable en Figma |
| §8: tablero azul marino, persona naranja, bot marfil | tablero Brand Secondary (`#1155CC`), persona dorada con anillo interior, bot blanca; línea ganadora en Brand Terthiary | colores del sistema de Migo; las fichas se distinguen por color, luminosidad **y forma** |
| F1: shadcn/ui con Radix | componentes al estilo shadcn/ui (Button, Card) copiados al repo, sin Radix | los selectores se resolvieron con radios nativos, accesibles sin dependencias extra |
| B8: workers + logs a archivo | los workers se adelantaron con B9; los logs JSONL a archivo siguen pendientes | la API de la app no podía correr búsquedas en el hilo del torneo |
| §7: niveles "Fácil / Medio / Difícil" | en el contrato se llaman `easy` / `medium` / `hard` | identificadores en inglés (`AGENTS.md`); la web muestra los nombres en español |
| §7: `GET /api/tournament/games` "desde los logs" | se arma con la ruta pública `GET /api/games` del árbitro (OpenAPI 1.0.1), filtrada por `TEAM_ID` | funciona también en la máquina de demo, que no tiene token ni logs del torneo |
| §8: el token solo en el `.env` de la máquina A y el ciclo arranca con `ARBITRO_ENABLED=true` | el ciclo también se inicia y detiene desde la web (`TournamentController`, rutas `/api/control`); la URL y el token se pasan desde el panel "Mi equipo" y viven solo en la memoria del servidor | manejar el bot sin editar archivos ni reiniciar. Las rutas solo aceptan loopback y el mismo origen |
| B9: presupuesto `soft = min(THINK_SOFT_MS, 0.47 · plazo)`, `hard = min(THINK_HARD_MS, 0.6 · plazo)` (1400 / 1800) | topes 0.6 / 0.72 del plazo (máximo 2,160 ms), valores 1800 / 2200 y reparto por fase: apertura (< 6 jugadas) 0.6 · soft, medio juego (6–24) soft = hard, final soft | en las prácticas del 5 de nov. el bot pensaba 0.8–1.5 s de 3 s, y con más tiempo cambiaba 2–3 jugadas del medio juego. Medido en la laptop del torneo: peor búsqueda 1,867 ms; con red y margen queda ~0.6 s antes del plazo |
| Plan: el bot solo piensa en su turno | **piensa en el turno del rival**: tras una jugada aceptada, el worker busca la posición siguiente (hasta 15 s) para llenar la tabla de transposición; el próximo turno la corta con una bandera compartida (`SharedArrayBuffer`) que hace que el reloj inyectado devuelva `Infinity` | el 5 de nov. perdimos un amistoso contra Odd Times por una trampa a 29 jugadas que se veía con 4 s y no con 1.26 s. El motor sigue puro: solo cambia el reloj que se le inyecta |
| Plan: sin libro de aperturas | **libro mínimo** (`apps/bot/src/chooser/book.ts`) con posiciones demostradas por análisis, también en espejo; la primera es la jugada 18 de la línea con la que Odd Times nos ganó tres veces | el motor es determinista: un rival que conoce una línea ganadora la repite. La jugada del libro es victoria demostrada (9 s de análisis) |
| Plan: el empate vale 0 | jugando **segundo**, el empate vale **+25** para nosotros (`contempt` en `SearchOptions`; `SECOND_PLAYER_DRAW_SCORE` en `play-turn.ts`); jugando primero, 0 | el equipo prefiere empatar a perder cuando empieza segundo. Las victorias demostradas (~1,000) siguen por encima de cualquier empate |
| Invariante 2 (JSON del árbitro solo en `apps/bot/src/arbiter/schema.ts`) | el panel "Mi equipo" consulta el árbitro desde el navegador; su JSON se interpreta solo en `apps/web/src/arbiter/schema.ts` | el equipo quería ver posición, crear prácticas y registrar la entrega desde la web con su token, sin pasar el token por nuestra API. La CSP abre `connect-src` a `https:` y al árbitro simulado local |
| §7: la app se juega en la misma computadora o en la red local | se mantiene así: todo corre en la laptop (`npm run bot` sirve la web, la API y el bot del torneo). Se probó desplegar la app y el bot en Vercel y se retiró | Vercel ejecuta funciones que se apagan, no procesos que corren siempre. El bot del torneo necesita un long polling continuo para recoger cada turno antes de 30 s; en Vercel solo se lograba con un cron por ventanas, con huecos entre ventanas y riesgo de perder por ausencia si el cron se atrasaba. La app web sola tampoco juega (pide todo a la API, invariante 4), así que habría que mantener una segunda copia de la API como función. Ver § 9 |

## 6. API de la app

Sin estado: el navegador manda la lista de jugadas y el servidor la valida con las reglas del motor. El
contrato vive en `packages/contracts` (zod) y lo comparten la API y la web.

| Ruta | Qué hace |
|---|---|
| `POST /api/game/state` `{ moves }` | estado completo: tablero, a quién le toca, jugadas legales, ganador y casillas ganadoras |
| `POST /api/game/bot-move` `{ moves, level }` | el estado después de la jugada del bot, con `bot: { column, depth, nodes, ms, score, level }` |
| `GET /api/health` | versión y estado del ciclo del torneo (`waiting`, `playing`, `error`…) y partidas jugadas |
| `GET /api/tournament/games` | nuestras partidas del torneo, por la ruta pública del árbitro y **sin token** |
| `GET /api/tournament/games/:id` | una partida con el tablero después de cada jugada, para repetirla |

**Niveles:**
- `easy`: profundidad 2 y, el 30 % de las veces, una jugada al azar que no pierde de inmediato. El azar
  usa una semilla calculada de las jugadas, así que la misma posición da la misma decisión.
- `medium`: 150 ms.
- `hard`: el presupuesto del torneo; es el mismo bot que compite.

**Errores:** `{ error, message }` con `illegal_move`, `validation`, `busy` (429, cola del worker
llena), `rate_limited`, `not_found`, `tournament_unavailable` o `internal`. Nunca incluyen stack trace.

Controles de seguridad y resultados del pentest: [`SEGURIDAD.md`](SEGURIDAD.md).

**Prueba integral** (procesos reales, presupuesto de 600/800 ms): mientras la app respondía 6 jugadas
en nivel difícil seguidas (0.35–0.79 s cada una), el bot ganó sus 4 partidas del torneo contra el mock
sin ningún error. Su jugada más lenta pensó 606 ms.

### 6.1 App web (`apps/web`)

React + Vite + TypeScript, Tailwind con el tema del proyecto (`src/index.css`) y componentes al estilo
shadcn/ui copiados al repo. El navegador **no implementa reglas**: cada jugada la valida la API.

| Pieza | Qué hace |
|---|---|
| `game/reducer.ts` | la máquina de estados de `PLAN_FRONTEND.md` §6 (setup, tu turno, confirmando, bot pensando, fin, error), pura y probada al 100 % |
| `game/useGame.ts` | hace las llamadas a la API según la fase y las cancela si la fase cambia; teclas 1–8 y `?moves=` |
| `ui/coords.ts` | **único** lugar que convierte columnas 0–7 ↔ 1–8 y la fila 0 de abajo al orden de pantalla |
| `components/Board.tsx` | tablero 8×7: cada columna es un botón con su `aria-label` ("Columna 4, quedan 3 espacios"); línea ganadora resaltada |
| `api/client.ts` | timeout de 10 s, respuestas validadas con `packages/contracts` y errores en frases para la persona |
| `api/fake-client.ts` | mismo contrato con las reglas reales del motor; solo para pruebas |

**Diseño (migo Design System):**
- los valores se leyeron de las variables del archivo de Figma, sin modificarlo;
- no se copiaron logos ni ilustraciones de marca;
- **hallazgo de accesibilidad:** el azul de acción `#0076FF` con texto blanco (y azul sobre blanco) da
  4.17:1, por debajo de AA (4.5:1) para texto normal. Para conservar el color oficial, los botones usan
  texto de 20 px en negrita, que WCAG trata como texto grande (mínimo 3:1). El texto secundario
  `#667799` solo se usa sobre blanco (4.5:1); sobre el canvas `#F2F6FC` da 4.15:1.

**Verificado:**
- pruebas de partidas completas empezando cada lado, columna llena, falla de red con "Reintentar",
  deshacer, teclado y `?moves=`;
- prueba de orientación con el tablero asimétrico del OpenAPI;
- una prueba falla si aparece cualquier `console.error`;
- en el navegador contra la API real, a 1280 px y a 375 px (celular), sin errores en consola;
- el build no tiene scripts ni estilos en línea, así que funciona con la CSP estricta del servidor.

## 7. Contrato del árbitro: OpenAPI 1.0.1

Los organizadores publicaron la versión final el 4 de noviembre. No cambian `/api/next` ni `/api/move`,
que son las que usa el bot en el torneo. Lo que cambió:

| Cambio | Qué hicimos |
|---|---|
| Partidas: `players` con `team_id` (`PlayerRef`), más `series`, `current`, estado `scheduled` y detalle de derrotas (`forfeited_by`, `ms`, `column`, `waited_ms`, razón `admin`) | el mock lo devuelve igual; `parseGame` del bot acepta `team_id` (y `id`, por compatibilidad) y `scheduled` |
| Rutas públicas nuevas: `GET /api/games` (lista sin tablero), `/api/health`, `/api/openapi.json`, `/api/state`, `/api/live` (SSE) | el mock las implementa; la forma de `/api/state` no está documentada y la del mock es propia |
| `validation` = 400 y no penaliza; `unknown_game` = 409 en `move` y 404 en `games` | era nuestro supuesto en el mock; ahora está confirmado |
| `POST /api/practice`: `opponent` opcional (por defecto `casa-basico`) y 400 si es inválido | el mock lo valida con el esquema |
| Entrega: `commit` hexadecimal de 7–40 y `repo_url` de GitHub o Bitbucket | el mock lo valida con el esquema; `npm run submit` (B10) debe cumplirlo |
| `/api/me` trae `phase`; fase nueva `frozen` (entregas cerradas, antes de la liga) | el mock la reporta |
| El ejemplo de turno sigue inconsistente (`moves` vs `board`) | sin cambio: mandan `board` + `you` |

El tablero en vivo del árbitro (video de los organizadores) muestra 3 s por jugada, 30 s de ausencia,
puntos 3/1/0 y estos desempates: puntos, enfrentamiento directo, diferencia V−D y sorteo.

## 8. Pendiente

Arena y H1 (B7), logs JSONL a archivo (B8), endurecimiento (B10: supervisor, `smoke`, `submit`,
`build`), afinación (B11) y conexión real del jueves (B12). Ver `PLAN_BACKEND.md` §10.

## 9. Despliegue: todo en la laptop (por qué no Vercel)

Todo corre en la laptop del equipo con `npm run bot`: un solo proceso de Node sirve la app web, la API de la
app y el bot del torneo, que se inicia y detiene desde **Mi equipo**. Se probó desplegar en Vercel y se
retiró por estas limitaciones:

| Pieza | Qué necesita | Por qué Vercel no encaja |
|---|---|---|
| Bot del torneo | un ciclo que nunca se detiene: long polling a `/api/next` y respuesta en 3 s | Vercel ejecuta funciones que despiertan, responden y se apagan. Solo se podía con un cron cada minuto que corriera el ciclo por ventanas de ~50 s: quedaban huecos de ~7-10 s sin preguntar y, si el cron se atrasaba, un turno podía pasar los 30 s y perderse por ausencia. Además el token tendría que vivir en Vercel, fuera de la máquina A |
| App web | la API de la app (`/api/game/*`): la web no tiene reglas ni bot (invariante 4) | habría que mantener una segunda copia de la API como función, con la búsqueda sin workers y un rate limit que no es global |

Las bases solo piden que la app funcione "en la misma computadora o en la red local", así que Vercel era un
extra y no compensaba el riesgo para la liga (25 puntos). El árbitro de prueba que usamos para practicar sí
está en Vercel, pero es otro proyecto: no forma parte de esta entrega.

