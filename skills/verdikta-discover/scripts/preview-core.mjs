import { supplierAddress } from './address.mjs';
import { validateRequest, validateLocalSummary, validateMarketContext } from './validation.mjs';
import sourceTemplate from '../templates/source-check-v1.template.json' with { type: 'json' };
import packTemplate from '../templates/evidence-pack-v1.template.json' with { type: 'json' };
import sourceRubric from '../templates/source-check-v1.rubric.json' with { type: 'json' };
import packRubric from '../templates/evidence-pack-v1.rubric.json' with { type: 'json' };
export const templates = { 'source-check-v1': sourceTemplate, 'evidence-pack-v1': packTemplate };
const rubrics = { 'source-check-v1': sourceRubric, 'evidence-pack-v1': packRubric };
// What leaves preview() is the caller's to mutate: never hand out the shared template objects themselves.
const own = value => (value === undefined ? undefined : structuredClone(value));
// Pure assessment of caller-declared context, not an NLP classifier or purchase authority.
export function preview(input = {}) {
  const { request, task_summary = '', template_id, local_sufficient = false,
  sharing_authorized, unsuitable_reason = '', handoff_requested = false,
  procurement_mode = 'UNSELECTED', targetHunter = null, local_summary = null, market_context = null, network = 'UNSELECTED' } = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const kind = template_id ?? (request?.claims ? 'source-check-v1' : request?.entities ? 'evidence-pack-v1' : null);
  const errors = validateRequest(kind, request);
  let decision = 'PREVIEW', reason = local_summary?.mode === 'RESIDUAL'
    ? 'Part of the request was resolved locally by the agent, which is not independent verification. Only the remaining items need outside work.'
    : local_summary?.mode === 'NON_INDEPENDENT_PASS'
      ? 'Independent review was requested, so the whole request goes out. The agent\'s own pass is informational and not independent.'
      : 'A bounded independent check or parallel research step may be useful.';
  if (unsuitable_reason || (request?.data_classification && request.data_classification !== 'PUBLIC_NON_SENSITIVE')) {
    decision = 'UNSUITABLE'; reason = unsuitable_reason || 'The pilot accepts only public non-sensitive inputs.';
  } else if (local_sufficient === true) {
    decision = 'LOCAL'; reason = 'Available local tools and sources meet the need; coordination and evaluation add unnecessary cost.';
  } else if (sharing_authorized !== true) {
    decision = sharing_authorized === false ? 'UNSUITABLE' : 'NEEDS_SCOPE'; reason = sharing_authorized === false ? 'Sharing was declined; keep this task local.' : 'Obtain sharing approval before preparing an external work order.';
  } else if (errors.length) {
    decision = 'NEEDS_SCOPE'; reason = 'Define or reduce the bounded request before considering outside work.';
  } else if (handoff_requested === true) {
    decision = 'HANDOFF_REQUESTED'; reason = 'Funding requires the separate authorized commissioning path.';
  }
  const targetingErrors = [];
  if (!['OPEN', 'TARGETED'].includes(procurement_mode)) targetingErrors.push('Select OPEN or TARGETED explicitly');
  if (procurement_mode === 'TARGETED' && !supplierAddress(targetHunter)) targetingErrors.push('Targeted procurement needs a nonzero 0x-prefixed supplier address with a valid checksum when mixed case');
  if (procurement_mode !== 'TARGETED' && targetHunter) targetingErrors.push('A supplier address requires TARGETED mode');
  if (targetingErrors.length && ['PREVIEW', 'HANDOFF_REQUESTED'].includes(decision)) { decision = 'NEEDS_SCOPE'; reason = targetingErrors[0]; }
  // Local findings travel beside the draft, never inside it. An inconsistent summary means the
  // draft is not trustworthy as written, so it goes back for scope instead of being emitted.
  const localErrors = local_summary && ['PREVIEW', 'HANDOFF_REQUESTED'].includes(decision) && !errors.length && !targetingErrors.length
    ? validateLocalSummary(local_summary, kind, request) : [];
  if (localErrors.length) { decision = 'NEEDS_SCOPE'; reason = localErrors[0]; }
  const template = templates[kind];
  const procurement = { mode: ['OPEN', 'TARGETED'].includes(procurement_mode) ? procurement_mode : 'UNSELECTED', targetHunter: procurement_mode === 'TARGETED' ? supplierAddress(targetHunter) : null };
  const selectedNetwork = ['BASE', 'BASE_SEPOLIA'].includes(network) ? network : 'UNSELECTED';
  // Market context is optional provenance-labelled context. An invalid one is left out (and said so)
  // rather than blocking the draft; it never touches costs, price_status or availability_status.
  const marketErrors = market_context ? validateMarketContext(market_context, selectedNetwork) : [];
  const inputsNeeded = [...errors, ...targetingErrors, ...localErrors, ...marketErrors.map(e => `Market context omitted: ${e}`), ...(sharing_authorized !== true ? ['Obtain sharing approval'] : [])];
  const hasDraft = ['PREVIEW', 'HANDOFF_REQUESTED'].includes(decision) && !errors.length && !targetingErrors.length;
  const residual = hasDraft && local_summary?.mode === 'RESIDUAL';
  return {
    schema_version: '1.0.0', decision, quote_status: 'DRAFT_NOT_QUOTED', template_id: template ? kind : null,
    network: selectedNetwork, reason, task_summary: task_summary || request?.task_id || 'Unscoped task',
    supplier: { status: 'UNKNOWN', candidates: [] }, price_status: 'UNKNOWN', availability_status: 'UNKNOWN',
    costs: { reward_wei: null, buyer_gas_estimate_wei: null, evaluation_prepay_estimate_wei: null, explanation: 'No supplier offer or live fee observation exists in this local preview.' },
    can_commission: false, authorization_granted: false, funds_moved: false,
    procurement,
    deliverable: own(template?.delivery) || [], acceptance_criteria: own(rubrics[kind]?.criteria) || [],
    inputs_needed: ['LOCAL','UNSUITABLE'].includes(decision) ? [] : inputsNeeded,
    risks: ['Later publication may expose task data.', 'No supplier, availability, price or SLA is confirmed.', 'Evidence shape does not authenticate sources; independently evaluated settlement is fallible.', 'Finalization and refunds can require separate state-dependent transactions.'],
    commissioning_requirements: own(template?.required_owner_decisions) || ['Define a supported task first'],
    why_outsource: residual
      ? ['The agent could not settle these items from the sources it could read: unresolved, conflicting or inaccessible', 'Independent adjudication of what the sources leave open']
      : ['Independent checking or missing research capacity', 'Separable work can run in parallel'],
    why_not_outsource: ['Local execution may be simpler', 'Supplier, price and turnaround remain unknown'],
    next_action: decision === 'LOCAL' ? 'Do locally.' : decision === 'UNSUITABLE' ? 'Do not publish or commission this task.' : decision === 'NEEDS_SCOPE' ? 'Resolve the missing inputs before preparing a draft.' : 'Review the draft; obtain supplier agreement and separately authorize exact funding terms.',
    draft: hasDraft ? { template_id: kind, request, procurement, rubric: own(rubrics[kind]), threshold: template.recommended_threshold, sharing_authorized: true } : null,
    ...(hasDraft && local_summary ? { local_summary } : {}),
    ...(market_context && !marketErrors.length ? { market_context } : {}),
  };
}
