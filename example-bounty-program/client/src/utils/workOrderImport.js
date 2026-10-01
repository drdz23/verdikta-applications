// Import of a downloaded work-order draft (the .json that `verdikta-discover` or the Agents-page preview
// produces) into the Create Bounty form. Pure and browser-safe: the draft is read locally, verified with the
// skill's own code (the same checks and the same description composition the onboarding binder uses) and turned
// into form values. Nothing is sent anywhere. Load this module lazily: it pulls in AJV, which compiles schemas
// at import time and so needs a CSP that allows evaluation (see the skill's references/install.md).
import { checkWorkOrderDraft, composeEvaluationDescription, sha256Hex, sameJson } from '../../../../skills/verdikta-discover/scripts/work-order.mjs';
import { validatePreview, requestItemIds } from '../../../../skills/verdikta-discover/scripts/validation.mjs';

export const MAX_DRAFT_BYTES = 256 * 1024;
const TEMPLATE_LABEL = { 'source-check-v1': 'Technical claim source check', 'evidence-pack-v1': 'Bounded evidence pack' };
const SITE_NETWORK = { base: 'BASE', 'base-sepolia': 'BASE_SEPOLIA' };

/**
 * Verify draft bytes. The SHA-256 is of the exact bytes, which is what the onboarding binder commits to.
 * Returns { ok, errors, sha256, assessment, draft, summary, extras, notes }.
 */
export function inspectDraftBytes(bytes) {
  const result = { ok: false, errors: [], sha256: null, assessment: null, draft: null, summary: null, extras: { local_summary: null, market_context: null }, notes: [] };
  if (!(bytes instanceof Uint8Array)) { result.errors.push('Choose a work-order draft file or paste its JSON'); return result; }
  if (bytes.length === 0) { result.errors.push('The draft is empty'); return result; }
  if (bytes.length > MAX_DRAFT_BYTES) { result.errors.push(`The draft is larger than ${MAX_DRAFT_BYTES / 1024} KB`); return result; }
  result.sha256 = sha256Hex(bytes);
  let assessment;
  try { assessment = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { result.errors.push('The draft is not valid UTF-8 JSON'); return result; }
  const checked = checkWorkOrderDraft(assessment);
  if (!checked.ok) { result.errors.push(...checked.errors); return result; }
  const { draft } = checked;
  result.assessment = assessment; result.draft = draft;
  result.summary = {
    template_id: draft.template_id, template_label: TEMPLATE_LABEL[draft.template_id] ?? draft.template_id, task_id: draft.request.task_id,
    items: requestItemIds(draft.template_id, draft.request).length, procurement: draft.procurement, network: assessment.network ?? 'UNSELECTED',
    task_summary: typeof assessment.task_summary === 'string' ? assessment.task_summary : '',
  };
  // Local findings and market context are shown for the owner's information only. They are not part of the
  // commissioned request, and they are hidden unless the whole assessment validates.
  const extraErrors = validatePreview(assessment);
  if (extraErrors.length) result.notes.push('The draft is accepted, but other sections of the file failed validation and are not shown.');
  else { result.extras.local_summary = assessment.local_summary ?? null; result.extras.market_context = assessment.market_context ?? null; }
  result.ok = true;
  return result;
}

/** Form values a verified draft prefills. The payout is never prefilled: nothing in a draft is a quote. */
export function draftToFormPatch(imported) {
  const { draft, summary } = imported;
  return {
    threshold: draft.threshold,
    rubric: {
      title: draft.rubric.title, description: '',
      criteria: draft.rubric.criteria.map(c => ({ id: c.id, label: c.label, must: !!c.must, weight: Number(c.weight), instructions: c.description })),
      forbiddenContent: draft.rubric.forbidden_content ?? [],
    },
    targetHunter: draft.procurement.mode === 'TARGETED' ? draft.procurement.targetHunter : '',
    suggestedTitle: `${summary.template_label}: ${summary.items} ${draft.template_id === 'source-check-v1' ? 'claims' : 'cells'}`,
    baseDescription: summary.task_summary,
  };
}

const canonicalCriteria = list => (list || []).map(c => ({ id: c.id, label: c.label, must: !!c.must, weight: Number(c.weight), description: c.description }));

/**
 * What the form currently holds that no longer matches the imported draft. `rubric` is the rubric as the form would
 * upload it. A TARGETED draft can never silently become OPEN, and an OPEN draft can never silently gain a target.
 */
export function draftDivergence(draft, { rubric, threshold, targetHunter }) {
  const issues = [];
  if (Number(threshold) !== draft.threshold) issues.push('threshold');
  if (rubric?.title !== draft.rubric.title) issues.push('rubric title');
  if (!sameJson(canonicalCriteria(rubric?.criteria), canonicalCriteria(draft.rubric.criteria))) issues.push('rubric criteria');
  if (!sameJson(rubric?.forbiddenContent ?? rubric?.forbidden_content ?? [], draft.rubric.forbidden_content ?? [])) issues.push('forbidden content');
  const wanted = draft.procurement.mode === 'TARGETED' ? draft.procurement.targetHunter.toLowerCase() : '';
  if (String(targetHunter || '').toLowerCase() !== wanted) issues.push(draft.procurement.mode === 'TARGETED' ? 'supplier address' : 'supplier (an open draft cannot gain a target)');
  return issues;
}

/** The evaluation description to send: the owner's text plus the committed work-order block. */
export function composeImportedDescription(imported, baseDescription) {
  return composeEvaluationDescription({ baseDescription, draftSha256: imported.sha256, templateId: imported.draft.template_id, request: imported.draft.request });
}

/** A selected network in the draft must be the site's network. */
export function networkMismatch(draftNetwork, siteNetwork) {
  return Boolean(draftNetwork && draftNetwork !== 'UNSELECTED' && SITE_NETWORK[siteNetwork] && SITE_NETWORK[siteNetwork] !== draftNetwork);
}
