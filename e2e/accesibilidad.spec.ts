/**
 * Accesibilidad con axe (WCAG 2 A y AA) en cada pantalla. Falla con cualquier violación seria o
 * crítica; el detalle completo queda adjunto al reporte.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { TU_TURNO, columna, expect, test, titular } from './fixtures.ts';

async function revisar(page: Page, testInfo: TestInfo, pantalla: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  await testInfo.attach(`axe ${pantalla}`, {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
  const graves = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
  expect(graves, `violaciones serias o críticas en ${pantalla}`).toEqual([]);
}

test('accesibilidad: nueva partida, partida en curso y resultado', async ({
  page,
  evidencia,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nueva partida' })).toBeVisible();
  await revisar(page, testInfo, 'nueva partida');

  await page.getByRole('button', { name: 'Jugar' }).click();
  await columna(page, 4).click();
  await expect(titular(page)).toHaveText(TU_TURNO, { timeout: 15_000 });
  await revisar(page, testInfo, 'partida en curso');

  await page.goto('/?moves=0,7,1,7,2,6');
  await columna(page, 4).click();
  await expect(titular(page)).toHaveText('¡Ganaste!');
  await revisar(page, testInfo, 'resultado');
  await evidencia('pantalla revisada con axe');
});
