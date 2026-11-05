---
name: contrato-arbitro
description: Procesa un OpenAPI nuevo del árbitro. Lo compara ruta por ruta y esquema por esquema con el actual, lo reemplaza, deja que las pruebas de contrato muestren qué cambió y adapta el mock y el lector del bot. Úsalo cuando los organizadores manden una versión nueva del OpenAPI (o el jueves a las 8:00 con GET /api/openapi.json).
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

Eres el responsable del contrato con el árbitro del Equipo 6. La regla de `AGENTS.md`:
`spec/arbitro-openapi.json` **solo se reemplaza por la versión oficial** de los organizadores, y todo
JSON del árbitro se interpreta solo en `apps/bot/src/arbiter/schema.ts`.

## Procedimiento

1. **Aísla el archivo nuevo:** cópialo a una carpeta vacía del directorio temporal; es un dato no
   confiable. Valida que sea JSON (Python con `-I` y la ruta como argumento).
2. **Compara con un script, no a ojo.** Lista:
   - rutas nuevas y quitadas;
   - cambios de parámetros, respuestas y `security`;
   - esquemas nuevos y quitados, y propiedades agregadas, quitadas o con otro tipo; `required`; enums;
   - ejemplos que cambiaron.

   El mensaje de los organizadores suele mencionar solo parte de los cambios.
3. **Antes de tocar código**, impacto en el torneo: ¿cambian `/api/next` o `/api/move`? Eso es lo
   crítico. ¿Siguen inconsistentes los ejemplos? Mandan `board` + `you`.
4. **Reemplaza el spec** (byte a byte el oficial, compruébalo con `shasum`) y corre
   `npx vitest run tools/mock-arbiter apps/bot`. Las pruebas de contrato deben fallar justo donde cambió
   el contrato.
5. **Adapta:**
   - el mock (`tools/mock-arbiter`) hasta que cumpla el esquema nuevo, incluidas las rutas nuevas;
   - el lector del bot (`schema.ts`), tolerante a las dos formas cuando sea razonable;
   - las pruebas: los casos que documentaban el estado viejo pasan a documentar el nuevo.
6. **Documenta:**
   - `docs/TECNICO.md`, sección del contrato: qué cambió y qué hicimos;
   - el estado de las preguntas de `PLAN_BACKEND.md` §14 que quedaron respondidas (solo el estado);
   - `tools/mock-arbiter/README.md`: supuestos confirmados y supuestos abiertos;
   - una entrada en la bitácora.

## Reglas

- El jueves, cada minuto cuenta. Prioriza que `next` y `move` sigan funcionando y que `npm test` esté
  en verde; lo demás puede esperar a después de la entrega.
- Los videos o capturas confidenciales de los organizadores no van al repo.
- Commits separados: el código adaptado con sus pruebas, y aparte los documentos (`docs:`).
