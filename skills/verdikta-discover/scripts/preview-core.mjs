import { validateRequest } from './validation.mjs';
import sourceTemplate from '../templates/source-check-v1.template.json' with { type: 'json' };
import packTemplate from '../templates/evidence-pack-v1.template.json' with { type: 'json' };
import sourceRubric from '../templates/source-check-v1.rubric.json' with { type: 'json' };
import packRubric from '../templates/evidence-pack-v1.rubric.json' with { type: 'json' };
export const templates = { 'source-check-v1': sourceTemplate, 'evidence-pack-v1': packTemplate };
const rubrics = { 'source-check-v1': sourceRubric, 'evidence-pack-v1': packRubric };
// Pure assessment of caller-declared context, not an NLP classifier or purchase authority.
export function preview({ request, task_summary = '', template_id, local_sufficient = false,
  sharing_authorized = false, unsuitable_reason = '', handoff_requested = false,
  procurement_mode = 'UNSELECTED', targetHunter = null } = {}) {
  const kind = template_id ?? (request?.claims ? 'source-check-v1' : request?.entities ? 'evidence-pack-v1' : null);
  const errors = validateRequest(kind, request);
  let decision = 'PREVIEW', reason = 'A bounded independent check or parallel research step may be useful.';
  if (unsuitable_reason || (request?.data_classification && request.data_classification !== 'PUBLIC_NON_SENSITIVE')) {
    decision = 'UNSUITABLE'; reason = unsuitable_reason || 'The pilot accepts only public non-sensitive inputs.';
  } else if (local_sufficient === true) {
    decision = 'LOCAL'; reason = 'Available local tools and sources meet the need; coordination and evaluation add unnecessary cost.';
  } else if (sharing_authorized !== true) {
    decision = 'UNSUITABLE'; reason = 'External sharing is not authorized; keep the task local or redact and obtain approval.';
  } else if (errors.length) {
    decision = 'NEEDS_SCOPE'; reason = 'Define or reduce the bounded request before considering outside work.';
  } else if (handoff_requested === true) {
    decision = 'HANDOFF_REQUESTED'; reason = 'Funding requires the separate authorized commissioning path.';
  }
  const targetingErrors = [];
  if (!['UNSELECTED', 'OPEN', 'TARGETED'].includes(procurement_mode)) targetingErrors.push('Select OPEN or TARGETED explicitly');
  if (procurement_mode === 'TARGETED' && (!/^0x[0-9a-fA-F]{40}$/.test(targetHunter || '') || /^0x0{40}$/i.test(targetHunter))) targetingErrors.push('Targeted procurement needs a nonzero supplier wallet address');
  if (procurement_mode !== 'TARGETED' && targetHunter) targetingErrors.push('A supplier address requires TARGETED mode');
  if (targetingErrors.length && ['PREVIEW', 'HANDOFF_REQUESTED'].includes(decision)) { decision = 'NEEDS_SCOPE'; reason = targetingErrors[0]; }
  const template = templates[kind];
  return {
    schema_version: '1.0.0', decision, quote_status: 'DRAFT_NOT_QUOTED', template_id: template ? kind : null,
    network: 'UNSELECTED', reason, task_summary: task_summary || request?.task_id || 'Unscoped task',
    supplier: { status: 'UNKNOWN', candidates: [] }, price_status: 'UNKNOWN', availability_status: 'UNKNOWN',
    costs: { reward_wei: null, buyer_gas_estimate_wei: null, evaluation_prepay_estimate_wei: null, explanation: 'No supplier offer or live fee observation exists in this local preview.' },
    can_commission: false, authorization_granted: false, funds_moved: false,
    procurement: { mode: procurement_mode, targetHunter },
    deliverable: template?.delivery || [], acceptance_criteria: rubrics[kind]?.criteria || [],
    inputs_needed: ['LOCAL','UNSUITABLE'].includes(decision) ? [] : [...errors, ...targetingErrors],
    risks: ['Later publication may expose task data.', 'No supplier, availability, price or SLA is confirmed.', 'Evidence shape does not authenticate sources; independently evaluated settlement is fallible.', 'Finalization and refunds can require separate state-dependent transactions.'],
    commissioning_requirements: template?.required_owner_decisions || ['Define a supported task first'],
    why_outsource: ['Independent checking or missing research capacity', 'Separable work can run in parallel'],
    why_not_outsource: ['Local execution may be simpler', 'Supplier, price and turnaround remain unknown'],
    next_action: decision === 'LOCAL' ? 'Do locally.' : decision === 'UNSUITABLE' ? 'Do not publish or commission this task.' : 'Review the draft; obtain supplier agreement and separately authorize exact funding terms.',
    draft: errors.length ? null : { template_id: kind, request, rubric: rubrics[kind], threshold: template.recommended_threshold },
  };
}
