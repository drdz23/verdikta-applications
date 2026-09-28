import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('https://**', route => route.abort());
});
test('buyer previews both templates without wallet, upload or purchase', async ({ page }) => {
  const writes=[];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.goto('/agents#buyer-preview');
  const panel=page.locator('#buyer-preview');
  await expect(panel).toBeVisible();
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'DRAFT_NOT_QUOTED: UNSUITABLE'})).toBeVisible();
  await panel.getByRole('checkbox',{name:/Inputs are public/}).check();
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'DRAFT_NOT_QUOTED: PREVIEW'})).toBeVisible();
  await expect(panel.getByText(/Supplier: UNKNOWN/)).toBeVisible();
  await panel.getByRole('checkbox',{name:/My available local/}).check();
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'DRAFT_NOT_QUOTED: LOCAL'})).toBeVisible();
  await panel.getByRole('checkbox',{name:/My available local/}).uncheck();
  await panel.getByRole('combobox',{name:'Service template'}).selectOption('evidence-pack-v1');
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'DRAFT_NOT_QUOTED: PREVIEW'})).toBeVisible();
  const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Save draft locally'}).click();
  expect((await download).suggestedFilename()).toBe('work-order-draft.json');
  expect(writes).toEqual([]);
});
test('invalid JSON remains local and recoverable',async({page})=>{
  await page.goto('/agents');const panel=page.locator('#buyer-preview');
  await panel.getByRole('textbox').fill('not JSON');await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('alert')).toHaveText('Enter a valid JSON request. Nothing has been uploaded.');
});

test('targeted preview does not silently open a missing supplier',async({page})=>{
  await page.goto('/agents');const panel=page.locator('#buyer-preview');
  await panel.getByRole('checkbox',{name:/Inputs are public/}).check();
  await panel.getByRole('combobox',{name:'Supplier selection'}).selectOption('TARGETED');
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'DRAFT_NOT_QUOTED: NEEDS_SCOPE'})).toBeVisible();
  await expect(panel.getByText('Procurement: TARGETED')).toBeVisible();
  await panel.getByRole('textbox',{name:'Known supplier wallet address'}).fill('0x1111111111111111111111111111111111111111');
  await panel.getByRole('button',{name:'Preview a work order'}).click();
  await expect(panel.getByRole('heading',{name:'DRAFT_NOT_QUOTED: PREVIEW'})).toBeVisible();
  await expect(panel.getByText(/Supplier: UNKNOWN/)).toBeVisible();
});
