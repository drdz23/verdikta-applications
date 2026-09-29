# Commission configuration and recovery

Discovery produces an unquoted request/rubric draft, not a transaction-ready offer. Obtain supplier agreement and owner authorization for these additional terms. Never use fixture-only requests as real deliveries.

For a discovery handoff, install both skill directories and run the discovery package's dependency installation. Compute the exact file SHA-256 after owner review, set `workOrderDraftSha256` to that approved hash, and set `workOrderDraft` in the creator config to the locally exported assessment JSON; copy its rubric/threshold into the owner-reviewed config, then supply actual supplier and price terms. The creator checks the request, rejects fixture-only work, recomputes the preview and binds OPEN/TARGETED intent in both directions, and includes its exact request plus a SHA-256 of the saved draft bytes in the evaluation description. Edits to the draft invalidate recovery identity. No draft grants authorization by itself.

`create_bounty.js --config approved.json` requires:

- title, description, rubricJson and juryNodes (validated against the selected live class).
- classId, threshold (0–100, outside rubricJson), submissionWindowHours (whole hours).
- procurementMode: TARGETED with targetHunter, or deliberately OPEN.
- bountyAmount: decimal ETH string. Optional creatorDeterminationPayment and arbiterDeterminationPayment are decimal ETH strings; bountyAmount must equal their maximum.
- creatorAssessmentWindowSeconds: integer seconds divisible by 3600; zero requires equal payments.
- oracle: maxOracleFee and estimatedBaseCost as integer wei strings; alpha 0–1000; maxFeeBasedScaling 1–1000. Fee must be positive and within the live aggregator ceiling; base cost must be below fee.

Use `examples/creator.json` as a synthetic shape example only. Its jury entries are placeholders: select real currently available models from `/api/classes/:id/models`; the script rejects placeholders. Rubric must-pass weights are zero; scored weights sum to 1 within 0.001. Every criterion needs unique id, description, numeric weight and boolean must. The proposed template threshold 85 is uncalibrated.

The owner-reviewed `VERDIKTA_SPEND_POLICY` JSON has integer wei fields `maxValueWei`, `maxTotalWei`, `maxGasLimit`, `maxFeePerGasWei`, `maxPriorityFeePerGasWei`. The total is a cumulative upper bound on value + execution gas for this process; limits are not a persistent daily ledger. Base's separately charged L1 data fee is not an execution-gas cap. Do not grant ongoing unattended authority through repeated CLI invocations; use the hosted runtime's durable caps for that case. An owner should keep the policy outside model-writable workspace/configuration and review each commissioning intent.

Never use `--yes` or `--confirm-spend` without approval for the specific action. `--yes` suppresses the prompt only after printing the exact transaction and caps. A dry-run still validates destination, chain, code, selector, arguments, gas, and policy, but does not broadcast. To preview a new task without any financial setup, use `verdikta-discover`.

Creation reserves `approved.json.state.json` with exclusive creation before API mutation. Preserve it even on failures. Recovery using `--resume approved.json.state.json` links and independently reads back an already broadcast transaction, or broadcasts a saved API_CREATED descriptor once; it never creates another API job/bounty. API_CREATED without a hash may resume its first broadcast after fresh validation and owner approval; the deadline must still be within 15 minutes of the locally expected window. BROADCAST_PENDING without a hash means manual read-only reconciliation is required. Never remove state to retry a possibly successful creation.

A submission's `--state` file records hunter CID, prepare hash and submission ID. If prepare receipt tracking failed, recover the ID from that hash before using `--resume SUBMISSION_ID`; this confirms tracking (bounded backoff for RPC lag) and starts the same prepared submission. `nextAction` guides waiting and recovery. A deferred payment must be claimed by its recipient through a separately authorized withdrawal, not by submitting more work.

Deployment snapshot changes require maintainer review of live docs, bytecode and source compatibility; a remote address alone is not authorization. Generate ABI and rubric assets with `node scripts/sync_contract_assets.js` from the complete repository after compiling contracts with the secret-free local config.
