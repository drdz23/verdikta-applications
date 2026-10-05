import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.walletCalls = [];
    window.ethereum = { request: async args => { window.walletCalls.push(args.method); throw new Error('Wallet forbidden'); } };
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    return route.continue();
  });
});
test('buyer previews both templates without wallet, upload or purchase', async ({ page }) => {
  const writes=[];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.goto('/agents#buyer-preview');
  const panel=page.locator('#buyer-preview');
  await expect(panel).toBeVisible();
  await expect.poll(async()=> (await panel.boundingBox()).y).toBeLessThan(250);
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'More information needed'})).toBeVisible();
  await panel.getByRole('checkbox',{name:/Inputs are public/}).check();
  await panel.getByRole('combobox',{name:'Supplier selection'}).selectOption('OPEN');
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'Draft ready for review'})).toBeVisible();
  await expect(panel.getByText(/Supplier: UNKNOWN/)).toBeVisible();
  await panel.getByRole('checkbox',{name:/My available local/}).check();
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'Handle this task locally'})).toBeVisible();
  await panel.getByRole('checkbox',{name:/My available local/}).uncheck();
  await panel.getByRole('combobox',{name:'Service template'}).selectOption('evidence-pack-v1');
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'Draft ready for review'})).toBeVisible();
  const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Save draft locally'}).click();
  const file=await download;expect(file.suggestedFilename()).toBe('work-order-draft.json');
  const saved=JSON.parse(await readFile(await file.path(),'utf8'));
  for(const flag of ['can_commission','authorization_granted','funds_moved']) expect(saved[flag]).toBe(false);
  expect(saved.draft.procurement.mode).toBe('OPEN');
  expect(await page.evaluate(()=>window.walletCalls.filter(m=>m.startsWith('eth_')))).toEqual([]);
  expect(writes).toEqual([]);
});
test('invalid JSON remains local and recoverable',async({page})=>{
  await page.goto('/agents');const panel=page.locator('#buyer-preview');
  await panel.getByRole('textbox').fill('not JSON');await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('alert')).toHaveText('Enter a valid JSON request. Nothing has been uploaded.');
});

test('an assessment input or saved draft is sent to the Create Bounty import, not previewed as a request',async({page})=>{
  const assessment=JSON.parse(await readFile(new URL('../../../../skills/verdikta-discover/examples/assessment.json',import.meta.url),'utf8'));
  await page.goto('/agents');const panel=page.locator('#buyer-preview');
  await panel.getByRole('textbox').fill(JSON.stringify(assessment));await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('alert')).toContainText('This is an assessment input from an agent, not a request.');
  await expect(panel.getByRole('heading',{name:/Draft ready|More information|Handle this task/})).toHaveCount(0);
  await panel.getByRole('checkbox',{name:/Inputs are public/}).check();
  await panel.getByRole('combobox',{name:'Supplier selection'}).selectOption('OPEN');
  await panel.getByRole('textbox').fill(JSON.stringify(assessment.request));await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'Draft ready for review'})).toBeVisible();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Save draft locally'}).click();
  await panel.getByRole('textbox').fill(await readFile(await (await download).path(),'utf8'));await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('alert')).toContainText('This is a saved work-order draft, not a request.');
  await panel.getByRole('link',{name:'Create Bounty'}).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.locator('.work-order-import')).toBeVisible();
});

test('targeted preview does not silently open a missing supplier',async({page})=>{
  await page.goto('/agents');const panel=page.locator('#buyer-preview');
  await panel.getByRole('checkbox',{name:/Inputs are public/}).check();
  await panel.getByRole('combobox',{name:'Supplier selection'}).selectOption('OPEN');
  await panel.getByRole('combobox',{name:'Supplier selection'}).selectOption('TARGETED');
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'More information needed'})).toBeVisible();
  await expect(panel.getByText('Procurement: TARGETED')).toBeVisible();
  await panel.getByRole('textbox',{name:'Known supplier wallet address'}).fill('0x1111111111111111111111111111111111111111');
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'Draft ready for review'})).toBeVisible();
  await expect(panel.getByText(/Supplier: UNKNOWN/)).toBeVisible();
});
