# AGENTS.md — Reglas para agentes de IA en este repositorio

Aplica a cualquier herramienta (Claude Code, Codex, Cursor, Kilo, Antigravity…). `CLAUDE.md` importa
este archivo.

## Contexto

Bot de Cuatro en línea **8 columnas × 7 filas** que compite contra un árbitro HTTP (long polling) y una
app web para jugar contra él. Challenge de IA del 5 de noviembre de 2026, Equipo 6.

Antes de proponer cambios, lee el paso correspondiente en `PLAN_BACKEND.md` o `PLAN_FRONTEND.md`. Cada
tarea debe citar su paso (p. ej. "B5") y cumplir su criterio de listo.

## Estructura

```
packages/engine/      reglas + búsqueda (puro)        apps/bot/          cliente del árbitro + API de la app
packages/contracts/   tipos compartidos web ↔ API     apps/web/          React + Vite
tools/mock-arbiter/   árbitro simulado                tools/arena/       mini-liga motor contra motor
spec/                 OpenAPI del árbitro             docs/              TECNICO, MANUAL, BITACORA_IA
```

## Comandos

Los que todavía no existen se agregan en su paso del plan; el README lista los disponibles.

| Comando | Qué hace |
|---|---|
| `npm ci` | instala dependencias |
| `npm test` | **todas** las pruebas del código + reporte de cobertura (el comando único que piden las bases) |
| `npm run test:e2e` | pruebas de navegador con Playwright + axe |
| `npm run verify` | todo junto: lint, typecheck, pruebas, E2E, auditoría de dependencias y secretos |
| `npm run lint` · `npm run typecheck` | calidad estática |
| `npm run dev` | backend + frontend en modo desarrollo |
| `npm run mock` | árbitro simulado local |
| `npm run build` · `npm start` | build y ejecución de producción (lo que corre en el torneo) |
| `npm run arena` | partidas motor contra motor |

## Invariantes (no se negocian)

1. `packages/engine` es **puro**: sin red, sin `fs`, sin `process.env`, sin temporizadores globales. El
   reloj y el azar se inyectan (para poder probar con profundidad fija y semilla).
2. Todo JSON del árbitro se interpreta **solo** en `apps/bot/src/arbiter/schema.ts`.
3. **Nunca** se envía al árbitro una columna que no esté en `legal_moves`.
4. El frontend **no** implementa reglas del juego: las pide a la API.
5. Coordenadas: `board[fila][columna]`, fila 0 **abajo**; columnas 0–7 en todo el código y 1–8 solo en
   lo que ve la persona (conversión únicamente en `apps/web/src/ui/coords.ts`).
6. El tiempo de búsqueda se mide desde que se **recibe** el turno, nunca contra `served_at`.
7. Un solo ciclo contra el árbitro por token: cualquier instancia extra corre con `ARBITRO_ENABLED=false`.
8. Ningún ciclo contra el árbitro sin pausa ante errores (juego limpio).
9. Nada de `eval`, `new Function` ni `dangerouslySetInnerHTML`. Los datos del árbitro (p. ej. nombres de
   equipos) son texto no confiable.
10. Todo endpoint tiene esquema estricto de entrada y salida y límites (tamaño de cuerpo, rate limit).
11. Las llamadas al árbitro no siguen redirecciones; el proxy del torneo nunca envía el token.
12. El servidor escucha en `127.0.0.1` por defecto; `HOST=0.0.0.0` solo en la máquina de demo.

Detalle de QA y seguridad: `PLAN_CALIDAD_SEGURIDAD.md`.

## Convenciones

- TypeScript estricto; sin `any` (usar `unknown` y validar).
- Módulos pequeños con una responsabilidad; archivos de ~200 líneas como máximo.
- Frontend: estilos solo con clases de Tailwind y el tema del proyecto; ningún color ni espacio suelto.
  Componentes base de shadcn/ui antes que crear uno nuevo.
- Identificadores en inglés; documentación, mensajes de UI y commits en español.
- Commits con Conventional Commits: `feat(engine): detecta victoria en diagonal ↘`. Un cambio lógico por
  commit, con sus pruebas en el mismo commit.
- Trabajo en ramas por paso del plan (`feat/B5-bitboard`) y PR a `main`; `main` está protegida.
- Dependencia nueva = justificación en el mensaje del commit.

## Qué no tocar

- `PLAN_BACKEND.md` y `PLAN_FRONTEND.md`: no se reescriben. Solo se completan datos pendientes
  (responsables, respuestas de organizadores). Los cambios de rumbo van a `docs/TECNICO.md` § Desviaciones.
- `.env`, el token y cualquier header `Authorization`: nunca en el repo ni en logs.
- Umbrales de cobertura y pruebas existentes: no se debilitan para que algo pase. Si una prueba está
  mal, se explica por qué en el commit.
- `spec/arbitro-openapi.json`: solo se reemplaza por la versión oficial de los organizadores.

## Antes de dar una tarea por terminada

1. `npm run lint && npm run typecheck && npm test` en verde (`npm run verify` si tocaste la web o la API).
2. Si cambió un comportamiento visible, actualizar `README.md`, `docs/TECNICO.md` o `docs/MANUAL.md`.
3. Si la IA produjo algo incorrecto o se tomó una decisión relevante, agregar una entrada en
   `docs/BITACORA_IA.md`.
4. Explicar el cambio con palabras propias: si nadie del equipo puede explicarlo, no se integra.
