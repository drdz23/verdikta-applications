# Preview contract

Return a short explanation and a structured object conforming to the supplied preview schema. The package schema and example are implementation handoff assets, not a newly deployed endpoint.

Required distinctions:
- decision: PREVIEW, LOCAL, NEEDS_SCOPE, UNSUITABLE, or HANDOFF_REQUESTED.
- quote_status: always DRAFT_NOT_QUOTED for this Week 1 offline preview.
- supplier.status: UNKNOWN or NONE until real supply is onboarded. Do not populate a candidate from an unrelated bounty creator or hunter address.
- reward_wei, buyer_gas_estimate_wei, evaluation_prepay_estimate_wei: null unless actually established; this preview leaves them null.
- can_commission: false. authorization_granted: false. funds_moved: false.
- network: UNSELECTED unless the owner explicitly selects BASE or BASE_SEPOLIA.
- risks: include public-data exposure on later publication, uncertain supplier/fees, subjective judgment limitations, and non-immediate refund/finalization behavior where relevant.

A useful next action is to finish the bounded work specification or obtain a real supplier offer. It is not "fund this wallet to continue browsing."

- procurement: explicit OPEN or TARGETED (UNSELECTED means missing scope), with a canonical supplier address only for TARGETED.
- draft: null unless PREVIEW/HANDOFF_REQUESTED has complete, approved scope. A draft contains the request, template, rubric, threshold, sharing approval and the same procurement as the assessment. JSON Schema enforces shape and mode consistency; `validatePreview` additionally verifies exact target equality and checksum.
- Honest NOT_FOUND or OUT_OF_SCOPE effort at an approved URL may have no source citation. Inspected evidence must have a linked source; all effort still counts only for its own approved URL and minimum locations must be met.

## Hybrid outcome: `local_summary`

When the agent resolves part of a request itself and drafts outside work only for the rest, the decision stays `PREVIEW` and the assessment carries an optional top-level `local_summary` beside `draft` (never inside it). State it on the decision line: `Decision: PREVIEW (hybrid: 6 resolved locally, 4 drafted)`.

- `mode: "RESIDUAL"`: resolved items are removed. The draft `request` holds exactly the `residual` items, under a new `task_id`, keeping the original approved sources. `resolved + residual` must equal `original_item_count`. For an evidence pack whose residue is not a rectangle, draft the smallest entity x field grid containing it and list the already-resolved cells inside it in `grid_overlap`.
- `mode: "NON_INDEPENDENT_PASS"`: the owner asked for an independent, outside or second-opinion review, so every item stays in the draft request (same `task_id`) and `residual` is empty. The local pass is informational.
- Always `independent: false` and `performed_by: "AGENT"`. Local findings are context for the owner. They are never independent verification and never part of the commissioned request: the onboarding binder and the website build the evaluation description from `draft.request` only.
- Each resolved item cites a `source_url` and a short `basis`. A `FOUND` cell needs its `value`. Residual reasons: `UNRESOLVED_ABSENT` (readable sources are silent), `CONFLICTING` (two sources disagree), `INACCESSIBLE`, `NEEDS_JUDGMENT`.
- Never turn an unresolved, conflicting or inaccessible item into a verdict. If everything is answerable and the owner wants answers, the decision is `LOCAL` with no draft. `validatePreview` and `preview()` enforce these invariants and send an inconsistent draft back as `NEEDS_SCOPE`.
- See `examples/preview-hybrid.json`.
