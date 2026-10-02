import { supplierAddress } from './address.mjs';
import previewSchema from '../schemas/preview.schema.json' with { type: 'json' };
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import sourceRequest from '../schemas/source-check-v1.request.schema.json' with { type: 'json' };
import sourceResult from '../schemas/source-check-v1.result.schema.json' with { type: 'json' };
import packRequest from '../schemas/evidence-pack-v1.request.schema.json' with { type: 'json' };
import packResult from '../schemas/evidence-pack-v1.result.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validators = {
  'source-check-v1': { request: ajv.compile(sourceRequest), result: ajv.compile(sourceResult) },
  'evidence-pack-v1': { request: ajv.compile(packRequest), result: ajv.compile(packResult) },
};
const previewShape = ajv.compile(previewSchema);
const localSummaryShape = ajv.compile(previewSchema.properties.local_summary);
const marketContextShape = ajv.compile(previewSchema.properties.market_context);
const KNOWN_ORIGINS = { 'bounties.verdikta.org': 'BASE', 'bounties-testnet.verdikta.org': 'BASE_SEPOLIA' };

/**
 * Market context is provenance-labelled aggregate context, never a quote. `network` is the
 * preview's own network ('UNSELECTED' until the owner selects one); a selected network must
 * match the context, and the two public origins must carry their own network.
 */
export function validateMarketContext(context, network = 'UNSELECTED') {
  if (!marketContextShape(context)) return marketContextShape.errors.map(e => `market_context${e.instancePath} ${e.message}`);
  const errors = [], host = new URL(context.source_url).host;
  if (network !== 'UNSELECTED' && context.network !== network) errors.push('market_context network differs from the selected network');
  if (KNOWN_ORIGINS[host] && KNOWN_ORIGINS[host] !== context.network) errors.push('market_context network does not match its source origin');
  if (context.source_url.endsWith('/api/jobs.txt') && context.fallback !== 'JOBS_TXT') errors.push('A jobs.txt context must say fallback JOBS_TXT');
  return errors;
}

// Items a request asks for: claim ids, or "entity_id/field_id" for every cell of an evidence-pack grid.
export function requestItemIds(kind, request) {
  if (kind === 'source-check-v1') return (request?.claims || []).map(c => c.claim_id);
  return (request?.entities || []).flatMap(e => (request?.fields || []).map(f => `${e.entity_id}/${f.field_id}`));
}
const sameSet = (a, b) => a.length === b.length && new Set([...a, ...b]).size === a.length;

/**
 * Local findings are context for the owner, never part of the commissioned request and never
 * independent verification. `request` is the DRAFT request (the residue in RESIDUAL mode, the
 * whole request in NON_INDEPENDENT_PASS mode).
 */
export function validateLocalSummary(summary, kind, request) {
  if (!localSummaryShape(summary)) return localSummaryShape.errors.map(e => `local_summary${e.instancePath} ${e.message}`);
  const errors = [], draftIds = requestItemIds(kind, request);
  const resolved = summary.resolved.map(r => r.item_id), residual = summary.residual.map(r => r.item_id), overlap = summary.grid_overlap || [];
  if (!unique(resolved) || !unique(residual)) errors.push('local_summary lists an item more than once');
  const verdictKinds = kind === 'source-check-v1' ? ['SUPPORTED', 'CONTRADICTED'] : ['FOUND'];
  if (summary.resolved.some(r => !verdictKinds.includes(r.verdict))) errors.push(`local_summary verdicts for ${kind} must be ${verdictKinds.join(' or ')}`);
  if (summary.mode === 'RESIDUAL') {
    if (summary.original_task_id === request?.task_id) errors.push('A residual request needs its own task_id, different from the original');
    if (resolved.some(id => residual.includes(id))) errors.push('An item cannot be both resolved and residual');
    if (resolved.length + residual.length !== summary.original_item_count) errors.push('Resolved plus residual items must equal original_item_count');
    if (kind === 'source-check-v1' && overlap.length) errors.push('grid_overlap applies to evidence packs only');
    if (overlap.some(id => !resolved.includes(id) || residual.includes(id))) errors.push('grid_overlap cells must be resolved locally and not residual');
    if (!sameSet(draftIds, [...residual, ...overlap])) errors.push('The draft request must hold exactly the residual items (plus grid_overlap cells for a non-rectangular residue)');
    if (!residual.length) errors.push('A residual request needs at least one residual item; resolve everything locally with LOCAL instead');
    if (summary.residual.some(r => r.reason === 'INDEPENDENT_REVIEW_REQUESTED')) errors.push('INDEPENDENT_REVIEW_REQUESTED needs mode NON_INDEPENDENT_PASS');
  } else {
    if (summary.original_task_id !== request?.task_id) errors.push('A non-independent pass keeps the original request and task_id');
    if (residual.length || overlap.length) errors.push('A non-independent pass drafts every item: residual and grid_overlap must be empty');
    if (draftIds.length !== summary.original_item_count) errors.push('The draft request must hold every original item');
    if (resolved.some(id => !draftIds.includes(id))) errors.push('A resolved item is not in the draft request');
  }
  return errors;
}

export function validatePreview(assessment) {
  if (!previewShape(assessment)) return previewShape.errors.map(e => `${e.instancePath || '/'} ${e.message}`);
  const errors = [];
  if (assessment.draft) {
    const a = assessment.procurement, b = assessment.draft.procurement;
    if (a.mode !== b.mode || a.targetHunter !== b.targetHunter) errors.push('Draft procurement differs from assessment');
    if (a.mode === 'TARGETED' && !supplierAddress(a.targetHunter)) errors.push('Invalid supplier checksum/address');
    if (assessment.local_summary) errors.push(...validateLocalSummary(assessment.local_summary, assessment.draft.template_id, assessment.draft.request));
  }
  if (assessment.market_context) errors.push(...validateMarketContext(assessment.market_context, assessment.network));
  return errors;
}
const unique = values => new Set(values).size === values.length;
function shape(kind, type, value) {
  const validate = validators[kind]?.[type];
  if (!validate) return ['Select a supported service template'];
  return validate(value) ? [] : validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`);
}
export function validateRequest(kind, request) {
  const errors = shape(kind, 'request', request);
  if (errors.length) return errors;
  const p = request.source_policy;
  if (p.minimum_locations_per_item > new Set(p.allowed_sources).size) errors.push('Minimum locations exceeds the approved source list');
  if (p.minimum_locations_per_item > p.max_search_actions_per_item) errors.push('Search budget is below minimum locations');
  if (kind === 'source-check-v1') {
    if (!unique(request.claims.map(c => c.claim_id))) errors.push('Duplicate claim IDs');
  } else {
    if (!unique(request.entities.map(e => e.entity_id)) || !unique(request.fields.map(f => f.field_id))) errors.push('Duplicate entity/field IDs');
    if (request.entities.length * request.fields.length > 50) errors.push('Maximum 50 entity-field cells');
  }
  return errors;
}
// approvedDigest must be SHA-256 of the exact approved request bytes, never reserialized JSON.
export function validateResult(kind, request, result, approvedDigest, { production = false } = {}) {
  const errors = [...validateRequest(kind, request), ...shape(kind, 'result', result)];
  if (errors.length) return errors;
  if (result.task_id !== request.task_id || result.input_sha256 !== approvedDigest) errors.push('Request identity/digest mismatch');
  if (result.fixture_only !== request.fixture_only) errors.push('Fixture classification mismatch');
  if (production && (request.fixture_only || result.fixture_only || result.sources.some(s => s.provenance === 'SYNTHETIC_FIXTURE'))) errors.push('Synthetic fixtures cannot be commissioned');
  if (result.sources.some(s => !request.source_policy.allowed_sources.includes(s.url))) errors.push('Evidence source is outside the approved URL list');
  const sources = new Set(result.sources.map(s => s.source_id));
  if (sources.size !== result.sources.length) errors.push('Duplicate evidence IDs');
  const claimMode = kind === 'source-check-v1';
  const rows = claimMode ? result.claims : result.cells;
  const key = row => claimMode ? row.claim_id : JSON.stringify([row.entity_id, row.field_id]);
  const expected = new Set(claimMode ? request.claims.map(key) : request.entities.flatMap(e => request.fields.map(f => key({ ...e, ...f }))));
  if (rows.length !== expected.size || !unique(rows.map(key)) || rows.some(r => !expected.has(key(r)))) errors.push('Results must cover exactly the requested items');
  for (const row of rows) {
    const refs = [...row.evidence_ids, ...(row.alternatives || []).flatMap(a => a.evidence_ids)];
    if (refs.some(id => !sources.has(id))) errors.push('Unknown evidence reference');
    if (row.effort.length > request.source_policy.max_search_actions_per_item) errors.push('Search budget exceeded');
    if (row.effort.some(e => !request.source_policy.allowed_sources.includes(e.location))) errors.push('Effort location is outside the approved URL list');
    // A blocked URL counts only for that URL, never for other required locations.
    if (new Set(row.effort.map(e => e.location)).size < request.source_policy.minimum_locations_per_item) errors.push('Minimum search effort not documented');
    for (const effort of row.effort.filter(e => !['ACCESS_BLOCKED', 'NOT_FOUND', 'OUT_OF_SCOPE'].includes(e.outcome))) {
      if (!refs.some(id => result.sources.some(s => s.source_id === id && s.url === effort.location))) errors.push('Inspected effort needs linked source evidence');
    }
    if (claimMode) {
      if (row.original_claim !== request.claims.find(c => c.claim_id === row.claim_id)?.text) errors.push('Original claim changed');
      if (row.version_scope !== request.source_policy.version_scope || row.as_of !== request.source_policy.as_of) errors.push('Scope changed');
    } else {
      const field = request.fields.find(f => f.field_id === row.field_id);
      const values = row.status === 'FOUND' ? [row.value] : row.alternatives.map(a => a.value);
      if (field && values.some(v => typeof v !== field.value_type)) errors.push('Cell value type mismatch');
      if (row.status === 'CONFLICTING' && !unique(values.map(v => JSON.stringify(v)))) errors.push('Conflicting alternatives must differ');
    }
  }
  return errors;
}
