import { expect, test, type Page } from '@playwright/test';

async function chat(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-input')).toHaveValue('');
}

async function bitmap(page: Page) {
  return page.getByTestId('drawing-canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
}

test('três navegadores desenham, conversam, acertam e concluem uma partida real', async ({ browser, baseURL }) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1440, height: 1000 } })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const names = ['Ana E2E', 'Bia E2E', 'Caio E2E'];
  try {
    await Promise.all(pages.map(async (page, index) => {
      await page.goto(baseURL!);
      await page.getByTestId('nickname-input').fill(names[index]);
    }));
    await pages[0].getByTestId('create-room').click();
    await expect(pages[0].getByTestId('room-code')).toBeVisible();
    const code = (await pages[0].getByTestId('room-code').textContent())!.trim();
    for (const page of pages.slice(1)) {
      await page.getByTestId('room-code-input').fill(code);
      await page.getByTestId('join-room').click();
      await expect(page.getByTestId('room-code')).toHaveText(code);
    }
    await Promise.all(pages.map(page => expect(page.getByTestId('player-row')).toHaveCount(3)));
    await chat(pages[1], 'Olá de outro navegador!');
    await Promise.all(pages.map(page => expect(page.getByTestId('chat-message').filter({ hasText: 'Olá de outro navegador!' })).toHaveCount(1)));
    await pages[0].getByRole('combobox', { name: 'Quantidade de rodadas' }).selectOption('1');
    await expect(pages[0].getByRole('combobox', { name: 'Quantidade de rodadas' })).toHaveValue('1');
    await pages[0].getByTestId('start-game').click();

    for (let turn = 0; turn < 3; turn++) {
      // A seleção só existe no DOM do navegador autorizado a desenhar.
      await expect.poll(async () => {
        for (let index = 0; index < pages.length; index++) {
          if (await pages[index].getByTestId('word-option-0').isVisible()) return index;
        }
        return -1;
      }).toBeGreaterThanOrEqual(0);
      const drawerIndex = (await Promise.all(pages.map(page => page.getByTestId('word-option-0').isVisible()))).findIndex(Boolean);
      const drawer = pages[drawerIndex];
      const guessers = pages.filter(page => page !== drawer);
      const option = drawer.getByTestId('word-option-0');
      const word = (await option.getAttribute('data-word'))!;
      await option.click();
      await expect(drawer.getByTestId('secret-word')).toHaveText(word);
      for (const guesser of guessers) {
        await expect(guesser.getByTestId('secret-word')).toHaveCount(0);
        await expect(guesser.getByTestId('word-option-0')).toHaveCount(0);
      }

      if (turn === 0) {
        const blank = await Promise.all(guessers.map(bitmap));
        const canvas = drawer.getByTestId('drawing-canvas');
        const bounds = (await canvas.boundingBox())!;
        await drawer.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .3);
        await drawer.mouse.down();
        await drawer.mouse.move(bounds.x + bounds.width * .75, bounds.y + bounds.height * .65, { steps: 14 });
        await drawer.mouse.up();
        for (let index = 0; index < guessers.length; index++) {
          await expect.poll(() => bitmap(guessers[index])).not.toBe(blank[index]);
        }
        await chat(guessers[0], 'Um palpite errado do navegador');
        await expect(guessers[1].getByTestId('chat-message').filter({ hasText: 'Um palpite errado do navegador' })).toHaveCount(1);

        // Recarregar um contexto reutiliza a sessão e sincroniza o desenho.
        await guessers[1].reload();
        await expect(guessers[1].getByTestId('player-row')).toHaveCount(3);
        await expect.poll(() => bitmap(guessers[1])).not.toBe(blank[1]);
      }

      for (let index = 0; index < guessers.length; index++) {
        await chat(guessers[index], word);
        if (index === 0) await expect(guessers[index].getByTestId('chat-input')).toBeDisabled();
      }
      await expect(drawer.getByTestId('chat-message').filter({ hasText: /acertou!/ })).toHaveCount((turn + 1) * 2);
    }

    await expect(pages[0].getByTestId('restart-game')).toBeVisible();
    await expect(pages[0].locator('.results-ranking > div')).toHaveCount(3);
    for (const page of pages) {
      await expect(page.getByText('Partida concluída', { exact: true })).toBeVisible();
    }
    await pages[0].getByTestId('restart-game').click();
    await expect(pages[0].getByTestId('word-option-0')).toBeVisible();
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
