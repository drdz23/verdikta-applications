/* global Buffer */
import { test, expect } from '@playwright/test';

// Drag-and-drop on the Submit Work page. A fake connected wallet gets past the
// page's wallet gate; the API is stubbed and every non-GET request is recorded,
// so nothing is uploaded or signed.

const HUNTER = '0x52908400098527886E0F7030069857D2E4169EE7';
const JOB = {
  jobId: 7,
  title: 'Drop zone test bounty',
  status: 'OPEN',
  bountyAmount: '0.01',
  threshold: 70,
  submissionCloseTime: Math.floor(Date.now() / 1000) + 86400,
  juryNodes: [{ provider: 'OpenAI', model: 'gpt-5.2-2025-12-11', weight: 1, runs: 1 }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ hunter }) => {
    for (const net of ['base-sepolia', 'base']) localStorage.setItem(`wallet_was_connected_${net}`, 'true');
    window.walletCalls = [];
    window.ethereum = {
      on() {},
      removeListener() {},
      request: async ({ method }) => {
        window.walletCalls.push(method);
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [hunter];
        if (method === 'eth_chainId') return '0x14a34';
        if (method === 'net_version') return '84532';
        throw new Error(`not mocked: ${method}`);
      },
    };
  }, { hunter: HUNTER });

  page.writes = [];
  page.on('request', r => { if (r.method() !== 'GET') page.writes.push(`${r.method()} ${r.url()}`); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.abort();
    if (url.pathname === '/api/jobs/7') return route.fulfill({ json: { success: true, job: JOB } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    return route.continue();
  });

  await page.goto('/bounty/7/submit');
  // Once the wallet reconnects the page reloads the bounty, briefly swapping the
  // form for a spinner. That reload's on-chain status check (an eth_call, which
  // the mock rejects) is its last async step, so after it the form is stable.
  await page.waitForFunction(() => window.walletCalls.includes('eth_call'));
  await expect(page.getByTestId('file-drop-zone')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.writes).toEqual([]);
});

// Build a DataTransfer in the page. Each spec is { name, size?, type?, folder? };
// folders are simulated by making webkitGetAsEntry report a directory.
const dataTransfer = (page, specs, { text } = {}) => page.evaluateHandle(({ specs, text }) => {
  const dt = new DataTransfer();
  if (text) dt.setData('text/plain', text);
  window.__folders = new Set(specs.filter(s => s.folder).map(s => s.name));
  if (!window.__entryPatched) {
    const original = DataTransferItem.prototype.webkitGetAsEntry;
    DataTransferItem.prototype.webkitGetAsEntry = function () {
      const file = this.getAsFile();
      if (file && window.__folders.has(file.name)) return { isDirectory: true, name: file.name };
      return original ? original.call(this) : null;
    };
    window.__entryPatched = true;
  }
  for (const s of specs) {
    dt.items.add(new File([new Uint8Array(s.size ?? 16)], s.name, { type: s.type ?? 'text/plain', lastModified: 1700000000000 }));
  }
  return dt;
}, { specs, text });

const fileNames = page => page.locator('.files-list .file-info strong').allTextContents();

test('the Choose Files picker still works and feeds the same list', async ({ page }) => {
  await page.locator('#files').setInputFiles([
    { name: 'solution.py', mimeType: 'text/x-python', buffer: Buffer.from('print(1)') },
    { name: 'README.md', mimeType: 'text/markdown', buffer: Buffer.from('# hi') },
  ]);
  expect(await fileNames(page)).toEqual(['solution.py', 'README.md']);
  await expect(page.locator('.file-drop-count')).toHaveText('2 of 10 files added');
  await expect(page.getByRole('button', { name: /Submit 2 Files/ })).toBeEnabled();
});

test('the zone opens the picker by click and by keyboard', async ({ page }) => {
  const [byClick] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.file-drop-label').click()]);
  expect(byClick.isMultiple()).toBe(true);

  await page.locator('#narrative').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#files')).toBeFocused();
  await expect(page.getByTestId('file-drop-zone')).toHaveCSS('outline-style', 'solid');
  const [byKey] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Space')]);
  await byKey.setFiles([{ name: 'answer.txt', mimeType: 'text/plain', buffer: Buffer.from('42') }]);
  expect(await fileNames(page)).toEqual(['answer.txt']);
});

test('dragging files over the zone shows the drop state, steadily across child elements', async ({ page }) => {
  const zone = page.getByTestId('file-drop-zone');
  const dt = await dataTransfer(page, [{ name: 'a.py' }]);
  await zone.dispatchEvent('dragenter', { dataTransfer: dt });
  await expect(zone).toHaveClass(/drag-active/);
  await expect(zone).toContainText('Drop to add files');

  // Crossing into a child fires enter on the child, then leave on the parent.
  await page.locator('.file-drop-icon').dispatchEvent('dragenter', { dataTransfer: dt });
  await zone.dispatchEvent('dragleave', { dataTransfer: dt });
  await expect(zone).toHaveClass(/drag-active/);

  await page.locator('.file-drop-icon').dispatchEvent('dragleave', { dataTransfer: dt });
  await expect(zone).not.toHaveClass(/drag-active/);
  await expect(zone).toContainText('Choose Files');
});

test('dragging text or links over the zone is ignored', async ({ page }) => {
  const zone = page.getByTestId('file-drop-zone');
  const dt = await dataTransfer(page, [], { text: 'just some text' });
  await zone.dispatchEvent('dragenter', { dataTransfer: dt });
  await expect(zone).not.toHaveClass(/drag-active/);
});

test('dropping files adds them to the list', async ({ page }) => {
  const zone = page.getByTestId('file-drop-zone');
  await zone.dispatchEvent('drop', { dataTransfer: await dataTransfer(page, [{ name: 'report.pdf', type: 'application/pdf' }, { name: 'data.csv' }]) });
  expect(await fileNames(page)).toEqual(['report.pdf', 'data.csv']);
  await expect(zone).not.toHaveClass(/drag-active/);
  await expect(page.locator('#desc-0')).toHaveValue('Work product file: report.pdf');
});

test('everything left out is reported in one message, and valid files still go in', async ({ page }) => {
  const zone = page.getByTestId('file-drop-zone');
  await zone.dispatchEvent('drop', { dataTransfer: await dataTransfer(page, [{ name: 'notes.md' }]) });
  await zone.dispatchEvent('drop', {
    dataTransfer: await dataTransfer(page, [
      { name: 'notes.md' },                                  // duplicate
      { name: 'work.zip', type: 'application/zip' },          // archive
      { name: 'clip.gif', type: 'image/gif' },               // unsupported
      { name: 'huge.txt', size: 20 * 1024 * 1024 + 1 },      // too large
      { name: 'my-folder', folder: true },                   // folder
      { name: 'main.go' },                                   // fine
    ]),
  });
  expect(await fileNames(page)).toEqual(['notes.md', 'main.go']);
  const toasts = page.locator('.toast');
  await expect(toasts).toHaveCount(1);
  const text = await toasts.first().textContent();
  expect(text).toContain('my-folder: folders can\'t be added');
  expect(text).toContain('work.zip: archives are scored 0');
  expect(text).toContain('clip.gif: unsupported file type');
  expect(text).toContain('huge.txt: larger than 20 MB');
  expect(text).toContain('notes.md: already added');
});

test('the 10-file limit is enforced when files are added, not at upload', async ({ page }) => {
  const zone = page.getByTestId('file-drop-zone');
  const specs = Array.from({ length: 12 }, (_, i) => ({ name: `part-${String(i + 1).padStart(2, '0')}.txt` }));
  await zone.dispatchEvent('drop', { dataTransfer: await dataTransfer(page, specs) });
  expect(await fileNames(page)).toHaveLength(10);
  await expect(page.locator('.file-drop-count')).toHaveText('10 of 10 files added. Remove one to add another');
  await expect(page.locator('.toast')).toContainText('part-11.txt and part-12.txt: the limit is 10 files');

  // Removing one frees a slot.
  await page.locator('.btn-remove').first().click();
  await zone.dispatchEvent('drop', { dataTransfer: await dataTransfer(page, [{ name: 'part-11.txt' }]) });
  expect(await fileNames(page)).toHaveLength(10);
  expect(await fileNames(page)).toContain('part-11.txt');
});

test('a file dropped outside the zone is swallowed instead of opening in the browser', async ({ page }) => {
  const prevented = await page.locator('.submit-header').evaluate(target => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'stray.txt', { type: 'text/plain' }));
    const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
    const drop = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    target.dispatchEvent(over);
    target.dispatchEvent(drop);
    return { over: over.defaultPrevented, drop: drop.defaultPrevented };
  });
  expect(prevented).toEqual({ over: true, drop: true });
  await expect(page.locator('.files-list')).toHaveCount(0);
});

test.describe('on a touch device', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'touch emulation (isMobile) is Chromium-only');
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('only the picker is offered', async ({ page }) => {
    await expect(page.locator('.file-drop-drag-text')).toBeHidden();
    await expect(page.locator('.file-drop-button')).toBeVisible();
    await page.locator('#files').setInputFiles([{ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpg') }]);
    expect(await fileNames(page)).toEqual(['photo.jpg']);
  });
});
