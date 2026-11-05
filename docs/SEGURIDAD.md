# Seguridad

Qué protegemos, con qué controles y qué resultado dio cada prueba. El plan completo (modelo de
amenazas, mapeo OWASP y pasos S1–S4) está en `PLAN_CALIDAD_SEGURIDAD.md` §4.

> **Estado:** S1 (endurecimiento de la API) hecho, con los casos 1–7 y 10 del pentest automatizados.
> Pendientes: ZAP en CI (S2), los casos manuales (S3) y la revisión final de este documento (S4).

## 1. Qué protegemos

| Activo | Amenaza principal | Control |
|---|---|---|
| Token del equipo | que se filtre en el repo, un log o la pantalla | solo en `.env` de la máquina A; hook de git que bloquea su valor; el cliente lo guarda en un campo privado; los logs nunca lo reciben (probado) |
| El bot durante la liga | caída, CPU tomada por la app, derrota por tiempo | workers separados para torneo y app; temporizador de seguridad; respaldo; pausas ante errores |
| API de la app | entradas maliciosas, ráfagas, SSRF por el proxy | esquemas estrictos, límites de tamaño y frecuencia, cola acotada, `game_id` validado y host fijo |
| Navegador del jurado | XSS con los nombres de los equipos rivales | CSP estricta; React escapa por defecto; ESLint prohíbe `dangerouslySetInnerHTML` |
| Cadena de dependencias | paquete vulnerable o comprometido | lockfile + `npm ci`, `npm audit` en CI, Dependabot y justificación de cada dependencia |

## 2. Controles de la API (OWASP API Security Top 10, 2023)

| Riesgo | Control implementado | Dónde |
|---|---|---|
| API2 autenticación | la API no tiene credenciales; el proxy del torneo **nunca** envía el token | `arbiter/public-client.ts` |
| API3 datos de más | cada respuesta pasa por un esquema zod **estricto**: un campo no declarado es error | `packages/contracts` |
| API4 consumo de recursos | cuerpo ≤ 4 KB; `moves` ≤ 56 enteros de 0 a 7; 120 peticiones/min por IP y 30 `bot-move`/min; **una** búsqueda a la vez por worker con cola de 3 (si no, 429 `busy`) | `http/app.ts`, `http/security.ts`, `chooser/worker-chooser.ts` |
| API7 SSRF | `game_id` con `^[A-Za-z0-9_-]{1,64}$`; host fijo (`ARBITRO_URL`); sin redirecciones; timeout y tope de tamaño | `arbiter/public-client.ts`, `arbiter/http.ts` |
| API8 configuración | helmet: CSP `default-src 'self'` y `frame-ancestors 'none'`, `nosniff`; sin CORS; solo `application/json`; errores sin stack trace; `HOST=127.0.0.1` por defecto | `http/security.ts`, `config.ts` |
| API10 consumo de APIs | respuestas del árbitro validadas con zod; un 3xx es error; nombres de equipos como texto | `arbiter/schema.ts`, `arbiter/http.ts` |

## 3. Pentest interno (`PLAN_CALIDAD_SEGURIDAD.md` §4.5)

| # | Ataque | Resultado | Prueba |
|---|---|---|---|
| 1 | `column` = 8, −1, 3.5, `"3"`, `null`; nivel desconocido; campos de más | ✅ 400 `validation`, sin stack trace | `http/app.test.ts` |
| 2 | 57 o 10,000 jugadas; cuerpo de 1 MB | ✅ 400 / 413 | `http/app.test.ts` |
| 3 | JSON con `__proto__` o `constructor.prototype` | ✅ 400 (protección de Fastify) | `http/app.test.ts` |
| 4 | JSON malformado; `Content-Type` incorrecto | ✅ 400 / 415 sin detalles internos | `http/app.test.ts` |
| 5 | ráfaga de `bot-move` | ✅ 429 `rate_limited`; una ráfaga simultánea nunca supera el límite; el torneo sigue a tiempo (prueba integral: 606 ms con la app cargada) | `http/app.test.ts`, `docs/TECNICO.md` §6 |
| 6 | SSRF: `game_id` = `..%2F..%2Fapi%2Fme`, `http://evil`, `@evil.com` | ✅ 400; **ninguna** petición sale; las válidas van solo al host configurado y sin `Authorization` | `http/tournament.test.ts` |
| 7 | path traversal: `/../.env`, `/%2e%2e/.env` | ✅ 404, nunca el archivo | `http/app.test.ts` |
| 8 | equipo rival llamado `<img src=x onerror=alert(1)>` | ⏳ la API lo pasa como texto (probado); falta verlo en la web (F7) | `http/tournament.test.ts` |
| 9 | árbitro "malicioso": respuestas enormes, tipos incorrectos, `legal_moves` vacío o con 9 | ✅ el cliente no se cae y jamás envía una columna fuera de 0–7 | `arbiter/*.test.ts` |
| 10 | headers | ✅ CSP, `nosniff`, `frame-ancestors 'none'`, sin CORS ni `x-powered-by`; ZAP pendiente (S2) | `http/app.test.ts` |
| 11 | el valor del token en historial, `dist/`, logs y capturas | ✅ logs (probado en 20 partidas); ⏳ historial y capturas, el jueves | `arbiter/loop.test.ts` |
| 12 | desde otro dispositivo del Wi-Fi: `curl http://<ip-máquina-A>:8080` | ⏳ manual el jueves (la máquina A escucha en `127.0.0.1`) | — |

## 4. Hallazgos y decisiones

| Hallazgo | Severidad | Qué se hizo |
|---|---|---|
| `@fastify/static` ≤ 10.1.8 depende de un `glob` con una vulnerabilidad publicada (GHSA-3g3m-2fjr-6pw4) | moderada | se usa la 10.1.10, que la corrige; `npm audit --omit=dev` en 0 |
| Un intento de path traversal respondía 403 | baja (revelaba que la ruta se reconocía) | se responde 404, igual que cualquier ruta inexistente |
| El límite por IP rechaza **toda** una ráfaga simultánea, no solo lo que excede | informativo | falla del lado seguro; se documenta. Un navegador hace una jugada a la vez |
| 12 vulnerabilidades moderadas en `minimatch`, usada solo por ESLint | moderada, solo desarrollo | no llegan a producción; Dependabot las sigue |
| CSP sin `'unsafe-inline'` en estilos | — | si la web lo necesita (F4), se decide y se documenta aquí |
