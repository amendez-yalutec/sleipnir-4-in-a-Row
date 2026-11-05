# Bitácora de uso de IA

Registro honesto de cómo usamos la IA para construir el proyecto: qué le pedimos, qué devolvió, qué
estaba mal y cómo lo detectamos. Es la base de la parte "cómo usaron la IA" de la exposición.

**Cuándo se agrega una entrada:** cuando la IA produce algo incorrecto, cuando su propuesta cambia una
decisión, o cuando una verificación nuestra descubre algo. No hace falta registrar cada prompt.

**Formato**

```
### AAAA-MM-DD — título corto
- Quién / herramienta:
- Pedido:
- Qué devolvió:
- Qué estaba mal (si algo):
- Cómo lo verificamos / detectamos:
- Decisión:
```

---

### 2026-11-03 — Análisis de las bases y validación del OpenAPI

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** revisar las bases completas y validar el contrato `arbitro-openapi.json` 0.9.0.
- **Qué devolvió:** checklist de entregables, análisis de la rúbrica, riesgos y ocho observaciones sobre
  el contrato.
- **Cómo lo verificamos:** no aceptamos las observaciones solo por lectura: un script reconstruyó el
  tablero a partir de `moves` en los ejemplos y lo comparó contra `board`, y revisó que todos los `$ref`
  resuelvan.
- **Hallazgos confirmados:**
  - El ejemplo de turno de `/api/next` (y de la pág. 7 de las bases) no es coherente: `moves` tiene
    8 jugadas pero `board` 6 fichas; `you: 2` en un turno impar; `last_move.by: 1` aunque la 8.ª jugada
    la hizo el jugador 2.
  - El ejemplo de `/api/games/{id}` usa `players.*.team_id`, pero el esquema `Team` exige `id`; además
    declara una victoria con solo 2 jugadas (ejemplo recortado).
  - `unknown_game` y `validation` están en el enum de errores sin respuesta HTTP documentada.
- **Decisión:** `board` + `you` como fuente de verdad, `legal_moves` como filtro final, parser tolerante
  a `id`/`team_id`; el ejemplo inconsistente queda como caso de prueba. Preguntas para los
  organizadores en `PLAN_BACKEND.md` §14.

### 2026-11-03 — Redacción de los planes y AGENTS.md

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** redactar `PLAN_BACKEND.md`, `PLAN_FRONTEND.md` y `AGENTS.md` con stack TypeScript, antes
  de escribir código. En la revisión, Luis pidió cubrir también git, despliegue para la demo, QA,
  seguridad y pentest → `PLAN_CALIDAD_SEGURIDAD.md`.
- **Qué devolvió:** los documentos con arquitectura, algoritmo, pasos con criterio de listo, riesgos,
  verificación de lo delegado a la IA, entornos, puertas de CI, modelo de amenazas y casos de abuso.
- **Ajuste propuesto por la IA al revisar seguridad:** el servidor pasó a escuchar en `127.0.0.1` por
  defecto (antes `0.0.0.0`), para que la máquina del torneo no quede expuesta en el Wi-Fi del evento.
- **Cómo lo verificamos:** Luis revisó los planes y pidió ampliarlos (QA, seguridad, despliegue). El
  equipo recibió un resumen el mismo día; sus comentarios entran como ajustes registrados antes de
  programar el motor y el frontend.
- **Decisión:** commit local de los planes el 3 de noviembre para empezar la base esa misma noche.

### 2026-11-03 — Herramientas de QA y calidad, y stack del frontend

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** Luis propuso Cypress para las pruebas E2E y GitGuardian y SonarQube para la revisión de
  código y seguridad; preguntó si usar React o Angular y cómo encarar el diseño.
- **Qué devolvió:** comparación con criterios del reto:
  - Playwright sobre Cypress: motor de Safari con emulación de iPhone (puntos extra del celular) y
    ejecución en paralelo gratis;
  - SonarQube Cloud en vez de Server: sin infraestructura que mantener, gratis en repos públicos;
  - GitGuardian en lugar de gitleaks, para no tener tres escáneres de secretos;
  - React sobre Angular: app chica, y v0 y Lovable generan React + Tailwind + shadcn/ui;
  - diseño con propuestas de v0 votadas por el equipo.
- **Qué estaba mal (si algo):** nada detectado.
- **Decisión (de Luis):** Playwright, SonarQube Cloud, GitGuardian, React + Tailwind + shadcn/ui.
- **Otros ajustes:** el equipo queda en 4 personas activas y los roles se reparten en cuatro. La IA
  propuso cambiar el merge de squash a rebase para que el historial muestre que las pruebas llegan antes
  que el código; se aceptó.

### 2026-11-03 — Base del proyecto (B1, Q1, Q2)

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** estructura del monorepo, CI y hooks. Luis pidió que la IA se encargue de automatizar QA y
  seguridad.
- **Qué devolvió:** workspaces con TypeScript estricto, ESLint, Prettier, Vitest con umbral de cobertura,
  hooks (formato, Conventional Commits, guardia de secretos), CI con acciones fijadas por SHA, SonarQube
  Cloud listo para conectar, Dependabot y plantilla de PR.
- **Lo que no se dio por hecho (revisado antes de instalar):**
  - La última versión de TypeScript (7.0) **no es compatible** con typescript-eslint, que pide
    `< 6.1`. Se fijó TypeScript `~6.0.3`; instalar "lo último" habría roto el lint.
  - lint-staged 17 exige Node ≥ 22.22.1, así que el requisito del plan (Node ≥ 22) se precisó en
    `engines`.
  - `npm audit` reporta 12 vulnerabilidades moderadas en `minimatch`, que solo usa ESLint (desarrollo).
    No llegan a producción; la puerta del CI (`--omit=dev`, nivel alto) pasa y Dependabot las seguirá.
- **Cómo lo verificamos:** además de `npm run verify` en verde, se probó que cada control **falla
  cuando debe**:
  - un archivo del motor con `Math.random`, `Date.now` y `node:fs` → 3 errores de ESLint;
  - un `.env` y un archivo con un token falso en stage → commit bloqueado (y el mensaje no muestra el
    token);
  - un mensaje de commit sin tipo → rechazado por commitlint.
- **Decisión:** se integra como PR de la rama `feat/B1-base` cuando exista el repo en GitHub, para que el
  CI corra sobre él.

### 2026-11-04 — Reglas del juego (B2)

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** B2 con las pruebas primero: casos escritos desde el texto de las bases y luego `rules.ts`.
- **Qué devolvió:** 36 casos (caída, legalidad, 4 direcciones en bordes y esquinas, empate, el ejemplo
  inconsistente del OpenAPI) más pruebas de propiedad con fast-check. Primero un commit en rojo con solo
  la interfaz, y después la implementación.
- **Qué estaba mal:** las pruebas de propiedad, tal como se escribieron primero, generaban partidas de
  unas 10 jugadas, porque fast-check arma arreglos cortos por defecto. Así casi nunca se llenaba una
  columna ni el tablero. Se notó porque toda la suite tardaba 0.3 s, demasiado poco para miles de
  jugadas. Ahora cada partida al azar se juega hasta que termina.
- **Cómo lo verificamos:**
  - el detector de victoria se compara contra un oráculo ingenuo escrito aparte, que no usa las
    ventanas precalculadas;
  - las secuencias de empate en 56 jugadas y de "la ficha 56 gana" salieron de un script de búsqueda,
    no se armaron a mano, y la prueba las comprueba con la implementación;
  - se exige 100 % de cobertura en `rules.ts` y se probó que `npm test` falla si baja.
- **Decisión:** tras cada jugada solo se revisan las ventanas que pasan por la última ficha (a lo sumo
  16 de 107). `fromArbiterBoard` no exige que la paridad de fichas coincida con `you`, porque el ejemplo
  oficial no la cumple.

### 2026-11-04 — Árbitro simulado (B3)

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** mock de todas las rutas del OpenAPI con estado real, fallas inyectables y pruebas de
  contrato.
- **Qué devolvió:** Fastify con long polling, reloj de 3 s y ausencia de 30 s, bots de la casa, tabla,
  entregas y fallas (latencia, 503, cortes). Cada cuerpo que recibe y cada respuesta en las pruebas se
  valida con ajv contra el propio `spec/arbitro-openapi.json`.
- **Qué estaba mal (lo encontraron las pruebas y la cobertura, no la revisión):**
  - dos líneas que nunca se ejecutaban: la revisión del plazo dentro de `submitMove` era código muerto,
    porque `sweep()` ya cerraba la partida antes. Se eliminó;
  - el parser de `MOCK_TEAMS` borraba los espacios de los nombres que llevan ":";
  - una prueba asumía mal el orden de la tabla con empate en puntos.
- **Hallazgo:** la prueba de contrato deja registrado automáticamente que el ejemplo oficial de
  `/api/games/{id}` no cumple el esquema `Team` (usa `team_id`). Si el OpenAPI definitivo lo corrige,
  esa prueba avisa.
- **Dependencias:** fastify 5.12.8, ajv 8.20.0 y ajv-formats 3.0.1. Las 3 eran la última versión estable;
  `npm audit --omit=dev` sigue en 0.
- **Decisión:** lo que el OpenAPI no define (por ejemplo `game_id` inexistente o un cuerpo inválido)
  quedó como supuestos explícitos en `tools/mock-arbiter/README.md`, pendientes de §14. Se verificó una
  partida completa con `curl` contra `npm run mock`.

### 2026-11-04 — Cliente del árbitro (B4)

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** cliente del torneo con elección provisional, probado contra el mock: 20 partidas sin
  errores.
- **Qué devolvió:**
  - `schema.ts` (zod, tolerante; único lugar que interpreta el JSON del árbitro);
  - cliente HTTP sin redirecciones, con timeouts y tope de tamaño;
  - ciclo con pausas crecientes, temporizador de seguridad y guardia de `legal_moves`;
  - configuración validada que nunca repite el token.
- **Qué estaba mal (tres bugs, los tres encontrados por pruebas y no por revisión):**
  1. **Cada jugada fallaba al instante.** `AbortSignal.timeout` exige milisegundos enteros y el reloj
     monótono da fracciones. Las pruebas unitarias pasaban porque usaban relojes falsos con enteros;
     lo detectó la prueba de 20 partidas contra el mock real, que agotó su tiempo.
  2. **El mismo caso mostró un ciclo sin pausa.** Cuando la jugada no se confirmaba, el bot volvía a
     preguntar de inmediato: unas 3 peticiones por milisegundo contra el árbitro. Eso viola el
     invariante 8 (juego limpio). Ahora pausa 1, 2, 4 y 5 s.
  3. **Un 401 al enviar la jugada no hacía crecer la pausa**, porque recibir un turno la reiniciaba.
     Ahora solo se reinicia con una jugada aceptada. Lo detectó una prueba de pausas con cliente falso.
- **Cómo lo verificamos:**
  - 20 partidas contra el mock: 0 rechazos, 0 errores y el token no aparece en ningún log;
  - 6 partidas con latencia, 15 % de 503 y 5 % de conexiones cortadas: 0 derrotas por tiempo, jugada
    ilegal o ausencia;
  - un 302 hacia otro host no le llega a ese host (el token no viaja);
  - procesos reales (`npm run mock` + `npm run bot`): 6 partidas y 67 jugadas aceptadas sin errores.
- **Decisión:** la elección provisional es la jugada de respaldo (ganar en 1 → bloquear → centro), la
  misma que usará el temporizador de seguridad. Pierde a veces contra `casa-aleatorio`; eso lo resuelve
  la búsqueda (B6).

### 2026-11-04 — Bitboard y búsqueda (B5, B6)

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** representación rápida del tablero en 64 bits y búsqueda alfa-beta con profundización,
  tabla de transposición y control de tiempo (`PLAN_BACKEND.md` §4).
- **Qué devolvió:** `bitboard.ts` (técnica de Pons adaptada a 8×7 en dos palabras de 32 bits),
  `search.ts`, `tt.ts`, `eval.ts` y `npm run bench`.
- **Qué estaba mal:**
  - **Error de código:** con una sola columna libre, la búsqueda respondía sin revisar si esa jugada
    ganaba, y reportaba la última casilla ganadora como 0 en vez de victoria. Lo detectó el caso de
    tablero límite "la ficha 56 gana". Ahora revisa primero si hay jugada ganadora.
  - **Errores de la IA en las pruebas, no en el código:**
    - una prueba esperaba `WIN − 5` para "gana en 3", pero el valor correcto es `WIN − 3`;
    - el oráculo de amenazas analizaba tableros ya terminados.

    Los dos se corrigieron explicando el motivo.
  - **Pruebas que excedían 5 s** al correr todo en paralelo con cobertura: se ajustó el reloj inyectado
    de una y el tiempo límite de las dos, sin bajar la cantidad de casos.
- **Cómo lo verificamos:**
  - 10,000 partidas al azar donde bitboard y reglas coinciden;
  - alfa-beta, con y sin tabla, da el mismo valor que un minimax sin poda escrito aparte sobre
    `rules.ts`, en 300 posiciones a profundidad 1–4;
  - 1,000 posiciones con jugada siempre legal;
  - 200 posiciones con corte de 100 ms, todas a tiempo;
  - contra el mock con procesos reales: 8 de 8 partidas ganadas a los bots de la casa.
- **Decisión:** hasta B8 la búsqueda corre en el hilo principal y depende de su propio corte duro. Queda
  anotado en `docs/TECNICO.md` § Desviaciones.

### 2026-11-04 — OpenAPI 1.0.1 de los organizadores

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** revisar la versión final del OpenAPI (1.0.1) y un video del tablero en vivo, y aplicar los
  cambios.
- **Qué devolvió:**
  - un script comparó las dos versiones ruta por ruta y esquema por esquema;
  - el mensaje de los organizadores mencionaba `team_id` y la lista sin tablero, pero el script encontró
    más: 5 rutas públicas nuevas, 3 esquemas nuevos (`GameSummary`, `PlayerRef`, `Phase`), detalle de
    las derrotas, la fase `frozen` y validaciones nuevas en la entrega (commit hexadecimal y repo de
    GitHub o Bitbucket).
- **Cómo lo verificamos:** se reemplazó `spec/arbitro-openapi.json` **antes** de tocar el código. Las
  pruebas de contrato fallaron en 3 casos, justo los que cambiaron: el mock devolvía `id` en lugar de
  `team_id`, el ejemplo oficial de partidas ahora sí cumplía su esquema y el 404 traía ejemplo nuevo. Es
  el uso para el que las escribimos en B3.
- **Respuestas que nos dio el documento:** dos de las preguntas de §14 quedaron respondidas
  (`validation` no penaliza; un `move` repetido recibe 409). Los supuestos del mock coincidían con lo
  que el árbitro hace.
- **Decisión:**
  - el mock implementa las rutas nuevas, incluido el SSE de `/api/live`;
  - el bot acepta `team_id` e `id`;
  - el video es confidencial: no se sube al repo; lo útil quedó anotado en `docs/TECNICO.md` §6.

### 2026-11-04 — API de la app y su seguridad (B9, S1)

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** la API de la app (`PLAN_BACKEND.md` §7) con los controles de S1 y los casos de pentest
  automatizados.
- **Qué devolvió:**
  - contrato compartido en `packages/contracts`;
  - búsqueda en workers (adelanta parte de B8);
  - API con Fastify, helmet y rate limit;
  - proxy del torneo sin token;
  - `docs/SEGURIDAD.md`.
- **Qué estaba mal (dos bugs del worker, encontrados al correr todo junto):**
  1. **El reloj de "worker trabado" contaba también el arranque del worker.** Con la máquina cargada,
     uno recién creado se confundía con uno trabado y se descartaba una búsqueda buena. Ahora el worker
     avisa cuando terminó de cargar, el reloj arranca recién al enviarle el trabajo, y el del torneo se
     precalienta al iniciar.
  2. **El aviso de "terminé" de un worker descartado llegaba tarde** y tumbaba el trabajo que ya corría
     en el worker nuevo. La prueba aislada pasaba; falló solo en la suite completa. Ahora los avisos de
     un worker descartado se ignoran.
- **Lo que no se dio por hecho:**
  - `@fastify/static` publicó dos versiones el mismo día. Por precaución se fijó la anterior, pero
    `npm audit` mostró que tenía una vulnerabilidad publicada en `glob` y que las de hoy eran la
    corrección. Se usó la corregida: la decisión la tomó el dato, no la intuición.
  - Un path traversal respondía 403; se cambió a 404 para no revelar nada.
  - El límite por IP rechaza ráfagas simultáneas enteras; se documentó como comportamiento seguro.
- **Cómo lo verificamos:**
  - casos 1–7 y 10 del pentest automatizados;
  - SSRF probado con un `fetch` espía: ninguna petición sale con un `game_id` malicioso y ninguna lleva
    `Authorization`;
  - la suite completa 3 veces seguidas en verde;
  - prueba integral con procesos reales: torneo y app al mismo tiempo, 4 de 4 partidas ganadas y el
    bot dentro de su presupuesto.

### 2026-11-04 — App web jugable (F1–F4)

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** la app web de `PLAN_FRONTEND.md` hasta tenerla jugable contra la API real.
- **Qué devolvió:**
  - React + Vite + Tailwind con el tema del proyecto;
  - la máquina de estados de §6 como reductor puro;
  - tablero accesible, cliente con contrato compartido y cliente falso para las pruebas.
- **Desviación:** no hubo propuestas de v0 ni votación, porque v0 no estaba conectado. El diseño se
  hizo directamente con los criterios de §8 y queda anotado en `docs/TECNICO.md` § Desviaciones.
- **Qué estaba mal:**
  1. **El guardia de `console.error` no hacía fallar la prueba culpable.** Lanzaba el error dentro de
     React; la corrida fallaba, pero la prueba figuraba como "pasada". Se comprobó con una prueba
     trampa (una lista sin `key`) y se cambió para que falle la prueba exacta.
  2. **Detalles vistos en el navegador, no en las pruebas:**
     - el indicador mostraba el color de la persona cuando ganaba el bot;
     - el historial no bajaba hasta la última jugada;
     - decía "1 jugadas".
- **Falsa alarma:** una captura mostró una ficha "flotando". Era la animación de caída a mitad de
  camino; un instante después estaba en su lugar. Se confirmó leyendo el tablero en la página, no solo
  mirando la imagen.
- **Cómo lo verificamos:**
  - 44 pruebas de la web, entre ellas partidas completas empezando cada lado;
  - la tabla de §6 con 100 % de cobertura obligatoria;
  - partidas a mano en el navegador contra la API real, en escritorio y a 375 px, sin errores en
    consola.

### 2026-11-04 — Pruebas E2E con Playwright y evidencias por corrida (Q3)

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:**
  - E2E con Playwright en dos modos: automático, y con pausas para poder verlo;
  - capturas de cada paso;
  - cada corrida en su propia carpeta de evidencias, identificada por día, hora y modo.
- **Qué devolvió:**
  - 9 pruebas × 2 dispositivos (escritorio 1280 × 800 y celular Pixel 7): partidas completas, ganar,
    empate, columna llena, bot pensando, sin conexión con "Reintentar", teclado y axe;
  - `evidencias/e2e/<día>/<hora>_<modo>/` con capturas numeradas, `resumen.md`, reporte HTML y
    videos;
  - un `INDICE.md` con todas las corridas.
- **Qué estaba mal (primera corrida: 12 de 18):**
  - **6 fallas, todas de la prueba y no de la app.** Playwright no hace clic en botones con
    `aria-disabled="true"` (las columnas que no se pueden jugar), mientras que una persona sí, y para
    eso existe el aviso. Esos clics ahora van con `force`, con un comentario que explica por qué.
  - **El guardia de consola rechazaba el error que el propio Chrome registra cuando la prueba corta la
    red a propósito.** Ahora cada prueba puede declarar los errores esperados
    (`consola.permitir`); los demás siguen haciendo fallar la prueba.
  - **ESLint revisaba el JavaScript del reporte HTML** guardado en `evidencias/`; se excluyó la
    carpeta.
- **Cómo lo verificamos:**
  - automático: 18 de 18 en 20 s;
  - con pausas: 9 de 9 en 1.1 min, con el navegador visible y video de cada prueba;
  - axe sin violaciones serias ni críticas en las tres pantallas;
  - las capturas se revisaron una por una.
- **Decisión:**
  - `evidencias/` no va al repo (15–25 MB por corrida); en el CI queda como artefacto;
  - los límites de la API se pueden subir por variable de entorno solo para las E2E, sin cambiar sus
    valores por defecto.

### 2026-11-04 — Diseño con el migo Design System (F6)

- **Quién / herramienta:** Luis Godoy / Claude Code, con el MCP de Figma.
- **Pedido:** tomar componentes y reglas de diseño del migo Design System (Figma).
- **Qué devolvió:**
  - lectura **sin cambios** de las variables del archivo: tema migo-light, estilos de texto y medidas
    del Primary y Secondary button;
  - el tema de Tailwind reescrito con esos tokens, cada uno con el nombre de su variable;
  - Outfit autoalojada (OFL), compatible con la CSP;
  - botón, tarjetas, opciones tipo radio y avisos con los estilos del sistema.

  `diseño.css` (una exportación de Figma de 213 mil líneas) no se usó: los valores salieron de las
  variables del archivo.
- **Qué estaba mal (lo encontró axe en las E2E, no la revisión visual):**
  1. **El azul de acción del sistema no llega a AA.** `#0076FF` con blanco da 4.17:1, por debajo del
     4.5:1 que pide el texto normal. Se resolvió con texto de botón de 20 px en negrita (texto grande
     según WCAG) en lugar de cambiar el color de marca. Es un dato útil para el equipo del Design
     System.
  2. **El texto secundario `#667799` sobre el canvas `#F2F6FC` da 4.15:1.** La opción seleccionada
     ahora usa fondo blanco con borde doble.
  3. **Fallo intermitente de axe en "partida en curso".** Se confirmó repitiendo la prueba 18 veces:
     axe medía el botón "Deshacer" a mitad de su transición de color. Las transiciones ahora respetan
     `prefers-reduced-motion`; después pasó 24 de 24.
- **Cómo lo verificamos:**
  - E2E 18 de 18 con axe (WCAG 2.1 AA), sin violaciones serias ni críticas;
  - 385 pruebas unitarias;
  - capturas revisadas en escritorio y en celular.
- **Decisión:** se toman tokens y patrones, no material de marca (logos ni ilustraciones), porque el repo
  es público.

### 2026-11-04 — Logo Sleipnir y prueba de tiempo robusta

- **Quién / herramienta:** Luis Godoy / Claude Code, con el MCP de Figma.
- **Pedido:** agregar el logo del equipo desde el archivo de Figma "Sleipnir — Logo (Equipo 6)".
- **Qué devolvió:**
  - se exportaron como SVG, **sin modificar el archivo**, el ícono por defecto (encabezado) y la
    versión favicon;
  - el encabezado arma el lockup del archivo: ícono, "sleipnir" y la bajada "Equipo 6 · Cuatro en
    línea 8×7". En celular la bajada se acorta a "Equipo 6".
- **Qué no se dio por hecho:**
  - los SVG se descargaron a una carpeta aislada y se revisaron antes de usarlos: solo vectores, sin
    scripts, imágenes ni referencias externas;
  - la exportación incluía el fondo gris del lienzo de Figma (`#E5E5E5`), que habría dejado las
    esquinas del ícono en gris. Se quitó.
- **Prueba inestable encontrada en el camino:** `search.time.test.ts` falló una vez por 1 ms (126 ms
  contra 125), justo después de correr las E2E con la máquina cargada; en 3 corridas siguientes pasó.
  Mide tiempo real, así que una pausa del sistema operativo la puede empujar.
  - Ahora exige el 95 % de las búsquedas dentro de hard + 25 ms (lo que controla el motor) y el peor
    caso dentro de hard + 60 ms.
  - Ese peor caso sigue muy por debajo del temporizador de seguridad (hard + 100 ms) y del plazo del
    árbitro.
- **Cómo lo verificamos:** E2E 18 de 18 con axe, 385 pruebas unitarias y capturas en escritorio y en
  celular.

### 2026-11-04 — README con stack, inventario, diagramas y contactos

- **Quién / herramienta:** Luis Godoy / Claude Code.
- **Pedido:** completar el README con una guía de documentación del equipo: stack, inventario del
  backend y del frontend, E2E con capturas y contactos, con diagramas en SVG propio (sin Mermaid).
- **Qué devolvió:**
  - stack y tablas de endpoints, errores, servicios externos, mock, componentes, hooks, rutas, estado y
    dependencias, cada uno con enlace al archivo y la línea;
  - cuatro diagramas SVG en `docs/assets/diagramas/`: arquitectura, turno del torneo, jugada en la app y
    máquina de estados de la web;
  - cuatro capturas de la corrida E2E de las 22:26 (18 de 18) en `docs/assets/capturas/`.
- **Qué no se dio por hecho:**
  - cada ruta, versión, variable y límite se sacó del código o de `node_modules`, no del plan;
  - al revisarlo apareció un error del README anterior: decía que `LOG_DIR` guarda logs por jugada, pero
    ninguna parte del código la usa todavía (es el paso B8). Se corrigió.
  - los diagramas se renderizaron con Playwright y se revisaron antes de subirlos; llevan fondo propio
    para leerse en el tema claro y en el oscuro de GitHub.
- **Cómo lo verificamos:** enlaces y anclas del README revisados con un script (54 enlaces, 0 rotos),
  SVG válidos como XML, lint, tipos y pruebas en verde.

### 2026-11-04 — App web jugable en Vercel

- **Quién / herramienta:** Alberto Mendez / Claude Code.
- **Pedido:** desplegar la app web en Vercel y que se pueda jugar, no solo ver.
- **Qué devolvió:**
  - la observación de que la web sola no juega (pide todo a `/api/game/*`, invariante 4) y que Vercel no
    levanta el servidor de `npm run bot`;
  - una función de Vercel que reutiliza `buildAppServer` con el mismo motor y contratos, sus pruebas y
    un build con la Build Output API que empaqueta la función con `rolldown` (ya venía con Vite).
- **Qué salió mal y cómo se detectó:** el primer bundle agregaba un `createRequire` propio que rolldown
  ya inyecta; Node rechazó el archivo (`Identifier 'createRequire' has already been declared`). Se vio al
  correr la función empaquetada fuera del repo, sin `node_modules`, y se quitó.
- **Cómo lo verificamos:** pruebas de `apps/bot/src/vercel/handler.test.ts` y la función empaquetada
  corrida sola: `health`, `state`, `bot-move` en los tres niveles (Difícil tarda ~1.8 s y bloquea la línea
  de tres), jugada ilegal → 400, torneo sin `ARBITRO_URL` → 503 y CSP en cada respuesta.

### 2026-11-05 — Panel "Mi equipo": conexión al árbitro desde la web

- **Quién / herramienta:** Alberto Mendez / Claude Code.
- **Pedido:** un formulario en la web para configurar la URL del árbitro, el team ID y el token, y usarlo
  para ver la posición, crear prácticas y registrar la entrega.
- **Decisiones:**
  - el navegador habla directo con el árbitro: el token no pasa por nuestra API (invariante 11) y nuestra
    API no se vuelve un proxy hacia cualquier URL;
  - el token vive solo en `sessionStorage`; URL y team ID en `localStorage`;
  - la CSP abre `connect-src` a `https:` y al árbitro simulado local; queda anotado como desviación.
- **Qué salió mal y cómo se detectó:** la primera versión del hook llamaba a `setState` dentro del efecto
  (`react-hooks/set-state-in-effect`), usaba una propiedad de parámetro en una clase (no permitida con
  `erasableSyntaxOnly`) y la prueba tomaba métodos sueltos (`unbound-method`). Los detectaron el lint y
  `tsc`, y se corrigieron antes del commit.
- **Cómo lo verificamos:** 17 pruebas nuevas (configuración, cliente y pantalla con un árbitro falso) y una
  corrida real con Playwright y Chrome contra el árbitro de prueba en Vercel: muestra posición y turnos,
  crea la práctica, lista las partidas, 0 errores de consola y el token solo en `sessionStorage`.

### 2026-11-05 — Iniciar y detener la escucha del bot desde la web

- **Quién / herramienta:** Alberto Mendez / Claude Code.
- **Pedido:** dejar el bot del torneo solo en la laptop, pero iniciarlo y detenerlo desde la web en vez
  de con `ARBITRO_ENABLED=true` al arrancar. Se descartó correrlo en Vercel con un cron (rama
  `feature/bot-en-vercel`, sin integrar).
- **Qué devolvió:** un `TournamentController` que corre un solo ciclo a la vez; rutas `/api/control`
  (estado, iniciar y detener) protegidas por loopback y mismo origen; y la tarjeta "Bot del torneo" en
  "Mi equipo", que usa la URL y el token del formulario.
- **Qué salió mal y cómo se detectó:** en la prueba con navegador la tarjeta decía "Conectándose…"
  hasta 20 s después de iniciar, porque el estado `starting` dura hasta que responde el primer long
  polling. Para la persona el bot ya está escuchando; ahora lo dice así.
- **Cómo lo verificamos:** pruebas del controlador, de las rutas (403 desde otra IP o desde otro origen,
  409 si ya escucha, 404 sin controlador) y de la tarjeta; y una corrida real con Chrome: iniciar desde la
  web, práctica `g_p_07` ganada a casa-basico en 9 jugadas, detener desde la web, 0 errores de consola.

### 2026-11-05 — Tablero en vivo de las partidas del equipo

- **Quién / herramienta:** Alberto Mendez / Claude Code.
- **Pedido:** ver el tablero de la partida que juega el bot desde "Mi equipo".
- **Qué devolvió:** `GameViewer`, que pide la partida al árbitro cada 1.5 s y la dibuja con el mismo
  `Board` de la app en modo solo lectura; la partida en curso se abre sola y las demás con un clic.
- **Qué se corrigió al probar:** la lista y los turnos pendientes no se actualizaban al terminar la
  partida, y una partida abierta automáticamente habría desaparecido justo al terminar (ya no estaba
  "en curso"). Ahora el visor avisa al panel, que se refresca y deja el tablero abierto con el resultado.
- **Cómo lo verificamos:** pruebas del visor con un árbitro falso (se abre solo, se abre con clic, se
  cierra, se queda al terminar y refresca la lista) y una corrida real con Chrome contra el árbitro de
  prueba: tablero en vivo a mitad de partida, victoria a casa-basico en 7 jugadas, 0 errores de consola.
