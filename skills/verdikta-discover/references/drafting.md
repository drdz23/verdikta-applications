# Drafting a work order

Read this only when the decision is a draft: `PREVIEW`, `HANDOFF_REQUESTED`, or a `NEEDS_SCOPE` that lists what is missing. The approval gate in `SKILL.md` applies first.

**Bound the task.** Name the exact item list, version/date scope, output schema, search limits, acceptance rubric and exclusions. An unresolved result is valid only with documented, honest effort against the agreed search plan. Never promise a desired finding.

**Hybrid drafts.** The draft request holds only the residue (unresolved, conflicting, inaccessible or judgment items) under a new `task_id`, keeping the original approved sources. Record what you resolved in `local_summary` (see `preview-format.md`). Local findings are never independent verification and never part of the commissioned request. Never turn an unresolved, conflicting or inaccessible item into a verdict. If the owner asked for an independent review, the whole request goes out and any local pass is a labelled `NON_INDEPENDENT_PASS`.

**Separate a draft from an offer.** A service template is not an available supplier. A bounty listing is a request for work, not proof that a provider can be hired. Never invent a supplier, quote, fee estimate, turnaround or live contract address. Without a verified supplier offer, set availability to `UNKNOWN` or `NONE`, leave monetary amounts null and label the result `DRAFT_NOT_QUOTED`.

**Add market context.** Read `GET /api/market-summary` on the owner-selected origin (`api-read-only.md`) and record it as `market_context`: aggregate counts, medians and time to award, with its source, fetch time, network, window and sample size, always labelled `not_a_quote`. It never fills a price, a quote or availability. If the route fails, use `/api/jobs.txt` (labelled as a fallback) or omit the field and say so. Do not create an account to make a read work.

**Return a compact preview.** The decision line; fit; template and version; scope; needed owner inputs; acceptance criteria; supplier evidence or its absence; fee-estimate provenance or its absence; market context; privacy warning; next step. Use the structure in `preview-format.md`. For a draft, copy the template's rubric and `recommended_threshold` verbatim from `templates/`; the onboarding binder re-derives the draft and requires an exact match. A good answer may be that the owner should do the work locally.

## Handoff, not purchase

Only a separate transactional component, under independently enforced owner authorization, may create and fund a bounty. The handoff keeps the approved task, rubric, deadline, target supplier and budget. Never turn a targeted work order into an open contest silently. Previewing, validating shape and passing a dry-run do not guarantee an award or correctness.
