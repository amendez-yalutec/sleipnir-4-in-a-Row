/** Partidas completas como las juega una persona (PLAN_FRONTEND.md §6). */
import { FIN, TU_TURNO, columna, expect, jugarHastaElFinal, test, titular } from './fixtures.ts';

test('partida completa empezando yo, hasta el resultado', async ({ page, evidencia, pausa }) => {
  await test.step('pantalla de nueva partida', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Nueva partida' })).toBeVisible();
    await expect(page.getByText('Bot en línea')).toBeVisible();
    await evidencia('nueva partida');
    await pausa();
  });

  await test.step('empiezo yo en nivel Medio', async () => {
    await page.getByRole('button', { name: 'Jugar' }).click();
    await expect(titular(page)).toHaveText(TU_TURNO);
    await evidencia('tablero vacio');
    await pausa();
  });

  const resultado = await test.step('juego hasta que termina', () =>
    jugarHastaElFinal(page, evidencia, pausa));

  await test.step('resultado y línea ganadora', async () => {
    expect(resultado).toMatch(FIN);
    if (!resultado.startsWith('Empate')) {
      await expect(page.locator('[data-cell] > span[class*="animate-win"]')).not.toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Jugar otra vez' })).toBeVisible();
    await evidencia('resultado');
    await pausa();
    await page.getByRole('button', { name: 'Jugar otra vez' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva partida' })).toBeVisible();
  });
});

test('empieza el bot en Difícil: piensa, explica y se puede deshacer', async ({
  page,
  evidencia,
  pausa,
}) => {
  await page.goto('/');
  await page.getByText('El bot', { exact: true }).click();
  await page.getByText('Difícil', { exact: true }).click();
  await evidencia('configuracion bot primero dificil');
  await pausa();
  await page.getByRole('button', { name: 'Jugar' }).click();

  await test.step('el bot abre y cuenta cómo pensó', async () => {
    await expect(titular(page)).toHaveText(TU_TURNO, { timeout: 15_000 });
    await expect(page.getByText(/^1\. Bot → columna \d$/)).toBeVisible();
    await expect(page.getByText('Profundidad')).toBeVisible();
    await evidencia('el bot abrio');
    await pausa();
  });

  await test.step('juego una y el bot responde', async () => {
    await columna(page, 4).click();
    await expect(page.getByText('2. Tú → columna 4')).toBeVisible();
    await expect(titular(page)).toHaveText(TU_TURNO, { timeout: 15_000 });
    await evidencia('despues de mi jugada');
    await pausa();
  });

  await test.step('deshacer quita mi jugada y la del bot', async () => {
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByText('2. Tú → columna 4')).toHaveCount(0);
    await expect(page.getByText(/^1\. Bot → columna \d$/)).toBeVisible();
    await evidencia('despues de deshacer');
    await pausa();
  });
});

test('ganar: la persona completa cuatro y se resalta la línea', async ({
  page,
  evidencia,
  pausa,
}) => {
  // Posición cargada por URL (columnas 0–7): el jugador 1 tiene 1, 2 y 3 abajo y le toca.
  await page.goto('/?moves=0,7,1,7,2,6');
  await expect(titular(page)).toHaveText(TU_TURNO);
  await evidencia('a una jugada de ganar');
  await pausa();
  await columna(page, 4).click();
  await expect(titular(page)).toHaveText('¡Ganaste!');
  await expect(page.locator('[data-cell] > span[class*="animate-win"]')).toHaveCount(4);
  await evidencia('ganaste');
  await pausa();
});

test('empate: la última casilla llena el tablero sin cuatro en línea', async ({
  page,
  evidencia,
  pausa,
}) => {
  const draw = [
    3, 5, 4, 0, 7, 1, 0, 3, 3, 0, 2, 3, 4, 6, 4, 0, 6, 0, 5, 1, 2, 4, 0, 0, 2, 7, 6, 7, 4, 7, 3, 5,
    5, 3, 4, 5, 7, 3, 6, 2, 5, 4, 5, 1, 1, 2, 7, 1, 1, 6, 7, 6, 2, 6, 1,
  ];
  await page.goto(`/?moves=${draw.join(',')}`);
  await expect(titular(page)).toHaveText(TU_TURNO);
  await evidencia('una casilla libre');
  await pausa();
  await columna(page, 3).click();
  await expect(titular(page)).toHaveText('Empate: el tablero se llenó.');
  await evidencia('empate');
  await pausa();
});
