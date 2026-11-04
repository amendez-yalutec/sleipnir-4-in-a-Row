# Plan de ejecución — Frontend (app web)

**Equipo 6** · Challenge Cuatro en línea 8×7 · v1 — 3 de noviembre de 2026

> Plan escrito **antes de la primera línea de código**. Las desviaciones se explican en
> `docs/TECNICO.md` § Desviaciones. Roles e hitos (H0–H4) son los de `PLAN_BACKEND.md` §0 y §10;
> el responsable de este plan es **R4**.

---

## 1. Objetivo y criterio de éxito

Una página donde una persona **que no programa** juega contra nuestro bot, entiende en todo momento qué
está pasando y quiere jugar otra vez.

La rúbrica califica: "funciona sin errores, se entiende sin explicación, limpio y consistente, estados
claros (turno, jugada ilegal, fin de partida)". Cada punto tiene una meta medible:

| Criterio | Meta | Cómo se verifica |
|---|---|---|
| Funciona sin errores | 0 errores en consola | una prueba falla si algo llama a `console.error`; revisión manual en Chrome y Safari |
| Se entiende sin explicación | alguien no técnico juega una partida completa sin ayuda | prueba de pasillo con una persona ajena al equipo; se anota dónde dudó |
| Limpio y consistente | todos los colores, espacios y tipografías salen del tema de Tailwind | revisión de PR: ningún color ni espacio fuera del tema |
| Estados claros | turno, bot pensando, columna no permitida, victoria, derrota, empate, error de conexión | cada estado tiene prueba y captura en el manual |
| Puntos extra: celular | jugable a 375 px de ancho | DevTools + un celular real en la misma red |

---

## 2. Alcance por prioridad

**P0 — lo que piden las bases**
- Tablero 8×7 interactivo.
- Indicación clara de a quién le toca y de qué columnas están disponibles.
- Elegir quién abre (persona o bot), reiniciar.
- Resultado: ganador con la línea de cuatro resaltada, o empate.
- Se ve bien en una laptop.

**P1 — diferenciadores de bajo riesgo**
- Niveles de dificultad (Fácil, Medio, Difícil = el bot del torneo).
- Historial de jugadas y deshacer.
- "Cómo pensó el bot": profundidad, posiciones evaluadas, tiempo y una frase ("cree que va ganando").
- Vista previa de la ficha al pasar sobre una columna; teclas 1–8.
- Diseño responsive para celular.
- Indicador del estado del bot en el torneo (conectado, jugando, esperando).
- Cargar una posición desde la URL (`?moves=3,4,3`, columnas 0–7 como la API) para demos, pruebas y el
  manual.

**P2 — si P0 y P1 están listos**
- Repetir partidas del torneo a partir de su registro público en el árbitro.
- Modo oscuro.

**Fuera:** cuentas de usuario, persona contra persona en línea, sonidos.

---

## 3. Stack

- React + Vite + TypeScript estricto. Elegimos React sobre Angular porque la app es chica (Angular trae
  estructura que aquí no aporta) y porque v0 y Lovable, que las bases mencionan, generan React.
- **Tailwind CSS + shadcn/ui** (componentes accesibles basados en Radix: botones, selectores, avisos).
  Sin diseñador en el equipo, es la vía más rápida a algo cuidado y consistente. El tablero se hace a
  medida.
- Diseño inicial generado con **v0** a partir de los bocetos de §4 (ver §8).
- Pruebas: Vitest + Testing Library + jsdom (entran en el mismo `npm test` de la raíz). E2E y
  accesibilidad con Playwright + axe (paso Q3 de `PLAN_CALIDAD_SEGURIDAD.md`).
- Tipos de la API compartidos con el backend desde `packages/contracts`: si cambia un campo, el
  compilador avisa en los dos lados.

---

## 4. Pantallas

### 4.1 Nueva partida

```
┌──────────────────────────────────────────┐
│  Cuatro en línea 8×7          ● Bot en línea │
├──────────────────────────────────────────┤
│   ¿Quién empieza?   [ Yo ]  [ El bot ]      │
│   Dificultad:  ( ) Fácil  (•) Medio  ( ) Difícil │
│                                            │
│                [  Jugar  ]                 │
└──────────────────────────────────────────┘
```

### 4.2 Partida

```
┌───────────────────────────────────────────────────────────┐
│  Cuatro en línea 8×7                         ● Bot en línea  │
├────────────────────────────────────┬──────────────────────┤
│        ◯  (vista previa)            │  🟠 Tu turno          │
│  ┌──┬──┬──┬──┬──┬──┬──┬──┐        │                       │
│  │  │  │  │  │  │  │  │  │  fila 7 │  Cómo pensó el bot     │
│  ├──┼──┼──┼──┼──┼──┼──┼──┤        │  profundidad 14        │
│  │  │  │  │  │  │  │  │  │        │  812,340 posiciones    │
│  │            …           │        │  1.4 s · "va parejo"   │
│  │  │  │  │🟠│⚪│  │  │  │  fila 1 │                       │
│  └──┴──┴──┴──┴──┴──┴──┴──┘        │  Historial            │
│    1  2  3  4  5  6  7  8          │  1. Tú  → columna 4    │
│                                     │  2. Bot → columna 5    │
│                                     │  [Deshacer] [Reiniciar]│
└────────────────────────────────────┴──────────────────────┘
```

En pantallas < 768 px el panel lateral pasa debajo del tablero.

### 4.3 Torneo (P2)

Lista de las partidas que jugó nuestro bot (rival, tipo, resultado) y un reproductor con
⏮ ◀ ▶ ⏭ y el tiempo que tardó cada jugada según el árbitro.

---

## 5. Componentes y módulos

| Componente | Responsabilidad |
|---|---|
| `App` | layout y navegación simple (Partida / Torneo) |
| `Header` | título y `BotStatusBadge` |
| `SetupPanel` | quién abre, dificultad, botón Jugar |
| `Board` | dibuja 7 filas × 8 columnas desde `board` (fila 0 abajo); recibe `legalMoves`, `winningCells`, `onPlay` |
| `ColumnButton` | zona clicable por columna, vista previa, `aria-label` |
| `Disc` | ficha con animación de caída |
| `TurnIndicator` | "Tu turno" / "El bot está pensando…" / resultado |
| `ResultBanner` | ganaste / ganó el bot / empate, y "Jugar otra vez" |
| `MoveHistory` | "1. Tú → columna 4" |
| `BotInsights` | profundidad, posiciones, tiempo y evaluación en palabras |
| `Toast` | avisos (columna llena, espera tu turno, error de conexión) |
| `ReplayView` (P2) | reproductor de partidas del torneo |

| Módulo sin UI | Responsabilidad |
|---|---|
| `game/reducer.ts` | máquina de estados de la partida; pura y probada al 100 % |
| `api/client.ts` | llamadas a la API con timeout de 10 s y errores traducidos al español |
| `api/fake-client.ts` | misma interfaz, usa las reglas reales de `packages/engine` y un bot al azar; permite avanzar antes de que exista la API (hasta H3) |
| `ui/coords.ts` | **único** lugar que convierte columna 0–7 (API) ↔ 1–8 (lo que ve la persona) y fila 0 abajo ↔ fila de arriba en pantalla |

---

## 6. Estados de la partida

```
            ┌─ empieza el bot ─▶ botThinking ─┐
  setup ────┤                                 ├─▶ humanTurn ─clic─▶ checking ─▶ botThinking ─▶ humanTurn …
            └─ empiezo yo ─────▶ humanTurn ───┘
  checking / botThinking ──(cuatro en línea o tablero lleno)──▶ finished ──Jugar otra vez──▶ setup
  cualquier llamada fallida ──▶ error ──Reintentar──▶ estado anterior
```

| Estado | Evento | Siguiente | Lo que ve la persona |
|---|---|---|---|
| `setup` | Jugar (empiezo yo) | `humanTurn` | "Tu turno" |
| `setup` | Jugar (empieza el bot) | `botThinking` | "El bot está pensando…" |
| `humanTurn` | clic en columna disponible | `checking` | la columna se resalta mientras el servidor confirma (milisegundos) |
| `humanTurn` | clic en columna llena | `humanTurn` | "Esa columna está llena" (y la columna se ve deshabilitada) |
| `checking` | la API confirma la jugada | `botThinking` o `finished` | su ficha cae |
| `checking` | la API rechaza (`illegal_move`) | `humanTurn` | no cae ninguna ficha y se explica por qué |
| `botThinking` | clic en cualquier columna | `botThinking` | "Espera, es turno del bot" |
| `botThinking` | respuesta del bot | `humanTurn` o `finished` | cae la ficha del bot; se actualiza "Cómo pensó el bot" |
| `humanTurn` | Deshacer | `humanTurn` | se retiran la última jugada del bot y la tuya |
| `finished` | Jugar otra vez | `setup` | — |
| cualquiera | falla de red | `error` | mensaje claro + Reintentar |

**Flujo de una jugada humana** (feedback inmediato sin reglas en el navegador):
1. Clic → `POST /api/game/state { moves: [...moves, columna] }`. El servidor valida y devuelve el tablero
   nuevo en milisegundos, así que la ficha cae casi al instante sin que el navegador implemente reglas.
2. Si la partida sigue → `POST /api/game/bot-move { moves, level }` mientras se muestra "El bot está
   pensando…".

---

## 7. Comunicación con el bot

- **Desarrollo:** Vite en `:5173` con proxy de `/api` al backend en `:8080`; no hay CORS que configurar.
- **Demo:** el backend sirve el build en `http://<ip-de-la-laptop>:8080`, también desde un celular en la
  misma red.
- Endpoints usados (contrato en `PLAN_BACKEND.md` §7): `GET /api/health`, `POST /api/game/state`,
  `POST /api/game/bot-move`, `GET /api/tournament/games`, `GET /api/tournament/games/:id`.
- El navegador **nunca** habla con el árbitro ni ve el token. La repetición de partidas pasa por nuestro
  backend (además, no sabemos si el árbitro permite CORS).
- Formato del tablero idéntico al del árbitro (`board[fila][columna]`, fila 0 abajo); la conversión a
  pantalla vive solo en `ui/coords.ts`.
- Los nombres de equipos que llegan del árbitro los elige cada equipo: se muestran siempre como texto,
  nunca con `dangerouslySetInnerHTML`. La CSP del servidor es la segunda barrera.

---

## 8. Diseño visual

- **Proceso con IA:**
  1. v0 recibe los bocetos de §4, la paleta y los criterios de abajo, y propone 2 o 3 diseños.
  2. El equipo vota uno en 5 minutos; la decisión queda en la bitácora.
  3. Se copian solo los componentes necesarios a `apps/web` y R4 los ajusta.
  4. Se valida con la prueba de pasillo y en un celular.
- **Criterios para elegir:** el turno se entiende de un vistazo; toda acción tiene respuesta inmediata;
  las fichas se distinguen sin depender solo del color; nada distrae del tablero.
- **Tokens** en el tema de Tailwind: colores, escala de espacios (4, 8, 12, 16, 24, 32), radios,
  sombras, tipografía del sistema, duraciones de animación.
- **Paleta** inspirada en las bases del reto: tablero azul marino, ficha de la persona naranja, ficha del
  bot marfil. Se distinguen también por luminosidad, no solo por color (daltonismo).
- **Línea ganadora:** anillo y pulso suave en las 4 fichas; el resto del tablero se atenúa.
- **Animación de caída** de ~250 ms; se desactiva con `prefers-reduced-motion`.
- **Responsive:** tablero con `aspect-ratio: 8 / 7` y ancho `min(100%, 70vh · 8/7)`; zonas táctiles
  ≥ 44 px.
- **Accesibilidad:** cada columna es un `<button>` con `aria-label` ("Columna 4, quedan 3 espacios");
  teclas 1–8; foco visible; mensajes de turno en una región `aria-live`.

---

## 9. Pasos en orden

| # | Paso | Listo cuando… | Hito |
|---|---|---|---|
| F0 | Este plan | está en `main` antes del código | H0 |
| F1 | Proyecto Vite + Tailwind + shadcn/ui en `apps/web`; propuestas de v0 y votación (§8); layout base y proxy | diseño elegido registrado en la bitácora; `npm run dev` muestra el layout; lint sin avisos | H1 |
| F2 | `Board` estático desde una matriz | prueba de orientación con el tablero del ejemplo del OpenAPI (fila 0 abajo); se ve bien a 1280×800 y 375×812 | H1 |
| F3 | `reducer` + `fake-client` | partida completa contra el fake; tabla de §6 probada al 100 % | H2 |
| F4 | Integración con la API real (B9) | partida completa contra el motor real empezando cada lado; 0 errores en consola | H3 |
| F5 | P1: dificultad, historial, deshacer, `BotInsights`, vista previa, teclado, `?moves=` | cada función con su prueba de componente | H3 |
| F6 | Pulido: responsive, animaciones, accesibilidad, estado del bot | Lighthouse accesibilidad ≥ 90; probado en un celular real | H4 |
| F7 | P2: repetición de partidas del torneo | repite una partida del mock (miércoles) y una real (jueves) | jue 9:30 |
| F8 | Capturas automáticas con Playwright y `docs/MANUAL.md` | una captura por cada estado de §6 | jue 9:30 |

**Paralelismo:** F1–F3 no dependen del backend gracias al `fake-client`. F4 necesita B9 (H3).

**Si vamos tarde:** se corta P2 completo, luego "Cómo pensó el bot". Nunca se corta P0, los estados de
§6 ni el responsive básico.

---

## 10. Qué se delega a la IA y cómo se verifica

| Paso | Se delega | Verificación |
|---|---|---|
| F1 | propuestas visuales (v0) y scaffolding | el equipo elige con los criterios de §8; solo entran los componentes necesarios, con lint, revisión de PR y SonarQube |
| F2 | `Board` | prueba con un tablero asimétrico (el del OpenAPI): la ficha de la fila 0 debe quedar abajo; revisión visual |
| F3 | `reducer` | R4 escribe la tabla de §6 como pruebas **antes** de pedir el código |
| F5, F6 | componentes y CSS | DevTools a 375 px, Lighthouse, prueba de pasillo |
| F8 | redacción del manual | una persona no técnica lo lee y juega siguiéndolo |

Errores relevantes de la IA → `docs/BITACORA_IA.md`.

---

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Columnas desfasadas (0–7 contra 1–8) | conversión solo en `ui/coords.ts`, con pruebas |
| El código generado por v0 trae dependencias o patrones que no queremos | se copian solo los componentes necesarios; pasan por lint, revisión de PR y SonarQube |
| Tablero dibujado al revés | prueba de orientación en F2 |
| La API no está lista a tiempo | `fake-client` con la misma interfaz |
| El celular no alcanza la laptop (Wi-Fi que aísla dispositivos) | probar con el hotspot de un teléfono; plan B: mostrar el responsive en DevTools |
| Errores en consola durante la demo | prueba que falla con `console.error`; `StrictMode`; lint de hooks |
| La demo le quita CPU al bot del torneo | la demo corre en la máquina B con `ARBITRO_ENABLED=false` |
| Falta de tiempo | P0 → P1 → P2; P2 se corta primero |

---

## 12. Validación final (antes del congelamiento)

- [ ] Partida completa empezando yo y empezando el bot, en las tres dificultades.
- [ ] Victoria, derrota y empate muestran el resultado correcto (el empate se prueba cargando con
      `?moves=` una posición a punto de llenarse).
- [ ] Una columna llena no se puede elegir y la app lo explica.
- [ ] Cero errores en consola.
- [ ] Job `e2e` (Playwright + axe) en verde en CI.
- [ ] 375 px de ancho y un celular real.
- [ ] Prueba de pasillo hecha y anotada en la bitácora.
