import { test, expect } from '@playwright/test';

// Permissionless classes in the UI: the create wizard accepts a class outside
// the registry (free-text jury, live coverage, blocked only when no arbiter can
// serve it); bounty cards and pages tell hunters about custom classes, single
// operators and creator-operated arbiters. The API is stubbed; every non-GET
// request to the site is recorded so the tests prove nothing is created or sent.

const CREATOR = '0x52908400098527886E0F7030069857D2E4169EE7';
const REGISTRY = [{ id: 128, status: 'ACTIVE', name: 'OpenAI & Anthropic Core', description: 'Core panel' }];
const MODELS_128 = {
  success: true, listed: true, classId: 128, className: 'OpenAI & Anthropic Core', status: 'ACTIVE',
  models: [{ provider: 'openai', model: 'gpt-5.2-2025-12-11' }],
  modelsByProvider: { openai: [{ provider: 'openai', model: 'gpt-5.2-2025-12-11' }] }, limits: null,
};
const unlisted = id => ({ success: true, listed: false, classId: id, className: `Custom class ${id}`, status: 'UNLISTED', models: [], modelsByProvider: {}, limits: null });
const coverage = (id, { eligible = 10, operators = 1, warnings = [] } = {}) => ({
  success: true, classId: id, listed: id === 128, className: id === 128 ? 'Core' : `Custom class ${id}`,
  servable: eligible > 0, refusal: eligible > 0 ? null : `No arbiters are registered for class ${id}, so no evaluation could ever start (the aggregator reverts "No active oracles available"). Arbiter operators register for a class first; create the bounty once its arbiters are live.`,
  coverage: { checked: true, classId: id, totalInClass: eligible, activeInClass: eligible, eligibleCount: eligible, pricedOutCount: 0, distinctOwnersEligible: eligible ? operators : 0, oraclesToPoll: 6, maxOracleFeeEth: '0.00002', creatorOperatedCount: 0 },
  warnings,
});
const job = (jobId, classId) => ({
  jobId, title: `Bounty on class ${classId}`, description: 'Test bounty', status: 'OPEN', classId,
  bountyAmount: '0.01', threshold: 70, creator: CREATOR, submissionCount: 0, submissions: [],
  submissionCloseTime: Math.floor(Date.now() / 1000) + 86400, createdAt: Math.floor(Date.now() / 1000),
  syncedFromBlockchain: true, onChain: true,
  juryNodes: [{ provider: 'MyToolCo', model: 'vision-tool', weight: 1, runs: 1 }],
});
const oracleCheck = (jobId, classId, extra = {}) => ({
  success: true, available: true, jobId, classId, classListed: classId === 128,
  eligibleCount: 10, totalInClass: 10, distinctOwnersEligible: 1, creatorOperatedCount: 0, warnings: [], ...extra,
});

async function stub(page, routes) {
  page.writes = [];
  // Writes to the site's own API. (Chain reads are JSON-RPC POSTs to an RPC host;
  // the route below aborts every non-local request anyway.)
  page.on('request', r => {
    if (r.method() !== 'GET' && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(r.url()).hostname)) page.writes.push(`${r.method()} ${r.url()}`);
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    for (const [pattern, body] of routes) {
      if (pattern instanceof RegExp ? pattern.test(url.pathname) : pattern === url.pathname) {
        return route.fulfill({ json: typeof body === 'function' ? body(url) : body });
      }
    }
    return route.fulfill({ json: {} });
  });
}

test.afterEach(async ({ page }) => { expect(page.writes).toEqual([]); });

const openJuryStep = async page => {
  await page.goto('/create');
  await page.locator('.step', { hasText: 'AI Jury' }).click();
  await expect(page.locator('.class-selector')).toBeVisible();
};
const useCustomClass = async (page, id) => {
  await page.locator('#manual-class-id').fill(String(id));
  await page.getByRole('button', { name: 'Use Class' }).click();
};

test.describe('create wizard', () => {
  test('a registry class keeps model dropdowns and shows live coverage', async ({ page }) => {
    await stub(page, [
      ['/api/classes', { success: true, classes: REGISTRY }],
      ['/api/classes/128/models', MODELS_128],
      ['/api/classes/128/coverage', coverage(128, { eligible: 22, operators: 4 })],
    ]);
    await openJuryStep(page);
    const panel = page.getByTestId('class-coverage');
    await expect(panel).toContainText('22 arbiters can serve class 128 at a 0.00002 ETH fee limit, run by 4 operators.');
    await expect(panel).toHaveClass(/ok/);
    await expect(page.locator('.jury-node select').first()).toBeVisible();
  });

  test('a custom class gets a free-text jury, the registry note and its coverage warnings', async ({ page }) => {
    await stub(page, [
      ['/api/classes', { success: true, classes: REGISTRY }],
      ['/api/classes/128/models', MODELS_128],
      ['/api/classes/128/coverage', coverage(128, { eligible: 22, operators: 4 })],
      ['/api/classes/717/models', unlisted(717)],
      ['/api/classes/717/coverage', coverage(717, { warnings: ['All 10 eligible arbiter(s) in class 717 belong to one operator: no redundancy.'] })],
    ]);
    await openJuryStep(page);
    await useCustomClass(page, 717);
    const panel = page.getByTestId('class-coverage');
    await expect(panel).toContainText("Class 717 isn't in the Verdikta class registry. That's allowed");
    await expect(panel).toContainText('10 arbiters can serve class 717');
    await expect(panel).toContainText('belong to one operator');
    await expect(panel).toHaveClass(/warning/);

    const provider = page.getByLabel('Provider').first();
    const model = page.getByLabel('Model or tool').first();
    await expect(provider).toHaveAttribute('type', 'text');
    await provider.fill('MyToolCo');
    await model.fill('Vision_Tool-V2');
    await expect(provider).toHaveValue('MyToolCo');
    await expect(model).toHaveValue('Vision_Tool-V2');            // typing a provider doesn't reset the model

    await page.getByRole('button', { name: '+ Add Jury Node' }).click();
    await expect(page.getByLabel('Provider')).toHaveCount(2);
    await expect(page.getByLabel('Provider').nth(1)).toHaveValue('');
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });

  test('a class no arbiter can serve is explained and blocks Create', async ({ page }) => {
    await stub(page, [
      ['/api/classes', { success: true, classes: REGISTRY }],
      ['/api/classes/128/models', MODELS_128],
      ['/api/classes/128/coverage', coverage(128, { eligible: 22, operators: 4 })],
      ['/api/classes/4242/models', unlisted(4242)],
      ['/api/classes/4242/coverage', coverage(4242, { eligible: 0 })],
    ]);
    await openJuryStep(page);
    await useCustomClass(page, 4242);
    const panel = page.getByTestId('class-coverage');
    await expect(panel).toContainText('No arbiters are registered for class 4242');
    await expect(panel).toHaveClass(/error/);
    const create = page.locator('button[type="submit"]');
    await expect(create).toBeDisabled();
    await expect(create).toHaveAttribute('title', /No arbiters can serve the selected class/);

    // Switching back to a served class re-enables it.
    await page.locator('.class-card', { hasText: 'OpenAI & Anthropic Core' }).click();
    await expect(panel).toContainText('22 arbiters can serve class 128');
    await expect(create).toBeEnabled();
  });

  test('an older server without the coverage endpoint degrades to no panel', async ({ page }) => {
    await stub(page, [
      ['/api/classes', { success: true, classes: REGISTRY }],
      ['/api/classes/128/models', MODELS_128],
    ]);
    await page.route('**/api/classes/128/coverage', route => route.fulfill({ status: 404, json: { error: 'Not found' } }));
    await openJuryStep(page);
    await expect(page.locator('.jury-node select').first()).toBeVisible();
    await expect(page.getByTestId('class-coverage')).toHaveCount(0);
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });
});

test.describe('what hunters see', () => {
  test('bounty cards badge custom classes only', async ({ page }) => {
    await stub(page, [
      ['/api/classes', { success: true, classes: REGISTRY }],
      ['/api/jobs', { success: true, jobs: [job(9, 717), job(8, 128)] }],
    ]);
    await page.goto('/');
    const custom = page.locator('.bounty-card', { hasText: 'Bounty on class 717' });
    await expect(custom.locator('.badge-custom-class')).toHaveText('Custom class');
    await expect(custom.locator('.badge-custom-class')).toHaveAttribute('title', /Class 717 isn't in the Verdikta class registry/);
    await expect(page.locator('.bounty-card', { hasText: 'Bounty on class 128' }).locator('.badge-custom-class')).toHaveCount(0);
  });

  test('the bounty page names a custom class, its single operator and creator-operated arbiters', async ({ page }) => {
    await stub(page, [
      ['/api/jobs/9', { success: true, job: job(9, 717) }],
      ['/api/jobs/9/oracle-check', oracleCheck(9, 717, { creatorOperatedCount: 10 })],
    ]);
    await page.goto('/bounty/9');
    const note = page.getByTestId('class-trust-note');
    await expect(note).toContainText("Custom class 717: it isn't in the Verdikta class registry, so this jury wasn't checked against a model list. 10 arbiters can evaluate it, run by 1 operator.");
    await expect(note).toContainText("The bounty's creator operates 10 of the 10 arbiters that can evaluate it.");
    await expect(note).toHaveClass(/caution/);
  });

  test('a healthy registry class shows no note', async ({ page }) => {
    await stub(page, [
      ['/api/jobs/8', { success: true, job: job(8, 128) }],
      ['/api/jobs/8/oracle-check', oracleCheck(8, 128, { distinctOwnersEligible: 4, eligibleCount: 22 })],
    ]);
    await page.goto('/bounty/8');
    await expect(page.locator('.jury-section')).toBeVisible();
    await expect(page.getByTestId('class-trust-note')).toHaveCount(0);
  });

  test('without classListed (older server) the class endpoint decides', async ({ page }) => {
    const check = oracleCheck(9, 717);
    delete check.classListed;
    await stub(page, [
      ['/api/jobs/9', { success: true, job: job(9, 717) }],
      ['/api/jobs/9/oracle-check', check],
    ]);
    await page.route('**/api/classes/717/models', route => route.fulfill({ status: 404, json: { error: 'Class not found' } }));
    await page.goto('/bounty/9');
    await expect(page.getByTestId('class-trust-note')).toContainText('Custom class 717');
  });
});
