/* global Buffer */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { preview } from '../../../../skills/verdikta-discover/scripts/preview-core.mjs';

const TARGET = '0x52908400098527886E0F7030069857D2E4169EE7';
const example = JSON.parse(await readFile(new URL('../../../../skills/verdikta-discover/examples/source-check-v1.request.json', import.meta.url), 'utf8'));
const request = { ...example, fixture_only: false, task_id: 'e2e-import' };
const draft = (extra = {}) => preview({ request: structuredClone(request), task_summary: 'Check three claims (e2e)', sharing_authorized: true, procurement_mode: 'OPEN', ...extra });
const bytes = a => Buffer.from(JSON.stringify(a, null, 2));
const upload = a => ({ name: 'work-order-draft.json', mimeType: 'application/json', buffer: bytes(a) });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.walletCalls = [];
    window.ethereum = { request: async args => { window.walletCalls.push(args.method); throw new Error('Wallet forbidden'); } };
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.continue();
  });
});

const openCreate = async page => { await page.goto('/create'); const panel = page.locator('.work-order-import'); await expect(panel).toBeVisible(); return panel; };
const goToStep = (page, label) => page.locator('.step', { hasText: label }).click();

test('imports an open draft locally: prefill, draft hash, committed block, nothing sent', async ({ page }) => {
  const writes = []; page.on('request', r => { if (r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`); });
  const panel = await openCreate(page);
  const a = draft();
  await panel.getByLabel('Work-order draft file').setInputFiles(upload(a));
  await expect(panel.getByText('Imported draft', { exact: true })).toBeVisible();
  await expect(panel.getByTestId('draft-sha256')).toHaveText(createHash('sha256').update(bytes(a)).digest('hex'));
  await expect(page.getByLabel(/Job Title/)).toHaveValue('Technical claim source check: 3 claims');
  await expect(page.getByLabel(/Job Description/)).toHaveValue('Check three claims (e2e)');
  await expect(page.getByLabel(/Target Address/)).toHaveValue('');
  await panel.getByText('Show the block that will be appended').click();
  const block = await panel.locator('.work-order-block').textContent();
  expect(block).toContain('Service: source-check-v1');
  expect(block).toContain('"task_id":"e2e-import"');
  await goToStep(page, 'Rubric');
  await expect(page.locator('#threshold')).toHaveValue('85');
  await expect(page.locator('#rubricTitle')).toHaveValue(a.draft.rubric.title);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => window.walletCalls.filter(m => m.startsWith('eth_')))).toEqual([]);
});

test('a targeted draft keeps its supplier, and edits that diverge are named and can be restored', async ({ page }) => {
  const panel = await openCreate(page);
  await panel.getByLabel('Work-order draft JSON').fill(JSON.stringify(draft({ procurement_mode: 'TARGETED', targetHunter: TARGET })));
  await panel.getByRole('button', { name: 'Import pasted JSON' }).click();
  await expect(panel.getByText('Imported draft', { exact: true })).toBeVisible();
  const target = page.getByLabel(/Target Address/);
  await expect(target).toHaveValue(TARGET);
  await expect(target).toHaveJSProperty('readOnly', true);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await goToStep(page, 'Rubric');
  await page.locator('#threshold').fill('70');
  await goToStep(page, 'Basic Info');
  await expect(panel.getByRole('alert')).toContainText('threshold no longer match the imported draft');
  await panel.getByRole('button', { name: 'Restore draft values' }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await goToStep(page, 'Rubric');
  await expect(page.locator('#threshold')).toHaveValue('85');
  await goToStep(page, 'Basic Info');
  await panel.getByRole('button', { name: 'Remove imported draft' }).click();
  await expect(panel.getByLabel('Work-order draft file')).toBeVisible();
  await expect(page.getByLabel(/Target Address/)).toHaveJSProperty('readOnly', false);
});

test('a draft that is fixture-only, tampered, unscoped or not JSON is refused and nothing is imported', async ({ page }) => {
  const panel = await openCreate(page);
  const fixture = preview({ request: structuredClone(example), sharing_authorized: true, procurement_mode: 'OPEN' });
  const tampered = draft(); tampered.draft.threshold = 10;
  const quoted = draft(); quoted.quote_status = 'QUOTED';
  const local = draft(); local.decision = 'LOCAL';
  const cases = [[upload(fixture), 'Synthetic requests cannot be commissioned'], [upload(tampered), 'does not match a fresh scoped preview'],
    [upload(quoted), 'Only a scoped draft'], [upload(local), 'Only a scoped draft'], [{ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') }, 'not valid UTF-8 JSON']];
  for (const [file, message] of cases) {
    await panel.getByLabel('Work-order draft file').setInputFiles(file);
    await expect(panel.getByRole('alert')).toContainText(message);
    await expect(panel.getByText('Imported draft', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/Job Title/)).toHaveValue('');
  }
});

test('local findings are shown as the agent\'s own and never enter the description', async ({ page }) => {
  const panel = await openCreate(page);
  const residual = { ...structuredClone(request), task_id: 'e2e-import-residual', claims: request.claims.slice(2) };
  const a = preview({ request: residual, sharing_authorized: true, procurement_mode: 'OPEN', task_summary: 'Residual claim',
    local_summary: { mode: 'RESIDUAL', independent: false, performed_by: 'AGENT', original_task_id: 'e2e-import', original_item_count: 3, method: 'Read the page.', limitations: 'None.',
      resolved: [{ item_id: 'C1', verdict: 'SUPPORTED', value: null, source_url: 'https://docs.example/a', basis: 'LOCAL-BASIS-MARKER' }, { item_id: 'C2', verdict: 'CONTRADICTED', value: null, source_url: 'https://docs.example/a', basis: 'Other.' }],
      residual: [{ item_id: 'C3', reason: 'UNRESOLVED_ABSENT', note: 'Silent.' }] } });
  await panel.getByLabel('Work-order draft file').setInputFiles(upload(a));
  await expect(panel.getByText(/not independent verification, not part of the commissioned request/)).toBeVisible();
  await expect(panel.getByText('LOCAL-BASIS-MARKER')).toBeVisible();
  await panel.getByText('Show the block that will be appended').click();
  const block = await panel.locator('.work-order-block').textContent();
  expect(block).toContain('"claim_id":"C3"');
  expect(block).not.toContain('LOCAL-BASIS-MARKER');
  expect(block).not.toContain('"claim_id":"C1"');
});

test('an assessment input an agent returned becomes its draft in the browser, with the hash and bytes the script prints', async ({ page }) => {
  const writes = []; page.on('request', r => { if (r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`); });
  const panel = await openCreate(page);
  const input = { request: structuredClone(request), task_summary: 'Check three claims (e2e input)', sharing_authorized: true, procurement_mode: 'OPEN' };
  await panel.getByLabel('Work-order draft JSON').fill(JSON.stringify(input));
  await panel.getByRole('button', { name: 'Import pasted JSON' }).click();
  await expect(panel.getByText('Imported draft', { exact: true })).toBeVisible();
  const text = JSON.stringify(preview(structuredClone(input)), null, 2) + '\n';
  await expect(panel.getByTestId('draft-sha256')).toHaveText(createHash('sha256').update(text).digest('hex'));
  await expect(panel.getByText(/^Derived from the assessment input/)).toBeVisible();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download the derived draft' }).click();
  expect(await readFile(await (await download).path(), 'utf8')).toBe(text);
  await expect(page.getByLabel(/Job Title/)).toHaveValue('Technical claim source check: 3 claims');
  expect(writes).toEqual([]);
});

test('an assessment input that makes no draft is refused with the reason', async ({ page }) => {
  const panel = await openCreate(page);
  await panel.getByLabel('Work-order draft JSON').fill(JSON.stringify({ request: structuredClone(request), procurement_mode: 'OPEN' }));
  await panel.getByRole('button', { name: 'Import pasted JSON' }).click();
  await expect(panel.getByRole('alert')).toContainText('Obtain sharing approval');
  await expect(panel.getByText('Imported draft', { exact: true })).toHaveCount(0);
});
