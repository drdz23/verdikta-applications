import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { preview } from '../../../../skills/verdikta-discover/scripts/preview-core.mjs';
import { inspectDraftBytes, draftToFormPatch, draftDivergence, composeImportedDescription, networkMismatch, MAX_DRAFT_BYTES } from '../../src/utils/workOrderImport.js';
import { rubricWeights } from '../../src/utils/rubricWeights.js';
const require = createRequire(import.meta.url);
const { validateRubric } = require('../../../server/utils/validation.js');

const skill = new URL('../../../../skills/verdikta-discover/', import.meta.url);
const example = JSON.parse(await readFile(new URL('examples/source-check-v1.request.json', skill), 'utf8'));
const request = { ...example, fixture_only: false, task_id: 'import-test' };
const TARGET = '0x52908400098527886E0F7030069857D2E4169EE7';
const bytesOf = a => new TextEncoder().encode(JSON.stringify(a, null, 2));
const open = (extra = {}) => preview({ request: structuredClone(request), task_summary: 'Check three claims', sharing_authorized: true, procurement_mode: 'OPEN', ...extra });
const targeted = () => open({ procurement_mode: 'TARGETED', targetHunter: TARGET });
// The rubric as CreateBounty.buildRubricForUpload() produces it from the form state.
const uploaded = (patch, over = {}) => ({ version: 'rubric-1', title: patch.rubric.title, description: '', threshold: patch.threshold, classId: 128, forbiddenContent: patch.rubric.forbiddenContent,
  criteria: patch.rubric.criteria.map(c => ({ id: c.id, label: c.label, must: c.must, weight: c.weight, description: c.instructions })), ...over });

test('a valid draft is verified from its exact bytes and summarised', () => {
  const bytes = bytesOf(open());
  const r = inspectDraftBytes(bytes);
  assert.equal(r.ok, true); assert.deepEqual(r.errors, []);
  assert.equal(r.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(r.summary, { template_id: 'source-check-v1', template_label: 'Technical claim source check', task_id: 'import-test', items: 3, procurement: { mode: 'OPEN', targetHunter: null }, network: 'UNSELECTED', task_summary: 'Check three claims' });
});

test('the same bytes with different whitespace are a different draft', () => {
  const a = open(), compact = new TextEncoder().encode(JSON.stringify(a));
  assert.equal(inspectDraftBytes(compact).ok, true);
  assert.notEqual(inspectDraftBytes(compact).sha256, inspectDraftBytes(bytesOf(a)).sha256);
});

test('anything that is not a scoped, unquoted, real draft is refused and nothing is imported', () => {
  const refused = {
    'quote status changed': a => { a.quote_status = 'QUOTED'; }, 'decision LOCAL': a => { a.decision = 'LOCAL'; }, 'draft removed': a => { a.draft = null; },
    'fixture-only request': a => { a.draft.request.fixture_only = true; }, 'threshold changed': a => { a.draft.threshold = 10; }, 'rubric edited': a => { a.draft.rubric.criteria[0].label = 'x'; },
    'procurement flipped': a => { a.draft.procurement = { mode: 'TARGETED', targetHunter: TARGET }; }, 'duplicate claim ids': a => { a.draft.request.claims.push(a.draft.request.claims[0]); },
  };
  for (const [name, tamper] of Object.entries(refused)) {
    const a = open(); tamper(a); const r = inspectDraftBytes(bytesOf(a));
    assert.equal(r.ok, false, name); assert.ok(r.errors.length > 0, name); assert.equal(r.draft, null, name);
  }
  const bad = [new Uint8Array(), new TextEncoder().encode('not json'), new TextEncoder().encode('[]'), new Uint8Array([0xff, 0xfe, 0xfd]), new TextEncoder().encode('﻿{}'), null, 'text'];
  for (const b of bad) assert.equal(inspectDraftBytes(b).ok, false);
  assert.equal(inspectDraftBytes(new Uint8Array(MAX_DRAFT_BYTES + 1)).ok, false);
});

test('local findings and market context are shown only when the whole assessment validates', () => {
  const context = { source_url: 'https://bounties-testnet.verdikta.org/api/market-summary', fetched_at: '2026-10-01T12:00:00Z', generated_at: null, network: 'BASE_SEPOLIA', window_days: 30, service_scope: 'all', sample_size: 3, not_a_quote: true, summary: { open: 1 }, caveat: 'Context only.' };
  const good = inspectDraftBytes(bytesOf(open({ market_context: context, network: 'BASE_SEPOLIA' })));
  assert.equal(good.ok, true); assert.deepEqual(good.extras.market_context, context); assert.deepEqual(good.notes, []);
  const a = open(); a.market_context = { ...context, not_a_quote: false };
  const hidden = inspectDraftBytes(bytesOf(a));
  assert.equal(hidden.ok, true, 'the draft itself is still verified'); assert.equal(hidden.extras.market_context, null); assert.equal(hidden.notes.length, 1);
  const b = open(); b.unexpected_section = 'x';
  assert.equal(inspectDraftBytes(bytesOf(b)).extras.market_context, null);
});

test('a draft prefills the rubric, threshold and procurement, and the rubric passes the server validator', () => {
  const imported = inspectDraftBytes(bytesOf(targeted()));
  const patch = draftToFormPatch(imported);
  assert.equal(patch.threshold, 85); assert.equal(patch.targetHunter, TARGET); assert.equal(patch.suggestedTitle, 'Technical claim source check: 3 claims'); assert.equal(patch.baseDescription, 'Check three claims');
  assert.equal(patch.rubric.criteria.length, 6);
  assert.deepEqual(patch.rubric.criteria.map(c => c.instructions), imported.draft.rubric.criteria.map(c => c.description));
  assert.equal(rubricWeights(patch.rubric.criteria).valid, true);
  assert.equal(validateRubric({ criteria: uploaded(patch).criteria }).valid, true);
  assert.equal(draftToFormPatch(inspectDraftBytes(bytesOf(open()))).targetHunter, '');
});

test('divergence: a targeted draft never silently becomes open, an open draft never gains a target, and edits are named', () => {
  const imported = inspectDraftBytes(bytesOf(targeted())), patch = draftToFormPatch(imported);
  const current = (over = {}) => ({ rubric: uploaded(patch), threshold: patch.threshold, targetHunter: patch.targetHunter, ...over });
  assert.deepEqual(draftDivergence(imported.draft, current()), []);
  assert.deepEqual(draftDivergence(imported.draft, current({ threshold: '85' })), [], 'a string threshold from an input is fine');
  assert.deepEqual(draftDivergence(imported.draft, current({ threshold: 70 })), ['threshold']);
  assert.deepEqual(draftDivergence(imported.draft, current({ targetHunter: '' })), ['supplier address']);
  assert.deepEqual(draftDivergence(imported.draft, current({ targetHunter: TARGET.toLowerCase() })), [], 'address case does not matter');
  assert.deepEqual(draftDivergence(imported.draft, current({ targetHunter: '0x1111111111111111111111111111111111111111' })), ['supplier address']);
  const edited = uploaded(patch); edited.criteria[0] = { ...edited.criteria[0], description: 'Weaker.' };
  assert.deepEqual(draftDivergence(imported.draft, current({ rubric: edited })), ['rubric criteria']);
  assert.deepEqual(draftDivergence(imported.draft, current({ rubric: uploaded(patch, { title: 'Renamed' }) })), ['rubric title']);
  assert.deepEqual(draftDivergence(imported.draft, current({ rubric: uploaded(patch, { criteria: uploaded(patch).criteria.slice(1) }) })), ['rubric criteria']);
  const openImported = inspectDraftBytes(bytesOf(open())), openPatch = draftToFormPatch(openImported);
  assert.deepEqual(draftDivergence(openImported.draft, { rubric: uploaded(openPatch), threshold: 85, targetHunter: '' }), []);
  assert.deepEqual(draftDivergence(openImported.draft, { rubric: uploaded(openPatch), threshold: 85, targetHunter: TARGET }), ['supplier (an open draft cannot gain a target)']);
});

test('the description appends exactly the committed block, with the draft hash and only the request', () => {
  const imported = inspectDraftBytes(bytesOf(open()));
  const { description } = composeImportedDescription(imported, 'My own words.');
  assert.ok(description.startsWith('My own words.\n\nApproved work-order draft SHA-256: ' + imported.sha256 + '\nService: source-check-v1\n'));
  assert.ok(description.includes(JSON.stringify(imported.draft.request)));
  const withLocal = open({ request: { ...structuredClone(request), task_id: 'residual', claims: request.claims.slice(2) },
    local_summary: { mode: 'RESIDUAL', independent: false, performed_by: 'AGENT', original_task_id: 'import-test', original_item_count: 3, method: 'm', limitations: 'LOCAL-LIMIT-MARKER',
      resolved: [{ item_id: 'C1', verdict: 'SUPPORTED', value: null, source_url: 'https://docs.example/a', basis: 'LOCAL-BASIS-MARKER' }, { item_id: 'C2', verdict: 'SUPPORTED', value: null, source_url: 'https://docs.example/a', basis: 'b' }],
      residual: [{ item_id: 'C3', reason: 'UNRESOLVED_ABSENT' }] } });
  const hybrid = inspectDraftBytes(bytesOf(withLocal));
  assert.equal(hybrid.ok, true); assert.ok(hybrid.extras.local_summary);
  assert.doesNotMatch(composeImportedDescription(hybrid, 'x').description, /LOCAL-BASIS-MARKER|LOCAL-LIMIT-MARKER|local_summary|"claim_id":"C1"/);
});

test('a selected network that differs from the site is flagged; an unselected one is not', () => {
  assert.equal(networkMismatch('BASE', 'base-sepolia'), true);
  assert.equal(networkMismatch('BASE_SEPOLIA', 'base-sepolia'), false);
  assert.equal(networkMismatch('UNSELECTED', 'base'), false);
  assert.equal(networkMismatch(undefined, 'base'), false);
});
