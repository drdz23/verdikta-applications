// Optional local handoff from the separate discovery package. No wallet/API activity.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile } from 'node:fs/promises';
export async function applyWorkOrder(config) {
  if (!config.workOrderDraft) return config;
  const raw = await readFile(config.workOrderDraft, 'utf8');
  const digest = createHash('sha256').update(raw).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(config.workOrderDraftSha256 || '') || digest !== config.workOrderDraftSha256) throw new Error('Draft differs from the owner-approved SHA-256 commitment');
  const assessment = JSON.parse(raw), draft = assessment.draft;
  const { validateRequest } = await import('../../verdikta-discover/scripts/validation.mjs');
  const { templates, preview } = await import('../../verdikta-discover/scripts/preview-core.mjs');
  if (assessment.quote_status !== 'DRAFT_NOT_QUOTED' || !['PREVIEW','HANDOFF_REQUESTED'].includes(assessment.decision) || !draft) throw new Error('Only a scoped draft may be handed to commission mode');
  const checked = preview({ request: draft.request, template_id: draft.template_id, sharing_authorized: draft.sharing_authorized, procurement_mode: draft.procurement?.mode, targetHunter: draft.procurement?.targetHunter });
  if (!checked.draft || !isDeepStrictEqual(checked.draft, draft) || !isDeepStrictEqual(assessment.procurement, draft.procurement)) throw new Error('Stored draft does not match a fresh scoped preview');
  if (draft.request.fixture_only) throw new Error('Synthetic requests cannot be commissioned');
  const errors = validateRequest(draft.template_id, draft.request);
  if (errors.length) throw new Error(errors.join('; '));
  if (!templates[draft.template_id] || JSON.stringify(config.rubricJson) !== JSON.stringify(draft.rubric) || config.threshold !== draft.threshold) throw new Error('Review and bind the same draft rubric and threshold');
  if (config.procurementMode !== draft.procurement.mode || (draft.procurement.mode === 'TARGETED' && config.targetHunter?.toLowerCase() !== draft.procurement.targetHunter.toLowerCase())) throw new Error('Procurement changed from the reviewed draft');
  const requestBytes = JSON.stringify(draft.request);
  const requestDigest = createHash('sha256').update(requestBytes).digest('hex');
  // Commit the exact request/criteria content through the existing evaluation package.
  // Limit is checked locally before any upload (current composed-query cap is 10k).
  const description = `${config.description}\n\nApproved work-order draft SHA-256: ${digest}\nService: ${draft.template_id}\nRequest bytes SHA-256 (result.input_sha256): ${requestDigest}\nRequest (exact UTF-8 JSON bytes, no trailing newline):\n${requestBytes}\nDeliver result.json and readable evidence.md. Documented UNRESOLVED results are valid; do not reward contradictions or fabricate cells.`;
  if (description.length > 6000) throw new Error('Work-order instructions exceed the conservative description budget; reduce scope before commissioning');
  return { ...config, description, workOrderDraftSha256: digest };
}
