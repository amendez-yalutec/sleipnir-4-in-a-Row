/**
 * Estados y avisos de la pantalla (PLAN_FRONTEND.md §6): lo que ve la persona cuando algo no va.
 *
 * Las columnas que no se pueden jugar llevan `aria-disabled="true"` y Playwright no hace clic en ellas
 * por su cuenta. Una persona sí puede, y para eso está el aviso; por eso esos clics van con `force`.
 */
import { TU_TURNO, columna, expect, test, titular } from './fixtures.ts';

test('columna llena: aviso y no cae ninguna ficha', async ({ page, evidencia, pausa }) => {
  await page.goto('/?moves=0,0,0,0,0,0,0');
  await expect(columna(page, 1)).toHaveAttribute('aria-label', 'Columna 1, llena');
  await evidencia('columna 1 llena');
  await pausa();
  await columna(page, 1).click({ force: true });
  await expect(page.getByRole('alert')).toHaveText('Esa columna está llena. Elige otra.');
  await expect(titular(page)).toHaveText(TU_TURNO);
  await evidencia('aviso columna llena');
  await pausa();
});

test('mientras el bot piensa: "Espera, es turno del bot"', async ({ page, evidencia, pausa }) => {
  // Se retrasa la respuesta del bot para poder ver y probar el estado "pensando".
  await page.route('**/api/game/bot-move', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Jugar' }).click();
  await columna(page, 4).click();
  await expect(titular(page)).toHaveText('El bot está pensando…');
  await columna(page, 5).click({ force: true });
  await expect(page.getByRole('alert')).toHaveText('Espera, es turno del bot.');
  await evidencia('bot pensando');
  await pausa();
  await expect(titular(page)).toHaveText(TU_TURNO, { timeout: 15_000 });
});

test('sin conexión: mensaje claro, Reintentar y la partida sigue', async ({
  page,
  evidencia,
  pausa,
  consola,
}) => {
  // Chrome registra en consola la petición que cortamos a propósito: es lo esperado aquí.
  consola.permitir(/ERR_INTERNET_DISCONNECTED/);
  await page.goto('/');
  await page.getByRole('button', { name: 'Jugar' }).click();
  await page.route('**/api/game/state', (route) => route.abort('internetdisconnected'));
  await columna(page, 5).click();
  await expect(titular(page)).toHaveText('Algo falló.');
  await expect(page.getByRole('alert')).toContainText('No hay conexión con el bot');
  await evidencia('sin conexion');
  await pausa();

  await page.unroute('**/api/game/state');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('1. Tú → columna 5')).toBeVisible();
  await expect(titular(page)).toHaveText(TU_TURNO, { timeout: 15_000 });
  await evidencia('despues de reintentar');
  await pausa();
});

test('teclado: las teclas 1 a 8 juegan en esa columna', async ({ page, evidencia, pausa }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Jugar' }).click();
  await page.keyboard.press('6');
  await expect(page.getByText('1. Tú → columna 6')).toBeVisible();
  await expect(titular(page)).toHaveText(TU_TURNO, { timeout: 15_000 });
  await evidencia('jugada con la tecla 6');
  await pausa();
});
