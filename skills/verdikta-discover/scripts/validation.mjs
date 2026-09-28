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
    if (new Set(row.effort.map(e => e.location)).size < request.source_policy.minimum_locations_per_item && !row.effort.some(e => e.outcome === 'ACCESS_BLOCKED')) errors.push('Minimum search effort not documented');
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
