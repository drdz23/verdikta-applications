// The buyer preview takes a raw request. An agent's assessment input, or a work-order draft saved from this preview or
// printed by the skill's script, belongs in the Create Bounty import instead, which derives or checks the draft with the
// same code. Recognising both lets the preview send the owner there rather than report request-schema errors.
export function workOrderInputKind(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.draft && typeof value.draft === 'object' && 'decision' in value) return 'draft';
  if (value.request && typeof value.request === 'object'
      && ['sharing_authorized', 'procurement_mode', 'local_summary', 'task_summary'].some(key => key in value)) return 'assessment';
  return null;
}
