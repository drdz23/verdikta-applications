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
