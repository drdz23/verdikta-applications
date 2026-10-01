import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { preview } from '../scripts/preview-core.mjs';
import { validatePreview, validateLocalSummary, requestItemIds } from '../scripts/validation.mjs';

const root = new URL('../', import.meta.url);
const json = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const clone = x => structuredClone(x);
const URL_A = 'https://docs.example/brightwater/reference';

// ---- claims: 5 original claims, 3 resolved locally, 2 left for outside work
const example = await json('examples/source-check-v1.request.json');
const original = clone(example);
original.fixture_only = false; original.task_id = 'orig-claims';
original.claims = Array.from({ length: 5 }, (_, i) => ({ claim_id: `C${i + 1}`, text: `Claim number ${i + 1} about Aster API v2.0.` }));
const residualRequest = (ids = ['C3', 'C5']) => ({ ...clone(original), task_id: 'orig-claims-residual', claims: original.claims.filter(c => ids.includes(c.claim_id)) });
const resolvedRow = (item_id, verdict = 'SUPPORTED') => ({ item_id, verdict, value: null, source_url: URL_A, basis: 'The page states it.' });
const summary = (over = {}) => ({
  mode: 'RESIDUAL', independent: false, performed_by: 'AGENT', original_task_id: 'orig-claims', original_item_count: 5,
  method: 'Read the approved pages once.', limitations: 'Not independent verification.',
  resolved: [resolvedRow('C1'), resolvedRow('C2', 'CONTRADICTED'), resolvedRow('C4')],
  residual: [{ item_id: 'C3', reason: 'UNRESOLVED_ABSENT', note: 'No source covers it.' }, { item_id: 'C5', reason: 'CONFLICTING', note: 'Two pages disagree.' }],
  ...over });
const make = (request, local_summary, extra = {}) => preview({ request, sharing_authorized: true, procurement_mode: 'OPEN', local_summary, ...extra });

test('a hybrid draft holds only the residue and keeps local findings beside it', () => {
  const a = make(residualRequest(), summary());
  assert.equal(a.decision, 'PREVIEW');
  assert.deepEqual(a.local_summary, summary());
  assert.deepEqual(requestItemIds('source-check-v1', a.draft.request), ['C3', 'C5']);
  assert.equal('local_summary' in a.draft, false);
  assert.ok(!JSON.stringify(a.draft).includes('The page states it'), 'local basis text must not enter the draft');
  assert.deepEqual(validatePreview(a), []);
  assert.equal(a.can_commission, false); assert.equal(a.funds_moved, false); assert.equal(a.costs.reward_wei, null);
});

test('the onboarding binder re-derives the same draft from the residual request alone', () => {
  const a = make(residualRequest(), summary());
  const fresh = preview({ request: a.draft.request, template_id: a.draft.template_id, sharing_authorized: a.draft.sharing_authorized, procurement_mode: a.draft.procurement.mode, targetHunter: a.draft.procurement.targetHunter });
  assert.ok(isDeepStrictEqual(fresh.draft, a.draft));
});

test('previews without local_summary are unchanged and the shipped examples still validate', async () => {
  const a = make(original, undefined);
  assert.equal('local_summary' in a, false);
  assert.deepEqual(validatePreview(a), []);
  assert.deepEqual(validatePreview(await json('examples/preview.json')), []);
  assert.deepEqual(validatePreview(await json('examples/preview-hybrid.json')), []);
});

test('an inconsistent local_summary sends the draft back for scope instead of emitting it', () => {
  const mutations = {
    'residual request reuses the original task_id': [residualRequest(), summary({ original_task_id: 'orig-claims-residual' })],
    'counts do not add up': [residualRequest(), summary({ original_item_count: 6 })],
    'an item is both resolved and residual': [residualRequest(), summary({ resolved: [resolvedRow('C1'), resolvedRow('C3'), resolvedRow('C4')] })],
    'draft holds more than the residue': [residualRequest(['C3', 'C4', 'C5']), summary()],
    'draft holds less than the residue': [residualRequest(['C3']), summary()],
    'a verdict that does not fit the template': [residualRequest(), summary({ resolved: [resolvedRow('C1', 'FOUND'), resolvedRow('C2'), resolvedRow('C4')] })],
    'duplicate resolved item': [residualRequest(), summary({ resolved: [resolvedRow('C1'), resolvedRow('C1'), resolvedRow('C4')] })],
    'independent review reason without the independence mode': [residualRequest(), summary({ residual: [{ item_id: 'C3', reason: 'INDEPENDENT_REVIEW_REQUESTED' }, { item_id: 'C5', reason: 'CONFLICTING' }] })],
    'local findings presented as independent': [residualRequest(), summary({ independent: true })],
    'nothing left to draft': [residualRequest(['C3', 'C5']), summary({ residual: [], resolved: original.claims.map(c => resolvedRow(c.claim_id)) })],
    'grid_overlap on a claims request': [residualRequest(), summary({ grid_overlap: ['C1'] })],
  };
  for (const [name, [request, local_summary]] of Object.entries(mutations)) {
    const a = make(request, local_summary);
    assert.equal(a.decision, 'NEEDS_SCOPE', name);
    assert.equal(a.draft, null, name);
    assert.equal('local_summary' in a, false, name);
  }
});

test('validatePreview rejects a tampered assessment that preview() would never emit', () => {
  const a = make(residualRequest(), summary());
  for (const tamper of [x => { x.local_summary.independent = true; }, x => { x.local_summary.performed_by = 'SUPPLIER'; }, x => { x.local_summary.resolved.push(resolvedRow('C3')); },
    x => { x.draft.request.claims.pop(); }, x => { delete x.local_summary.method; }, x => { x.local_summary.resolved[0].source_url = 'http://insecure.example/'; }]) {
    const t = clone(a); tamper(t);
    assert.ok(validatePreview(t).length > 0);
  }
});

test('local_summary exists only beside a draft', () => {
  const local = preview({ request: original, sharing_authorized: true, procurement_mode: 'OPEN', local_sufficient: true, local_summary: summary() });
  assert.equal(local.decision, 'LOCAL'); assert.equal('local_summary' in local, false);
  const forced = { ...local, local_summary: summary() };
  assert.ok(validatePreview(forced).length > 0);
  const needsScope = preview({ request: original, procurement_mode: 'OPEN', local_summary: summary() });
  assert.equal(needsScope.decision, 'NEEDS_SCOPE'); assert.equal('local_summary' in needsScope, false);
});

// ---- evidence pack: residue that is not a rectangle is drafted as the smallest grid containing it
const packOriginal = clone(await json('examples/evidence-pack-v1.request.json'));
packOriginal.fixture_only = false; packOriginal.task_id = 'orig-pack';
packOriginal.entities = ['e1', 'e2', 'e3'].map(id => ({ entity_id: id, name: id.toUpperCase() }));
packOriginal.fields = ['f1', 'f2'].map(id => ({ field_id: id, definition: `Field ${id}`, value_type: 'string' }));
const packRequest = (entities, fields) => ({ ...clone(packOriginal), task_id: 'orig-pack-residual', entities: packOriginal.entities.filter(e => entities.includes(e.entity_id)), fields: packOriginal.fields.filter(f => fields.includes(f.field_id)) });
const found = (item_id, value = 'x') => ({ item_id, verdict: 'FOUND', value, source_url: URL_A, basis: 'Listed on the page.' });
const packSummary = (over = {}) => ({
  mode: 'RESIDUAL', independent: false, performed_by: 'AGENT', original_task_id: 'orig-pack', original_item_count: 6,
  method: 'Read each tool page.', limitations: 'Not independent verification.',
  resolved: [found('e1/f1'), found('e1/f2'), found('e2/f2'), found('e3/f1')],
  residual: [{ item_id: 'e2/f1', reason: 'UNRESOLVED_ABSENT' }, { item_id: 'e3/f2', reason: 'CONFLICTING' }],
  grid_overlap: ['e2/f2', 'e3/f1'], ...over });

test('a non-rectangular residue is drafted as the smallest grid, with the overlap cells named', () => {
  const a = make(packRequest(['e2', 'e3'], ['f1', 'f2']), packSummary());
  assert.equal(a.decision, 'PREVIEW');
  assert.deepEqual(validatePreview(a), []);
  assert.equal(make(packRequest(['e2', 'e3'], ['f1', 'f2']), packSummary({ grid_overlap: [] })).decision, 'NEEDS_SCOPE');
  assert.equal(make(packRequest(['e2', 'e3'], ['f1', 'f2']), packSummary({ grid_overlap: ['e2/f2', 'e1/f1'] })).decision, 'NEEDS_SCOPE');
  assert.equal(make(packRequest(['e2', 'e3', 'e1'], ['f1', 'f2']), packSummary()).decision, 'NEEDS_SCOPE');
});

test('a rectangular residue needs no overlap, and FOUND needs a value', () => {
  const row = make(packRequest(['e2'], ['f1', 'f2']), packSummary({
    original_item_count: 6, resolved: [found('e1/f1'), found('e1/f2'), found('e3/f1'), found('e3/f2')],
    residual: [{ item_id: 'e2/f1', reason: 'INACCESSIBLE' }, { item_id: 'e2/f2', reason: 'INACCESSIBLE' }], grid_overlap: undefined }));
  assert.equal(row.decision, 'PREVIEW');
  const noValue = packSummary({ resolved: [{ item_id: 'e1/f1', verdict: 'FOUND', source_url: URL_A, basis: 'x' }, found('e1/f2'), found('e2/f2'), found('e3/f1')] });
  assert.ok(validateLocalSummary(noValue, 'evidence-pack-v1', packRequest(['e2', 'e3'], ['f1', 'f2'])).length > 0);
});

// ---- independence: the owner asked for an outside review, so the whole request goes out
test('an independent review keeps every item in the draft; the local pass is informational', () => {
  const pass = summary({ mode: 'NON_INDEPENDENT_PASS', residual: [], resolved: original.claims.map(c => resolvedRow(c.claim_id)) });
  const a = make(original, pass);
  assert.equal(a.decision, 'PREVIEW');
  assert.deepEqual(requestItemIds('source-check-v1', a.draft.request), original.claims.map(c => c.claim_id));
  assert.deepEqual(validatePreview(a), []);
  assert.match(a.reason, /not independent/);
  for (const bad of [
    summary({ mode: 'NON_INDEPENDENT_PASS', residual: [{ item_id: 'C3', reason: 'UNRESOLVED_ABSENT' }], resolved: [] }),
    summary({ mode: 'NON_INDEPENDENT_PASS', residual: [], resolved: [resolvedRow('C1')], original_task_id: 'something-else' }),
    summary({ mode: 'NON_INDEPENDENT_PASS', residual: [], resolved: [resolvedRow('C9')] })]) {
    assert.equal(make(original, bad).decision, 'NEEDS_SCOPE');
  }
  assert.equal(make(residualRequest(), pass).decision, 'NEEDS_SCOPE', 'a partial request cannot carry a non-independent pass');
});
