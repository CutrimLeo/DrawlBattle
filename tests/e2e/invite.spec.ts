import { expect, test, type BrowserContext, type Page } from '@playwright/test';

interface SavedSession { playerId: string; roomCode: string }

async function createRoom(page: Page, baseURL: string, name: string) {
  await page.goto(baseURL);
  await page.getByTestId('nickname-input').fill(name);
  await page.getByTestId('create-room').click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  return (await page.getByTestId('room-code').textContent())!.trim();
}

async function savedSession(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('drawbattle.session') || 'null') as SavedSession | null);
}

async function cleanup(contexts: BrowserContext[], pages: Page[]) {
  await Promise.allSettled(pages.map(async page => {
    const leave = page.getByRole('button', { name: 'Sair da sala', exact: true });
    if (await leave.isVisible()) await leave.click();
  }));
  await Promise.all(contexts.map(context => context.close()));
}

test('convite realmente copiado entra na sala indicada com Enter e aceita acesso direto pelo código', async ({ browser, baseURL }, testInfo) => {
  const contexts = await Promise.all([0, 1, 2, 3].map(() => browser.newContext({ viewport: { width: 1440, height: 1000 } })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const [host, invited, manual, direct] = pages;
  const origin = new URL(baseURL!).origin;
  if (origin.startsWith('https:') || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) {
    await contexts[0].grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  }
  try {
    const code = await createRoom(host, baseURL!, 'Host convite');
    await host.bringToFront();
    await host.getByRole('button', { name: 'Copiar convite', exact: true }).click();
    const chat = host.getByTestId('chat-input');
    await chat.fill('');
    await chat.focus();
    await chat.press('ControlOrMeta+V');
    await expect(chat).toHaveValue(origin + '/?room=' + code);
    const copiedInvite = await chat.inputValue();

    await invited.goto(copiedInvite);
    await expect(invited.getByTestId('room-code-input')).toHaveValue(code);
    await expect(invited.getByTestId('join-room')).toBeEnabled();
    await invited.setViewportSize({ width: 320, height: 780 });
    await expect.poll(() => invited.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(invited.getByTestId('room-code-input')).toHaveJSProperty('readOnly', true);
    await invited.screenshot({ path: testInfo.outputPath('invite-mobile.png'), fullPage: true });
    await invited.getByTestId('nickname-input').fill('Amigo convidado');
    await invited.getByTestId('nickname-input').press('Enter');
    await expect(invited.getByTestId('room-code')).toHaveText(code);
    await expect(host.getByTestId('player-row')).toHaveCount(2);
    await expect(invited.getByTestId('player-row')).toHaveCount(2);

    // Sem convite, Enter no campo de código também deve entrar, em vez de criar.
    await manual.goto(baseURL!);
    await manual.getByTestId('nickname-input').fill('Amigo pelo código');
    await manual.getByTestId('room-code-input').fill(code.toLowerCase());
    await expect(manual.getByTestId('join-room')).toBeEnabled();
    await manual.getByTestId('room-code-input').press('Enter');
    await expect(manual.getByTestId('room-code')).toHaveText(code);
    await expect(host.getByTestId('player-row')).toHaveCount(3);

    // A rota pública da sala deve guardar o mesmo destino para um jogador novo.
    await direct.goto(origin + '/room/' + code);
    await expect(direct.getByTestId('room-code-input')).toHaveValue(code);
    await expect(direct.getByTestId('join-room')).toBeEnabled();
    await direct.getByTestId('nickname-input').fill('Amigo pela rota');
    await direct.getByTestId('nickname-input').press('Enter');
    await expect(direct.getByTestId('room-code')).toHaveText(code);
    await expect(host.getByTestId('player-row')).toHaveCount(4);
    await expect(direct.getByTestId('player-row')).toHaveCount(4);
  } finally {
    await cleanup(contexts, pages);
  }
});

test('sessão anterior respeita outro convite e só troca de sala ao entrar', async ({ browser, baseURL }) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1440, height: 1000 } })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const [hostA, hostB, visitor] = pages;
  const origin = new URL(baseURL!).origin;
  try {
    const codeA = await createRoom(hostA, baseURL!, 'Host sala A');
    const codeB = await createRoom(hostB, baseURL!, 'Host sala B');
    await visitor.goto(baseURL!);
    await visitor.getByTestId('nickname-input').fill('Visitante troca');
    await visitor.getByTestId('room-code-input').fill(codeA);
    await visitor.getByTestId('join-room').click();
    await expect(visitor.getByTestId('room-code')).toHaveText(codeA);
    await expect(hostA.getByTestId('player-row')).toHaveCount(2);
    const originalIdentity = await savedSession(visitor);
    expect(originalIdentity?.roomCode).toBe(codeA);

    // O convite da própria sala restaura a identidade e não adiciona outro jogador.
    await visitor.goto(origin + '/?room=' + codeA);
    await expect(visitor.getByTestId('room-code')).toHaveText(codeA);
    expect(await savedSession(visitor)).toEqual(originalIdentity);
    await expect(hostA.getByTestId('player-row')).toHaveCount(2);

    await visitor.goto(origin + '/?room=' + codeB);
    await expect(visitor.getByTestId('room-code-input')).toHaveValue(codeB);
    await expect(visitor.getByTestId('room-code-input')).toHaveJSProperty('readOnly', true);
    await expect(visitor.getByTestId('join-room')).toBeEnabled();
    await expect(visitor.getByTestId('create-room')).toHaveCount(0);
    // Abrir o link não abandona a sala A nem redireciona o convite para ela.
    expect(await savedSession(visitor)).toEqual(originalIdentity);
    await expect(hostA.getByTestId('player-row')).toHaveCount(2);
    await expect(hostB.getByTestId('player-row')).toHaveCount(1);

    await visitor.getByTestId('join-room').click();
    await expect(visitor.getByTestId('room-code')).toHaveText(codeB);
    await expect(hostB.getByTestId('player-row')).toHaveCount(2);
    await expect(hostA.getByTestId('player-row')).toHaveCount(1);
    const newIdentity = await savedSession(visitor);
    expect(newIdentity?.roomCode).toBe(codeB);
    expect(newIdentity?.playerId).not.toBe(originalIdentity?.playerId);
  } finally {
    await cleanup(contexts, pages);
  }
});

test('convite de sala inexistente mostra erro e não cria uma sala substituta', async ({ page, baseURL }) => {
  // Os códigos gerados são hexadecimais; ZZZZZZ passa pela validação e nunca existe.
  const code = 'ZZZZZZ';
  await page.goto(new URL('/?room=' + code, baseURL!).href);
  await expect(page.getByTestId('room-code-input')).toHaveValue(code);
  await expect(page.getByTestId('create-room')).toHaveCount(0);
  await expect(page.getByTestId('join-room')).toBeEnabled();
  await page.getByTestId('nickname-input').fill('Convite inexistente');
  await page.getByTestId('nickname-input').press('Enter');
  await expect(page.getByRole('alert')).toContainText('Sala não encontrada.');
  await expect(page.getByTestId('room-code')).toHaveCount(0);
  await expect(page.getByTestId('room-code-input')).toHaveValue(code);
  expect(new URL(page.url()).searchParams.get('room')).toBe(code);
  expect(await savedSession(page)).toBeNull();
});
