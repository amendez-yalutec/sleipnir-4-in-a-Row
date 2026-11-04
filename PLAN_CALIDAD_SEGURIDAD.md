# Plan de calidad, seguridad y entrega

**Equipo 6** · Challenge Cuatro en línea 8×7 · v1 — 3 de noviembre de 2026

> Complementa `PLAN_BACKEND.md` y `PLAN_FRONTEND.md` (mismos roles R1–R4 e hitos H0–H4). Escrito
> **antes del código**; las desviaciones van a `docs/TECNICO.md` § Desviaciones.

---

## 0. Decisiones en una tabla

| Tema | Decisión | Por qué |
|---|---|---|
| Plataforma git | **GitHub** | CI, CodeQL, Dependabot y escaneo de secretos gratis en repos públicos; revisión de PR; integración con Claude Code |
| Flujo | rama por paso del plan → PR → `main` protegida, merge con rebase | historial lineal que conserva cada commit: se ve que las pruebas llegaron antes que el código |
| "Producción" | máquina A corre el bot del torneo; máquina B la demo | las bases piden que el bot corra en una computadora del equipo; no hace falta servidor público |
| QA | pirámide de pruebas con Playwright para E2E + puertas automáticas en CI + revisión humana y de IA | la rúbrica premia "pruebas que documentan el comportamiento", no solo que el código no explote |
| Revisión continua | SonarQube Cloud (calidad) y GitGuardian (secretos) | tablero visible y revisión en cada PR; gratis para repos públicos; se parece a la revisión automática que hará el jurado |
| Seguridad | OWASP API Security Top 10 (2023) como referencia, escaneos automáticos (secretos, dependencias, SAST, DAST) y pentest interno con casos de abuso | proporcional al riesgo real: un token secreto, un bot que no puede caerse y una API expuesta en la red |

---

## 1. Git y flujo de trabajo

### 1.1 Por qué GitHub y no Bitbucket

| | GitHub (repo público) | Bitbucket (plan gratuito) |
|---|---|---|
| CI | GitHub Actions sin límite de minutos en repos públicos | Pipelines con minutos mensuales limitados |
| Seguridad incluida | CodeQL, Dependabot, escaneo de secretos con bloqueo de push | requiere herramientas externas |
| Revisión con IA | integración directa con Claude Code (el jurado mencionó Claude Code Review) | menor |
| Cuentas del equipo | Luis ya la tiene configurada; los demás, a confirmar | a confirmar |

### 1.2 Creación del repositorio (paso G1)

1. **Primer commit local** (Luis, 3 de noviembre): planes + `AGENTS.md` + `README.md` + `.gitignore` +
   bitácora, en `main`. Git no necesita GitHub para empezar, y las fechas de los commits se conservan al
   subirlos: el historial muestra el plan primero.
2. Un integrante (dueño del repo, con permisos de administrador) lo crea en GitHub **vacío**: sin
   README, `.gitignore` ni licencia generados por GitHub.
3. Agrega a los otros tres como colaboradores con permiso de escritura. **Todos con 2FA activado.**
4. Luis agrega el remoto y sube `main` y las ramas de trabajo que existan.
5. **Después** de ese push se activa la protección de `main` (ruleset):
   - PR obligatorio con 1 aprobación de alguien distinto al autor;
   - CI en verde obligatorio;
   - historial lineal; sin force push ni borrado (protege la evidencia de "plan antes que código").
6. Se activan: escaneo de secretos con *push protection*, alertas de Dependabot, CodeQL (configuración
   por defecto) y permisos de Actions en solo lectura. Se conectan **SonarQube Cloud** (análisis desde
   CI, con `SONAR_TOKEN` como secreto del repo) y la app de **GitGuardian**. Los checks obligatorios del
   ruleset se eligen después de que el CI corra una vez.
7. Una issue por paso del plan (B0–B12, F0–F8, G1, Q1–Q6, S1–S4) en un tablero de GitHub Projects.
   Cada PR la cierra con `Closes #N`.

> **Público desde el inicio.** En cuentas gratuitas, GitHub no permite proteger ramas ni usar CodeQL o el
> escaneo de secretos en repos **privados**, y SonarQube Cloud es gratis solo para proyectos públicos. Si
> los organizadores piden privado hasta el jueves (pregunta 6 de `PLAN_BACKEND.md` §14), esas
> protecciones se activan recién al hacerlo público.

### 1.3 Día a día

- Rama por paso: `feat/B5-bitboard`, `fix/B4-reintento-409`, `docs/manual`.
- Commits con Conventional Commits en español: `feat(engine): detecta victoria en diagonal ↘`.
- PR pequeño con la plantilla de §3.3. Merge con **rebase**: historial lineal que conserva cada commit,
  así se ve que las pruebas llegaron antes que el código (un squash lo borraría).
- Antes de pedir revisión humana, el autor corre `/code-review` de Claude Code y atiende lo que aplique.
  Si la IA marcó algo incorrecto, va a la bitácora.
- Congelamiento: tag `v1.0.0` en el commit que se registra en el árbitro. Después de las 9:45 nadie
  hace push a `main`.

---

## 2. Entornos: dónde corre cada cosa

| Entorno | Dónde | Cómo se levanta | Árbitro | Token |
|---|---|---|---|---|
| Desarrollo | laptop de cada integrante | `npm run dev` + `npm run mock` | simulado | no |
| CI | GitHub Actions | automático en cada PR y push a `main` | simulado | **no, nunca** |
| **Torneo** ("producción") | máquina A | `npm run build && npm run bot:forever`, `HOST=127.0.0.1` | real | **solo aquí** |
| Demo | máquina B | `npm run build && npm start`, `ARBITRO_ENABLED=false`, `HOST=0.0.0.0` | ninguno | no |
| Demo pública (opcional) | túnel desde la máquina B | `cloudflared tunnel --url http://localhost:8080` | ninguno | no |

- **Máquina A no expone nada a la red** (`HOST=127.0.0.1`): nadie en el Wi-Fi del evento puede pedirle
  partidas a su API ni quitarle CPU al bot que juega la liga.
- **Máquina B no tiene token.** Si la comprometen, no hay nada que robar.
- **Demo pública:** un túnel de Cloudflare da una URL HTTPS temporal sin cuenta ni costo. Resuelve el
  riesgo de que el Wi-Fi del evento aísle los celulares, y permite que el jurado juegue desde su
  teléfono. **Regla:** la app no se expone fuera de `localhost` hasta que S1 esté en verde.
- Un contenedor (Dockerfile multi-etapa, usuario no root) para desplegar en un PaaS queda como P2: no lo
  piden las bases y la demo ya está cubierta.

---

## 3. QA

### 3.1 Estrategia: qué se prueba, con qué y cuándo

| Nivel | Herramienta | Qué cubre | Corre en |
|---|---|---|---|
| Estático | TypeScript estricto, ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier | tipos, errores comunes, accesibilidad en JSX, formato | pre-commit + CI |
| Calidad continua | SonarQube Cloud | bugs, code smells, duplicación, cobertura del código nuevo, *security hotspots* | cada PR |
| Unitarias | Vitest | reglas, búsqueda, heurística, reducer del frontend | `npm test` |
| Propiedades | fast-check | miles de partidas al azar: bitboard = reglas, nunca ilegal, alfa-beta = minimax | `npm test` |
| Contrato | ajv + `spec/arbitro-openapi.json` | el árbitro simulado responde lo mismo que el real | `npm test` |
| Integración | Vitest + mock + `app.inject()` | cliente contra el mock; API de la app sin abrir puertos | `npm test` |
| Componentes | Testing Library + jsdom | tablero, estados, mensajes | `npm test` |
| E2E | Playwright | partida completa en Chrome de escritorio y en un celular emulado; falla si hay errores en consola | `npm run test:e2e` + CI |
| Accesibilidad | @axe-core/playwright, Lighthouse | violaciones serias = 0; Lighthouse ≥ 90 | CI + manual |
| Resiliencia | mock con inyección de fallas | 5xx, cortes, latencia, `kill -9` | `npm test` + manual |
| Carga | autocannon | la API de la app bajo ráfagas no afecta los tiempos del torneo | manual (Q4) |
| Rendimiento del motor | `npm run bench` | nodos/s y profundidad alcanzada | manual, resultado en TECNICO |
| Calidad de las pruebas (P2) | Stryker (pruebas de mutación) | que las pruebas de reglas detecten errores introducidos a propósito | manual |

**`npm test` es el comando único que piden las bases:** corre todas las pruebas del código y reporta
cobertura. Lo que necesita navegador o red va aparte, y `npm run verify` lo corre todo junto: lint,
typecheck, pruebas, E2E, auditoría de dependencias y revisión de secretos.

### 3.2 Puertas automáticas en CI

| Job | Bloquea el merge si… |
|---|---|
| `lint` + `typecheck` | hay cualquier error |
| `test` | falla una prueba o la cobertura de `packages/engine` baja de 90 % |
| `e2e` | falla el flujo de juego, hay errores en consola o violaciones serias de accesibilidad |
| `sonar` | falla el quality gate en el código nuevo: bugs o vulnerabilidades nuevas, cobertura < 80 %, duplicación > 3 % o *security hotspots* sin revisar |
| GitGuardian | detecta un secreto en el push o en el PR |
| `deps` | `npm audit --omit=dev --audit-level=high` reporta algo alto o crítico |
| `codeql` | alerta alta o crítica sin revisar |
| `zap` (push a `main` y manual) | alerta *High* de ZAP; las *Medium* se documentan en `docs/SEGURIDAD.md` |

Los workflows usan `permissions: contents: read` y acciones de terceros fijadas por versión. CI no tiene
ni necesita el token del árbitro; su único secreto es `SONAR_TOKEN`.

### 3.3 Proceso

- **Definición de listo de un PR** (plantilla del PR):
  - [ ] cumple el criterio de listo del paso del plan que cita;
  - [ ] pruebas nuevas o actualizadas en el mismo PR;
  - [ ] CI en verde;
  - [ ] `/code-review` de Claude Code corrido y atendido;
  - [ ] documentación actualizada si cambió algo visible;
  - [ ] bitácora actualizada si la IA se equivocó o cambió una decisión.
- **Pruebas primero donde la verdad viene de las bases:** las reglas (R3) y la tabla de estados del
  frontend (R4) se escriben como pruebas antes de pedirle el código a la IA.
- **Cada bug corregido deja una prueba** que lo reproduce.
- **Sesión exploratoria** (miércoles, 30 min, dos personas): intentar romper la app con objetivos
  concretos (clics rápidos, deshacer en mal momento, red cortada, celular en horizontal).
- **Prueba de pasillo:** una persona que no programa juega sin ayuda y luego con el manual.
- **Go / no-go el jueves a las 9:30:** CI en verde en el commit candidato, bot jugando en la máquina A,
  0 derrotas por tiempo en las prácticas, demo probada en la máquina B, documentación completa.

### 3.4 Métricas que se publican en `docs/TECNICO.md`

Número de pruebas y cobertura por paquete · nodos/s y profundidad típica · tiempo por jugada p50/p99
(local y según el árbitro) · resultados de la arena · resultados de ZAP y del pentest interno ·
(P2) puntaje de mutación.

---

## 4. Seguridad

### 4.1 Alcance, con honestidad

Un pentest formal hecho por terceros no es proporcional ni posible en día y medio. Lo que sí hacemos, y
documentamos:

1. Modelo de amenazas del sistema real (§4.2).
2. Controles mapeados a **OWASP API Security Top 10 (2023)**, más los puntos aplicables del OWASP Top 10
   web (§4.3).
3. Escaneos automáticos en CI: secretos, dependencias, análisis estático (SAST) y dinámico (DAST) (§4.4).
4. **Pentest interno** de una hora con casos de abuso y resultado esperado (§4.5).
5. Informe en `docs/SEGURIDAD.md`: hallazgos, severidad, corrección y la prueba que lo cubre.

### 4.2 Qué protegemos y de qué

| Activo | Amenaza | Impacto |
|---|---|---|
| Token del equipo | se filtra en el repo, en un log, en el bundle del frontend, en una captura del manual o **en la pantalla durante la exposición** | alguien juega por nosotros; hay que pedir otro |
| Disponibilidad del bot durante la liga | caída, CPU saturada por la API de la app, laptop en reposo | derrotas por tiempo o ausencia (25 puntos en juego) |
| API de la app (expuesta en la red o por túnel) | entradas maliciosas, ráfagas que consumen CPU, proxy usado para llegar a otros hosts | demo caída, abuso del servidor |
| Frontend | XSS a través de datos externos (los nombres de los equipos rivales vienen del árbitro y los elige cada equipo) | código ejecutado en el navegador del jurado |
| Cadena de dependencias | paquete npm vulnerable o malicioso | ejecución de código en nuestras máquinas |
| Historial del repo | force push o reescritura | se pierde la evidencia de "plan antes que código" |

### 4.3 Controles (OWASP API Security Top 10, 2023)

| Riesgo OWASP | Aplica porque… | Control |
|---|---|---|
| API1 / API5 — autorización por objeto y por función | la API de la app no tiene usuarios ni funciones de administración | sin estado y sin datos por usuario; acciones sensibles (registrar la entrega) **solo por CLI**, nunca como endpoint |
| API2 — autenticación | el token del árbitro es la única credencial | solo en `.env` de la máquina A; logs con `redact` del header `Authorization`; nunca en CI ni en el navegador |
| API3 — propiedades expuestas de más | las respuestas podrían filtrar datos internos | esquema de respuesta en Fastify: los campos no declarados no salen |
| **API4 — consumo de recursos sin límite** | cada `bot-move` cuesta hasta 1.4 s de CPU | cuerpo ≤ 4 KB; `moves` ≤ 56 enteros de 0 a 7; rate limit por IP; **una** búsqueda a la vez en el worker de la app con cola máxima de 3 (si no, 429 "el bot está ocupado"); presupuesto máximo por nivel |
| **API7 — SSRF** | el proxy de partidas del torneo hace peticiones hacia afuera | `game_id` validado con `^[A-Za-z0-9_-]{1,64}$`; host fijo (`ARBITRO_URL`); sin redirecciones; el proxy llama a endpoints públicos **sin token**, así que no hay credencial que robar |
| API8 — configuración insegura | headers por defecto, errores verbosos | `@fastify/helmet` (CSP estricta `default-src 'self'`, `frame-ancestors 'none'`, `nosniff`); CORS desactivado (todo es mismo origen); errores sin stack trace; `HOST` según máquina (§2) |
| API9 — inventario | endpoints olvidados o de depuración | OpenAPI de nuestra API generado desde el código; ningún endpoint de depuración en el build |
| **API10 — consumo inseguro de APIs** | consumimos el árbitro | respuestas validadas con zod; tamaño máximo y timeouts; **un 3xx del árbitro es error**: el token nunca viaja a otro dominio; nombres de equipos tratados como texto no confiable |
| Top 10 web A03 — XSS | el frontend muestra datos del árbitro | React escapa por defecto; ESLint prohíbe `dangerouslySetInnerHTML` y `eval`; CSP como segunda barrera |
| Top 10 web A06 — componentes vulnerables | dependencias npm | lockfile + `npm ci`; `npm audit` en CI; alertas de Dependabot; cada dependencia nueva justificada |

### 4.4 Herramientas de seguridad

| Tipo | Herramienta | Dónde |
|---|---|---|
| Secretos | GitGuardian (app de GitHub: cada push y PR, con tablero de incidentes) | GitHub |
| Secretos | escaneo de secretos de GitHub con *push protection* (detecta formatos conocidos) | GitHub |
| Secretos | **hook pre-commit propio** que busca en el diff el valor real de `TEAM_TOKEN` leído del `.env` local (el token del árbitro tiene un formato que ningún escáner conoce) | máquina A |
| Dependencias (SCA) | `npm audit`, alertas de Dependabot | CI + GitHub |
| SAST | CodeQL; SonarQube Cloud; reglas de ESLint de seguridad | GitHub + CI |
| DAST | **OWASP ZAP**: escaneo base (pasivo) y escaneo de API usando el OpenAPI de nuestra API, contra la app levantada en CI | CI (no requiere Docker local) |
| Endurecimiento | `@fastify/helmet`, `@fastify/rate-limit`, esquemas estrictos, `pino` con `redact` | código |
| Contenedor (P2) | Trivy | CI |

### 4.5 Pentest interno: casos de abuso

Una hora el miércoles en la noche, dos personas (R3 + R2) sobre la build de producción en modo demo.
Cada hallazgo → issue → corrección → prueba automatizada → fila en `docs/SEGURIDAD.md`.

| # | Ataque | Resultado esperado |
|---|---|---|
| 1 | `column` = 8, −1, 3.5, `"3"`, `null` | 400 `validation`, sin stack trace |
| 2 | `moves` con 57 o 10,000 elementos; cuerpo de 1 MB | 400 / 413 |
| 3 | JSON con `__proto__` o `constructor.prototype` | 400 (protección de Fastify) |
| 4 | JSON malformado; `Content-Type` incorrecto | 400 / 415 sin detalles internos |
| 5 | 50 `bot-move` concurrentes (autocannon) | 429 controlado; el bot del torneo sigue < 1,900 ms p99 |
| 6 | SSRF: `game_id` = `..%2F..%2Fapi%2Fme`, `http://evil`, `@evil.com` | 400; ninguna petición sale a otro host |
| 7 | Path traversal en estáticos: `/../.env`, `/%2e%2e/.env` | 404 |
| 8 | Mock "malicioso": equipo rival llamado `<img src=x onerror=alert(1)>` | se muestra como texto en la repetición |
| 9 | Mock "malicioso": respuestas enormes, tipos incorrectos, `legal_moves` vacío o con columna 9 | el cliente no se cae y jamás envía una columna fuera de 0–7 |
| 10 | Revisión de headers | CSP, `nosniff` y `frame-ancestors` presentes; ZAP sin alertas *High* |
| 11 | Búsqueda del valor del token en historial, `dist/`, logs y capturas del manual | 0 coincidencias |
| 12 | Desde otro dispositivo del Wi-Fi: `curl http://<ip-máquina-A>:8080` | conexión rechazada |

### 4.6 Respuesta a incidentes

| Incidente | Qué hacemos |
|---|---|
| Token filtrado | 1) pedir token nuevo a los organizadores (regla 6 de las bases); 2) actualizar `.env` en la máquina A y reiniciar. **No** se reescribe el historial: el token ya está expuesto y reescribir borraría la evidencia de "plan antes que código"; la solución es revocarlo |
| Bot caído durante la liga | el supervisor lo reinicia; si no vuelve en 10 s, la persona de guardia (R2, que no expone) lo levanta a mano siguiendo el runbook del README |
| Dependencia con vulnerabilidad crítica | evaluar si es explotable en nuestro uso; actualizar, o documentar por qué no aplica |
| Exposición | la pantalla compartida nunca muestra `.env` ni terminales con headers; se ensaya con la máquina B |

---

## 5. Pasos en orden

| # | Paso | Rol | Listo cuando… | Hito |
|---|---|---|---|---|
| G1 | Repo en GitHub (§1.2), colaboradores con 2FA, primer push, protección de `main`, issues por paso | R3 | `main` protegida y tablero con todas las issues | H0 |
| Q1 | CI base (con B1): lint, typecheck, test + cobertura (con `lcov` para Sonar), `npm audit`, análisis de SonarQube Cloud; plantilla de PR. Con el repo en GitHub: GitGuardian, CodeQL y Dependabot activos | R3 | un PR de prueba pasa por todas las puertas | H1 |
| Q2 | Hooks pre-commit: lint-staged + búsqueda del token real | R3 | un commit con el token de mentira es bloqueado | H1 |
| S1 | Endurecimiento de la API (con B9): helmet, rate limit, límites de cuerpo, esquemas estrictos, cola del worker, errores sin stack, guardia SSRF, `HOST` por máquina | R3 + R2 | casos 1–7 de §4.5 automatizados y en verde | H3 |
| Q3 | E2E con Playwright + axe (con F4): partida completa en escritorio y celular emulado | R3 + R4 | job `e2e` en verde en CI | H3 |
| Q4 | Prueba de carga: autocannon contra `bot-move` mientras el bot juega contra el mock | R2 | p99 del torneo < 1,900 ms bajo carga | H4 |
| S2 | ZAP en CI: escaneo base + escaneo de API | R3 | 0 alertas *High*; las *Medium* documentadas | H4 |
| S3 | Pentest interno (§4.5) | R3 + R2 | los 12 casos con resultado anotado; hallazgos corregidos o justificados | H4 |
| Q5 | Sesión exploratoria + prueba de pasillo | R3 + R4 | notas en la bitácora y bugs con prueba | H4 |
| S4 | `docs/SEGURIDAD.md`: amenazas, controles, resultados | R3 | revisado por todo el equipo | jue 9:30 |
| Q6 | Go / no-go (§3.3) y tag `v1.0.0` | todos | entrega registrada con el commit del tag | jue 9:45 |
| P2 | Mutación con Stryker; Dockerfile + Trivy; despliegue en un PaaS | — | solo si todo lo anterior está listo | — |

**Si vamos tarde:** primero se corta P2, luego el escaneo de API de ZAP (queda el escaneo base) y la
prueba de carga. **Nunca se corta:** G1, Q1, Q2, S1, el caso 11 del pentest (secretos) ni el go / no-go.

---

## 6. Qué se delega a la IA y cómo se verifica

| Se delega | Verificación |
|---|---|
| Workflows de CI y configuración de herramientas | un PR de prueba con un error a propósito en cada puerta debe fallar en esa puerta |
| Endurecimiento de la API | los casos de abuso de §4.5 se escriben como pruebas **antes** de pedir el código |
| Revisión de código (`/code-review`) | sus hallazgos se aceptan o rechazan con argumento; los falsos positivos van a la bitácora |
| Redacción de `docs/SEGURIDAD.md` | cada afirmación enlaza a una prueba, un job de CI o un resultado de escaneo |

**No se delega:** decidir qué es un riesgo aceptable, aprobar PRs y el manejo del token.

---

## 7. Riesgos de este plan

| Riesgo | Mitigación |
|---|---|
| Las puertas de CI frenan al equipo el miércoles | jobs rápidos en los PR (lint, test, secretos); ZAP solo en `main` y manual |
| Falsos positivos de los escáneres | se documentan con su justificación; no se desactivan reglas en bloque |
| Alguien sube el token antes de tener los hooks | el token solo existe desde el jueves 8:00 y solo en la máquina A; Q2 está listo en H1 |
| El túnel público expone la app | solo después de S1; se cierra al terminar la demo |
| Un integrante sin 2FA | requisito antes de recibir acceso de escritura |
