import {expect,test} from '@playwright/test';

test('copia código e convite para a área de transferência e confere a colagem real',async({page,context,baseURL})=>{
  const origin=new URL(baseURL!).origin;
  if(origin.startsWith('https:')||['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)){
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  if(new URL(origin).protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)){
    expect(await page.evaluate(()=>window.isSecureContext)).toBe(false);
    expect(await page.evaluate(()=>typeof navigator.clipboard)).toBe('undefined');
  }
  await page.getByTestId('nickname-input').fill('Teste copiar');
  await page.getByTestId('create-room').click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  const code=(await page.getByTestId('room-code').textContent())!.trim();
  const invite=origin+'/?room='+code;
  const copyCode=page.getByRole('button',{name:'Copiar código da sala '+code,exact:true});
  const copyInvite=page.getByRole('button',{name:'Copiar convite',exact:true});
  const input=page.getByTestId('chat-input');
  async function paste(expected:string){
    await input.fill('');await input.focus();await input.press('ControlOrMeta+V');
    await expect(input).toHaveValue(expected);
    await expect(page.locator('textarea')).toHaveCount(0);
  }
  try{
    await page.bringToFront();
    await copyCode.click();
    await expect(copyCode).toContainText('Copiado!');
    await expect(copyCode).toBeFocused();
    await paste(code);
    await copyInvite.click();
    await expect(page.getByRole('alert')).toContainText('Link da sala copiado!');
    await expect(copyInvite).toBeFocused();
    await paste(invite);
    await copyCode.click();
    await paste(code);
  }finally{
    await page.getByRole('button',{name:'Sair da sala'}).click();
  }
});
