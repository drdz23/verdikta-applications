import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { preview } from '../scripts/preview-core.mjs';
import { validatePreview, validateMarketContext } from '../scripts/validation.mjs';

const root = new URL('../', import.meta.url);
const json = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const clone = x => structuredClone(x);
const request = { ...(await json('examples/source-check-v1.request.json')), fixture_only: false, task_id: 'market-test' };
const context = (over = {}) => ({
  source_url: 'https://bounties-testnet.verdikta.org/api/market-summary', fetched_at: '2026-10-01T12:00:00Z', generated_at: '2026-10-01T11:58:00Z',
  network: 'BASE_SEPOLIA', window_days: 30, service_scope: 'source-check-v1', sample_size: 12, not_a_quote: true,
  summary: { open: 4, awarded_in_window: 8, median_bounty_amount_wei: '8000000000000000', p25_bounty_amount_wei: '6000000000000000', p75_bounty_amount_wei: '10000000000000000',
    median_time_to_award_seconds: 11520, median_oracle_prepay_wei: '240000000000000', active_hunters: 5 },
  caveat: 'Past aggregate activity, not a quote, an offer or supplier availability.', ...over });
const make = (extra = {}) => preview({ request, sharing_authorized: true, procurement_mode: 'OPEN', ...extra });

test('market context is carried with its provenance and never becomes a quote', () => {
  const a = make({ market_context: context(), network: 'BASE_SEPOLIA' });
  assert.equal(a.decision, 'PREVIEW');
  assert.deepEqual(a.market_context, context());
  assert.equal(a.network, 'BASE_SEPOLIA');
  assert.equal(a.market_context.not_a_quote, true);
  assert.equal(a.costs.reward_wei, null); assert.equal(a.costs.buyer_gas_estimate_wei, null); assert.equal(a.costs.evaluation_prepay_estimate_wei, null);
  assert.equal(a.price_status, 'UNKNOWN'); assert.equal(a.availability_status, 'UNKNOWN'); assert.equal(a.quote_status, 'DRAFT_NOT_QUOTED');
  assert.equal(a.supplier.status, 'UNKNOWN'); assert.equal(a.can_commission, false);
  assert.deepEqual(validatePreview(a), []);
});

test('the same draft is produced with or without market context', () => {
  const plain = make(), withContext = make({ market_context: context() });
  assert.deepEqual(withContext.draft, plain.draft);
});

test('an invalid context is left out and said so, and never blocks or changes the draft', () => {
  for (const bad of [context({ not_a_quote: false }), context({ not_a_quote: undefined }), context({ network: 'BASE' }), context({ source_url: 'http://bounties-testnet.verdikta.org/api/market-summary' }),
    context({ source_url: 'https://bounties-testnet.verdikta.org/api/jobs?limit=30' }), context({ summary: { median_bounty_amount_wei: '0.008' } }), context({ summary: { reward_wei: '1' } }), context({ fetched_at: 'yesterday' })]) {
    const a = make({ market_context: bad });
    assert.equal(a.decision, 'PREVIEW');
    assert.equal('market_context' in a, false);
    assert.ok(a.inputs_needed.some(m => m.startsWith('Market context omitted')));
    assert.deepEqual(a.draft, make().draft);
  }
});

test('a selected network must match the context, and the public origins carry their own network', () => {
  assert.equal('market_context' in make({ market_context: context(), network: 'BASE' }), false);
  assert.equal('market_context' in make({ market_context: context(), network: 'BASE_SEPOLIA' }), true);
  assert.equal('market_context' in make({ market_context: context() }), true, 'unselected network accepts the context and keeps its own network');
  assert.ok(validateMarketContext(context({ source_url: 'https://bounties.verdikta.org/api/market-summary' })).length > 0);
  assert.deepEqual(validateMarketContext(context({ source_url: 'https://bounties.verdikta.org/api/market-summary', network: 'BASE' })), []);
  assert.deepEqual(validateMarketContext(context({ source_url: 'https://my-own-board.example/api/market-summary' })), [], 'a self-hosted origin may name its network');
});

test('the jobs.txt fallback is accepted only when labelled as a fallback with no window', () => {
  const fallback = context({ source_url: 'https://bounties-testnet.verdikta.org/api/jobs.txt', fallback: 'JOBS_TXT', window_days: null, generated_at: null, service_scope: 'all', sample_size: 4,
    summary: { open: 4, median_bounty_amount_wei: '8000000000000000' } });
  assert.deepEqual(validateMarketContext(fallback), []);
  assert.ok(validateMarketContext({ ...fallback, fallback: undefined }).length > 0);
});

test('a hand-edited assessment cannot carry a quote-shaped or contradictory context', () => {
  const a = make({ market_context: context(), network: 'BASE_SEPOLIA' });
  for (const tamper of [x => { x.market_context.not_a_quote = false; }, x => { x.network = 'BASE'; }, x => { x.costs.reward_wei = '8000000000000000'; }, x => { x.price_status = 'QUOTED'; },
    x => { x.market_context.summary.quote_wei = '1'; }, x => { delete x.market_context.caveat; }]) {
    const t = clone(a); tamper(t);
    assert.ok(validatePreview(t).length > 0);
  }
});

test('the server and the skill agree on the service lines the market summary classifies', () => {
  const require = createRequire(import.meta.url);
  const { classifyService } = require('../../../example-bounty-program/server/utils/marketSummary.js');
  const sha = 'c'.repeat(64);
  const description = `Owner text\n\nApproved work-order draft SHA-256: ${sha}\nService: source-check-v1\nRequest bytes SHA-256 (result.input_sha256): ${sha}\nRequest (exact UTF-8 JSON bytes, no trailing newline):\n{}\nDeliver result.json and readable evidence.md.`;
  assert.equal(classifyService(description), 'source-check-v1');
});
