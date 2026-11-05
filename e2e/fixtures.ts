/**
 * Utilidades de las pruebas E2E:
 * - `evidencia(nombre)`: captura de pantalla numerada en la carpeta de la corrida, adjunta al reporte;
 * - `pausa()`: en modo demora espera entre pasos para poder verlos; en automático no hace nada;
 * - cualquier error en la consola del navegador hace fallar la prueba (criterio de la rúbrica),
 *   salvo los que la prueba declare con `consola.permitir(/…/)` (p. ej. cuando corta la red a
 *   propósito).
 */
import { join } from 'node:path';
import { type Locator, type Page, test as base, expect } from '@playwright/test';
import { currentRun } from './run.ts';

const run = currentRun();

export const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

interface Consola {
  /** Acepta errores de consola que esta prueba provoca a propósito. */
  permitir: (patron: RegExp) => void;
}

interface Fixtures {
  evidencia: (nombre: string) => Promise<void>;
  pausa: (ms?: number) => Promise<void>;
  consola: Consola;
}

export const test = base.extend<Fixtures>({
  consola: [
    async ({ page }, use) => {
      const errores: string[] = [];
      const permitidos: RegExp[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errores.push(message.text());
      });
      page.on('pageerror', (error) => errores.push(error.message));
      await use({ permitir: (patron) => permitidos.push(patron) });
      const inesperados = errores.filter((texto) => !permitidos.some((p) => p.test(texto)));
      expect(inesperados, 'errores en la consola del navegador').toEqual([]);
    },
    { auto: true },
  ],

  pausa: async ({ page }, use) => {
    await use(async (ms = run.delayMs) => {
      if (ms > 0) await page.waitForTimeout(ms);
    });
  },

  evidencia: async ({ page }, use, testInfo) => {
    let paso = 0;
    const carpeta = join(run.dir, 'capturas', testInfo.project.name, slug(testInfo.title));
    await use(async (nombre) => {
      paso++;
      const archivo = join(carpeta, `${String(paso).padStart(2, '0')}-${slug(nombre)}.png`);
      await page.screenshot({ path: archivo, fullPage: true });
      await testInfo.attach(nombre, { path: archivo, contentType: 'image/png' });
    });
  },
});

export { expect };

// ── Atajos de la pantalla ────────────────────────────────────────────────────────────────────────

/** Titular del estado: "Tu turno…", "El bot está pensando…", "¡Ganaste!"… */
export const titular = (page: Page): Locator => page.locator('[aria-live="polite"] p');

/** Botón de una columna como la ve la persona (1–8). */
export const columna = (page: Page, n: number): Locator =>
  page.getByRole('button', { name: new RegExp(`^Columna ${n},`) });

export const FIN = /¡Ganaste!|Ganó el bot\.|Empate/;
export const TU_TURNO = 'Tu turno: elige una columna.';

/** Juega desde el centro hacia los bordes, como haría una persona, hasta que termina. */
export async function jugarHastaElFinal(
  page: Page,
  evidencia: Fixtures['evidencia'],
  pausa: Fixtures['pausa'],
): Promise<string> {
  const orden = [4, 5, 3, 6, 2, 7, 1, 8];
  for (let turno = 1; turno <= 28; turno++) {
    await expect(titular(page)).toHaveText(new RegExp(`${TU_TURNO}|${FIN.source}`));
    const texto = (await titular(page).textContent()) ?? '';
    if (FIN.test(texto)) return texto;
    for (const n of orden) {
      if ((await columna(page, n).getAttribute('aria-disabled')) === 'false') {
        await columna(page, n).click();
        break;
      }
    }
    await expect(titular(page)).toHaveText(new RegExp(`${TU_TURNO}|${FIN.source}`));
    await evidencia(`turno ${turno}`);
    await pausa();
  }
  return (await titular(page).textContent()) ?? '';
}
