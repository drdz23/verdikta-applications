// Work-order draft verification and evaluation-description composition, shared by the onboarding
// binder (node) and the website's Create Bounty import (browser). Pure: no network, files,
// environment or node-only imports, and hashing through @noble/hashes (already a dependency).
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { preview } from './preview-core.mjs';
import { validateRequest } from './validation.mjs';

// Conservative cap on the composed evaluation description (the composed-query cap is about 10k).
export const MAX_DESCRIPTION_CHARS = 6000;
const encoder = new TextEncoder();
export const sha256Hex = input => bytesToHex(sha256(typeof input === 'string' ? encoder.encode(input) : input));

/** Structural equality for JSON values; key order does not matter. */
export function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}

/**
 * The draft checks both commissioning paths require, in the order the binder has always run them:
 * an accepted decision and a scoped, unquoted draft; the draft re-derives exactly from a fresh preview
 * of its own request; procurement agrees in both places; no fixture-only request; a valid request.
 * Returns { ok, errors, draft }. Config binding (rubric, threshold, supplier) stays with the caller.
 */
export function checkWorkOrderDraft(assessment) {
  const fail = (...errors) => ({ ok: false, errors, draft: null });
  const draft = assessment?.draft;
  if (assessment?.quote_status !== 'DRAFT_NOT_QUOTED' || !['PREVIEW', 'HANDOFF_REQUESTED'].includes(assessment?.decision) || !draft || typeof draft !== 'object') return fail('Only a scoped draft may be handed to commission mode');
  const checked = preview({ request: draft.request, template_id: draft.template_id, sharing_authorized: draft.sharing_authorized, procurement_mode: draft.procurement?.mode, targetHunter: draft.procurement?.targetHunter });
  if (!checked.draft || !sameJson(checked.draft, draft) || !sameJson(assessment.procurement, draft.procurement)) return fail('Stored draft does not match a fresh scoped preview');
  if (draft.request.fixture_only) return fail('Synthetic requests cannot be commissioned');
  const errors = validateRequest(draft.template_id, draft.request);
  return errors.length ? fail(...errors) : { ok: true, errors: [], draft };
}

/**
 * The evaluation description commits the exact request, so a supplier and the evaluator see the bytes the
 * owner approved. Only draft.request goes in: local findings and market context never do.
 */
export function composeEvaluationDescription({ baseDescription, draftSha256, templateId, request }) {
  const requestBytes = JSON.stringify(request);
  const requestDigest = sha256Hex(requestBytes);
  const description = `${baseDescription}\n\nApproved work-order draft SHA-256: ${draftSha256}\nService: ${templateId}\nRequest bytes SHA-256 (result.input_sha256): ${requestDigest}\nRequest (exact UTF-8 JSON bytes, no trailing newline):\n${requestBytes}\nDeliver result.json and readable evidence.md. Documented UNRESOLVED results are valid; do not reward contradictions or fabricate cells.`;
  if (description.length > MAX_DESCRIPTION_CHARS) throw new Error('Work-order instructions exceed the conservative description budget; reduce scope before commissioning');
  return { description, requestDigest };
}
