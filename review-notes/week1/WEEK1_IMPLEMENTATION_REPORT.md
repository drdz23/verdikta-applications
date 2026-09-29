# Historical implementation snapshot

This is archived review evidence, outside the published documentation tree. Counts and inventory below describe earlier commits. See PR review responses for current validation.

# Week 1 agent-buyer implementation report

Implementation originally validated locally on `feat/week1-agent-buyer`. At the owner’s subsequent request, the work is being submitted as two stacked review PRs: `feat/buyer-discovery-preview` (discovery and UI), then `feat/week1-agent-buyer` (execution, validation and this report). No deployment or registry publication was performed. Native-agent eligibility and model-selection release gates remain unverified; this report does not claim end-to-end market activation.

## 1. Implemented

Only `verdikta-applications` was changed. `verdikta-agents` was a read-only reference; its existing dirty files were left alone.

- `skills/verdikta-discover/`: portable task-oriented skill; local CLI and browser-compatible preview core; AJV 2020-12 request/result validation; both service definitions, rubrics, schemas and explicitly synthetic examples; supplied 30-case behavior protocol; executable structural tests. No signing, environment/configuration loader, API client, wallet import or network call in preview.
- `skills/verdikta-bounties-onboarding/scripts/`: generated escrow/lens ABI and reviewed-deployment candidate snapshots; deterministic creation/target/deadline/calldata guards; mandatory owner policy; safe financial dry-run; create/submission recovery state; ETH-prepay submission lifecycle; state-driven finalize/force-fail/refund/creator approval; explicit close/withdraw maintenance. Obsolete minimal executors fail with a retirement error. Onboarding/funding no longer requires LINK.
- `scripts/_work-order.js`: optional `workOrderDraft` handoff validates the local draft, rejects synthetic commissioning, binds the same target/rubric/threshold, and includes request bytes plus SHA-256 commitments in the evaluation description. Changing the draft breaks recovery identity.
- `client/src/components/BuyerPreview.{jsx,css}`, `pages/Agents.jsx`, `pages/Skills.jsx`: focused wallet-free preview panel, two templates, explicit OPEN/TARGETED supplier selection, local/unsuitable decisions and local JSON download; existing bounty board preserved.
- `client/playwright.buyer.config.js` and `tests/e2e/start-buyer-server.mjs`: self-contained, secret-free browser test fixture with dummy public addresses; the test server stops after the run.
- `client/src/utils/rubricWeights.js`, `pages/CreateBounty.jsx`: weight feedback aligned with the current server convention, including zero-weight must-pass gates and 0.001 scored-weight tolerance.
- `server/routes/agentRoutes.js`: buyer entry in public agent documentation, with explicit draft/commission separation and independently verified transaction descriptors.
- `server/routes/jobRoutes.js`, `utils/validation.js`: explicit procurement intent fails closed; preserve new bounty ETH amount strings through persistence; malformed rubric criteria/non-finite weights return validation failures. Procurement mode remains optional, but address validation now requires prefixed checksum-valid hex.
- `server/test/buyerTemplates.test.js`, corrected `test/sample-rubric.json`: canonical validator checks for the supplied templates and creator fixture.
- `onchain/hardhat.local.cjs`: local compilation/tests without deployment secrets. No Solidity change.
- Updated skill docs, metadata and publication file allowlist; new release files are local only. ABI/rubric generation is reproducible via `sync_contract_assets.js`, and tests compare generated assets with current source/artifacts.

Full file inventory is in section 9. The handoff ZIP was extracted outside both repositories to `../.week1-handoff/` and was not moved or committed.

Workflow: read repository instructions and the canonical backlog guide; searched all applications issues, open PRs, and organization buyer/activation issues. Applications #23 (Resolution Preflight) is adjacent, not a canonical Week 1 buyer-activation issue. PR #8 touches the old submission wrapper and still describes an obsolete approve stage; this change overlaps that file and should be reconciled during review. No matching Ready issue was established. Local implementation proceeded under the user's explicit exception; no issue was created, closed, assigned, or given invented Project state.

## 2. Discovery/preview behavior

These are executed deterministic examples using caller-declared context, not measured LLM selection outcomes:

| Task/context | Output | Why |
| --- | --- | --- |
| Independently check the supplied bounded technical claims; public sharing authorized | PREVIEW / DRAFT_NOT_QUOTED | An independent check or parallel research step may help |
| Alphabetize five names; available local tools suffice | LOCAL / DRAFT_NOT_QUOTED | No external coordination or sharing authorization is needed |
| External sharing is unauthorized, or request declares sensitive data | UNSUITABLE / DRAFT_NOT_QUOTED | Do not publish or commission; redact/obtain approval or work locally |

Every output leaves supplier/price/availability UNKNOWN, reward and fee observations null, and `can_commission`, `authorization_granted`, `funds_moved` false. A selected template never authorizes purchase. Request scope errors yield NEEDS_SCOPE; an explicit financial handoff can yield HANDOFF_REQUESTED but still has no authority.

Run from the repository root:

```sh
node skills/verdikta-discover/scripts/preview.mjs skills/verdikta-discover/examples/assessment.json
```

Claim results include original claim, verdict, scope/date, evidence references, explanation, effort and unresolved reason. Evidence cells support FOUND, CONFLICTING and null/UNRESOLVED with evidence/effort. Validators enforce limits, IDs, exact coverage, types, approved source URLs, evidence resolution and exact request-byte digest binding. These checks do not authenticate publishers or prove semantic conclusions. The pilot's threshold 85 is a proposal, not calibrated quality evidence.

## 3. Compatibility audit

| Area | Old/problematic assumption | Current verified behavior | Fix/action |
| --- | --- | --- | --- |
| Discovery eligibility | Wallet env gate on the sole skill | Existing onboarding metadata still has four required wallet/config vars | Separate ungated discovery skill; financial skill remains separate |
| createBounty | Five positional arguments | Current Solidity and live docs use one CreateParams tuple with nested oracle tuple | Generated merged ABI; local exact re-encoding verifies every field/value |
| Escrow address | Old hardcoded addresses and override bypass | Live docs: Base 8453 `0xA741eFf41Bcf14793E61CEbB4179E05C9124D3f6`; Base Sepolia 84532 `0x1B4F0e43256d435DfcD5C0883799F0Eb3943e08f` | Snapshot pins addresses/runtime hashes; live docs/RPC must agree; no silent fallback or arbitrary override |
| targetHunter | Creator forced zero | Contract supports a specific supplier; zero intentionally opens bounty | Explicit OPEN/TARGETED config; invalid/missing targeted address rejected in CLI and explicit API mode |
| Deadline | Recomputed from client clock | API job persists submissionOpenTime/submissionCloseTime in Unix seconds | Bind exact persisted deadline, validate requested duration; no new deadline invented |
| Submission prepare | Eight args and hunter oracle parameters | Exactly `(bountyId, evaluationCid, hunterCid)` | Remove obsolete fee/addendum inputs; reject legacy flags; independently verify nested transaction |
| ETH prepay | Prepare-time budget fixed / LINK approval assumptions | Start checks LIVE requiredPrepay; creator oracle settings clamp against current ceiling | Read live value again before signing and enforce owner cap; no LINK stage |
| Finalize | Passing evaluation implies paid; stale event | nextAction distinguishes waits, finalize and force-fail; paid and passed are separate event fields | One resolving action per call, no false payout promise; matching receipt events only |
| Timeout/refund | Local timer and automatic immediate refunds | Aggregator state gates timeout; RefundDeferred / PaymentDeferred need later recovery | State-driven recovery; explicit guarded withdraw/close; no blind retry/duplicate prepare |
| Events/decoding | Budget after CID; old large submission tuple | SubmissionPrepared puts ethMaxBudget BEFORE evaluationCid; current submission tuple has 12 fields including funder | Generated escrow + lens ABI; event field order and tuple regression tests |
| Financial dry-run | Early exit offered no exact transaction | New draft preview is separate; financial simulation requires a concrete descriptor/CID | No upload/state mutation/broadcast in dry-run; exact chain/destination/value/calldata/gas/policy review |
| Rubric validation | Nonzero must weights, absent must fields, embedded threshold; UI tolerance mismatch | Must-pass weight zero, valid IDs/description/must, scored sum 1 within 0.001 (all-zero allowed by current server), threshold separate | Fixed active examples/templates/UI; generated canonical creator validator with drift test |
| Reference document | Older agents document treated as unquestionable ground truth | `verdikta-agents/docs/verdikta_bounty_surface.md` still describes positional/legacy layouts in places | Current applications source, compiled artifacts, live docs and bytecode used; reference repo unchanged |

Live evidence is recorded in `review-notes/week1/week1-live-verification.json`. GET `/api/docs` succeeded on both networks and mainnet `/agents.txt` succeeded. Freshly compiled escrow runtime matches deployed runtime on both networks after masking constructor immutables and compiler metadata. getBounty, requiredPrepay, effectiveOracleParams and lens reads succeeded; mainnet getSubmission decoded the current 12-field tuple and nextAction returned DONE for the sampled submission. Sampled requiredPrepay was 240000000000000 wei on both networks at observation time; this is not a quote for future work. Default public RPC rate limits were resolved using alternative public read-only RPCs, without bypassing any transaction guard.

Both `/api/classes` and `/api/classes/128/models` returned HTTP 401 without credentials. No API key was loaded to bypass this; current available models remain unverified. Executor checks them using its separately configured identity before creating API state.

## 4. Tests run

Commands are shown with their working directory. Final pass counts are below; failed intermediate attempts are recorded separately.

| Category / working directory | Command | Final result (pass / fail / skipped) |
| --- | --- | --- |
| Discovery unit/structural/templates, repo root | `node --test skills/verdikta-discover/tests/*.test.mjs` | 16 / 0 / 0 |
| Transaction compatibility/executor/handoff, repo root | `node --test skills/verdikta-bounties-onboarding/scripts/test/*.test.js` | 14 / 0 / 0 |
| Client unit, repo root | `node --test example-bounty-program/client/tests/unit/*.test.js` | 1 / 0 / 0 |
| Server, example-bounty-program/server | `node node_modules/jest/bin/jest.js --runInBand` | 165 / 0 / 0, 16 suites |
| Contract compile, example-bounty-program/onchain | `node node_modules/hardhat/internal/cli/cli.js compile --config hardhat.local.cjs` | 11 Solidity files compiled; exit 0 |
| Contract tests, same directory | `node node_modules/hardhat/internal/cli/cli.js test --config hardhat.local.cjs` | 246 / 0 / 0 |
| Browser, example-bounty-program/client | `PLAYWRIGHT_BROWSERS_PATH=/tmp/verdikta-playwright node node_modules/@playwright/test/cli.js test --config playwright.buyer.config.js --reporter=list` | 3 / 0 / 0; external requests blocked, POST count 0 |
| Client build, same directory | `node --input-type=module` calling Vite `build({envDir:false,mode:'week1'})` | exit 0; 2173 modules, existing large-chunk warning |
| Client focused lint, same directory | `node node_modules/eslint/bin/eslint.js src/components/BuyerPreview.jsx src/utils/rubricWeights.js` | exit 0; no errors |
| Skill metadata, repo root | `python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/verdikta-discover` | 1 validation passed |
| Adapted artifact checks, repo root | `python3 skills/verdikta-discover/tests/validate_package.py` | 57 / 0 / 0; NOT native/model tests |
| Original handoff artifact checks, parent workspace | `python3 .week1-handoff/verdikta-week1/tests/validate_package.py` | 61 / 0 / 0; NOT native/model tests |
| JS syntax | `node --check` for onboarding `.js` and discovery `.mjs` files | 24 files passed; creator checked again after final recovery guard |
| Local packaging, discovery directory | `npm --cache /tmp/verdikta-npm-cache pack --dry-run --ignore-scripts --json` | exit 0; no publication |
| Self-review | `git diff --check`; changed-file private-key/credential-assignment scan | exit 0; no detected secret assignments; ZIP not tracked |
| Live verification | unauthenticated curl GETs; `/tmp/verdikta-probe.cjs`, `/tmp/verdikta-live-check.cjs`, `/tmp/verdikta-code-compare.cjs` | docs/bytecode/views verified; class endpoints 401; no transaction |

Intermediate failures, resolved before final results: preview interception initially blocked Node's own module reads (restricted package code reads then allowed); compatibility test initially lacked installed ethers and then had one wrong artifact-relative path (fixed); first server run aborted with sandbox EPERM on Supertest's local listener (passed with permitted local sockets); first client build lacked locked `marked` dependency (restored with npm ci); browser launch initially lacked Chromium (installed only in /tmp), then dummy Vite test variables were incorrectly supplied (fixed test server); an initial harness command used the wrong working-directory prefix (corrected before running the checked-in harness); npm pack initially could not write the user cache (used a temporary cache). RPC -32016 rate limits are recorded above. None of these failed attempts is counted as a pass.

Dependency installs used `--ignore-scripts`. Existing lockfile audits reported client 19 findings and onboarding 2; no broad unrelated dependency upgrade was attempted. Discovery dependencies reported 0 findings. Jest prints an existing open-handle warning but exited successfully. Browser layout was inspected using a local screenshot.

### PR preparation validation

Both commits were rebased cleanly onto `origin/main` at PR preparation. The combined branch was revalidated: discovery/execution/client unit tests 31 passed; server tests 181 passed across 17 suites (main added tests since the original 165-test run); buyer browser tests 3 passed; client build passed. Jest retained its existing open-handle warning and exited successfully. Contract source did not change between the original baseline and the new main; the earlier 246-test contract result was not rerun. Original counts above describe the initial implementation run, not the rebased run.

Independent validation of the discovery-only branch initially exposed a test import of the follow-up PR’s generated rubric module. The test now imports the canonical server validator directly; the discovery-only branch then passed all 16 discovery tests, 3 browser tests and the client build. This removes the reverse dependency between PRs.

PR review order is discovery/UI first, then execution/validation. The second PR targets the discovery branch to show only its incremental changes; after the first merges, retarget/rebase the second onto main. Existing PR #8 overlaps the submission script; review that overlap before merging. No canonical issue is auto-closed by either PR.

## 5. Tests not run

- OpenClaw native discovery: NOT RUN — executable/runtime unavailable on PATH.
- Hermes native discovery: NOT RUN — executable/runtime unavailable on PATH.
- Model-behavior sessions (30 supplied cases plus holdouts): NOT RUN — no isolated native runtime/model test harness provisioned for these cases. Expected labels were not relabeled as observations. Deterministic preview decision tests are not model-behavior tests.
- Authenticated class/model availability: NOT VERIFIED — public GETs returned 401; loading owner credentials was not authorized for this implementation.
- Funded buyer/supplier end-to-end, bot registration, production writes: NOT RUN — explicitly out of scope. Contract tests used local fixture accounts only.
- Published skill loader/registry tests: NOT RUN — no publication was authorized.
- Existing unrelated client home/header suite was not run; the three focused buyer browser tests and affected rubric unit test were run.

## 6. Security review

No secrets were added or logged; no real wallet was provisioned; no real funds were spent; no live bounty or bot was created; no production infrastructure, issue state or registry was changed; no handoff ZIP was committed. Existing wallet encryption and separate execution authorization remain. New transaction checks add mandatory caps, current chain/destination/code/selector checks and exact argument/value validation. No financial guard was deliberately weakened. Preview cannot reach signing through its dependency graph.

Financial limits are explicit: the CLI policy bounds transaction value, EIP-1559 execution gas and cumulative execution cost within one process. Base L1 data fees are separately charged and are NOT a hard all-in ceiling; the review states this. These scripts are per-invocation authorized tools, not a replacement for the hosted runtime's persistent daily policy ledger. Keep owner policy outside agent-writable storage and do not interpret repeated `--yes` executions as a durable autonomous grant. This limitation needs operator review before funded use.

Result schema/evidence validation is structural, not source authentication or a calibrated evaluator guarantee. Public work may be exposed by later commissioning. New deployment snapshots need maintainer review before funded use; drift stops rather than adopting an arbitrary remote destination.

## 7. Remaining Week 1 blockers

Native eligibility and actual model skill-selection behavior remain external acceptance gates because the required runtimes/harness are unavailable. A matching canonical Ready issue was not established; the user authorized local implementation despite that workflow gap. Class/model availability cannot be claimed without an authorized authenticated check. No live supplier, price or SLA exists in this implementation, by design; that is not represented as a completed marketplace.

## 8. Operator QA before merge/deployment

1. Review the branch and adjacent issue #23 / overlapping PR #8; establish the canonical issue and real readiness without duplicate intake or bulk metadata changes.
2. Install discovery dependencies and run its tests/CLI from a fresh temporary HOME with no Verdikta configuration. Confirm DRAFT_NOT_QUOTED and null costs for both templates, LOCAL for trivial work, UNSUITABLE for unauthorized sharing.
3. Open `/agents#buyer-preview` and `/skills` with no wallet extension. Preview both synthetic templates, malformed JSON and local-work cases; confirm no task upload or wallet prompt; download the local draft.
4. Run native OpenClaw/Hermes empty-config eligibility and the supplied blind 30-case protocol/holdouts. Keep all mutation/signing tools mocked and denied; record actual traces separately from structural checks.
5. Review deployment snapshots and reproduce source/ABI/bytecode checks. An authenticated operator should inspect current class/model availability without registering a bot or funding a bounty.
6. Review real supplier agreement, non-fixture request, exact target/payment/threshold/deadline/oracle settings and owner policy. Understand the Base L1-fee and per-process limit boundary. Test concrete financial dry-runs with a saved descriptor; prove target, chain, destination, CID, deadline, prepay and cap mismatches stop before signing.
7. Verify saved-state resume/link recovery does not create a second job, and state-driven timeout/refund/withdraw behavior is understood. Funded tests and deployment require a separately authorized pilot; do not merge or deploy as part of this task.

## 9. Git status

The inventory below records the original pre-commit implementation snapshot. The subsequent PR preparation separates discovery/UI from execution/validation into two commits and review branches. Nothing has been merged, deployed or published to a skill registry.

`example-bounty-program/server/scripts/start-server.sh` was untracked before the task and remains untouched. `verdikta-agents` has pre-existing changes in `apps/web/next-env.d.ts`, `docs/phase4_setup_notes.md`, and two runtime seed scripts; none was modified by this task.

Changed/untracked files at report generation (`M` modified, `??` untracked):

```text
 M example-bounty-program/client/package-lock.json
 M example-bounty-program/client/package.json
 M example-bounty-program/client/src/pages/Agents.jsx
 M example-bounty-program/client/src/pages/CreateBounty.jsx
 M example-bounty-program/client/src/pages/Skills.jsx
 M example-bounty-program/client/vite.config.js
 M example-bounty-program/server/routes/agentRoutes.js
 M example-bounty-program/server/routes/jobRoutes.js
 M example-bounty-program/server/test/sample-rubric.json
 M example-bounty-program/server/utils/validation.js
 M skills/verdikta-bounties-onboarding/README.md
 M skills/verdikta-bounties-onboarding/SKILL.md
 M skills/verdikta-bounties-onboarding/_meta.json
 M skills/verdikta-bounties-onboarding/publish.sh
 M skills/verdikta-bounties-onboarding/references/api_endpoints.md
 M skills/verdikta-bounties-onboarding/references/classes-models-and-agent-api.md
 M skills/verdikta-bounties-onboarding/references/funding.md
 M skills/verdikta-bounties-onboarding/references/security.md
 M skills/verdikta-bounties-onboarding/scripts/_lib.js
 M skills/verdikta-bounties-onboarding/scripts/bounty_worker_min.js
 M skills/verdikta-bounties-onboarding/scripts/claim_bounty.js
 M skills/verdikta-bounties-onboarding/scripts/create_bounty.js
 M skills/verdikta-bounties-onboarding/scripts/create_bounty_min.js
 M skills/verdikta-bounties-onboarding/scripts/funding_check.js
 M skills/verdikta-bounties-onboarding/scripts/onboard.js
 M skills/verdikta-bounties-onboarding/scripts/package.json
 M skills/verdikta-bounties-onboarding/scripts/preflight.js
 M skills/verdikta-bounties-onboarding/scripts/submit_to_bounty.js
?? docs/WEEK1_IMPLEMENTATION_REPORT.md
?? review-notes/week1/week1-live-verification.json
?? example-bounty-program/client/playwright.buyer.config.js
?? example-bounty-program/client/src/components/BuyerPreview.css
?? example-bounty-program/client/src/components/BuyerPreview.jsx
?? example-bounty-program/client/src/utils/rubricWeights.js
?? example-bounty-program/client/tests/e2e/buyer-preview.spec.js
?? example-bounty-program/client/tests/e2e/start-buyer-server.mjs
?? example-bounty-program/client/tests/unit/rubricWeights.test.js
?? example-bounty-program/onchain/hardhat.local.cjs
?? example-bounty-program/server/scripts/start-server.sh
?? example-bounty-program/server/test/buyerTemplates.test.js
?? skills/verdikta-bounties-onboarding/examples/creator.json
?? skills/verdikta-bounties-onboarding/references/commission.md
?? skills/verdikta-bounties-onboarding/scripts/_executor.js
?? skills/verdikta-bounties-onboarding/scripts/_transaction-guards.js
?? skills/verdikta-bounties-onboarding/scripts/_work-order.js
?? skills/verdikta-bounties-onboarding/scripts/bounty-escrow.abi.json
?? skills/verdikta-bounties-onboarding/scripts/deployments.json
?? skills/verdikta-bounties-onboarding/scripts/recover_funds.js
?? skills/verdikta-bounties-onboarding/scripts/rubric.cjs
?? skills/verdikta-bounties-onboarding/scripts/sync_contract_assets.js
?? skills/verdikta-bounties-onboarding/scripts/test/compatibility.test.js
?? skills/verdikta-bounties-onboarding/scripts/test/executor.test.js
?? skills/verdikta-bounties-onboarding/scripts/test/work-order.test.js
?? skills/verdikta-discover/SKILL.md
?? skills/verdikta-discover/examples/assessment.json
?? skills/verdikta-discover/examples/evidence-pack-v1.request.json
?? skills/verdikta-discover/examples/evidence-pack-v1.result.json
?? skills/verdikta-discover/examples/fixture-source.txt
?? skills/verdikta-discover/examples/preview.json
?? skills/verdikta-discover/examples/source-check-v1.request.json
?? skills/verdikta-discover/examples/source-check-v1.result.json
?? skills/verdikta-discover/package-lock.json
?? skills/verdikta-discover/package.json
?? skills/verdikta-discover/references/api-read-only.md
?? skills/verdikta-discover/references/preview-format.md
?? skills/verdikta-discover/references/service-templates.md
?? skills/verdikta-discover/schemas/evidence-pack-v1.request.schema.json
?? skills/verdikta-discover/schemas/evidence-pack-v1.result.schema.json
?? skills/verdikta-discover/schemas/preview.schema.json
?? skills/verdikta-discover/schemas/source-check-v1.request.schema.json
?? skills/verdikta-discover/schemas/source-check-v1.result.schema.json
?? skills/verdikta-discover/scripts/preview-core.mjs
?? skills/verdikta-discover/scripts/preview.mjs
?? skills/verdikta-discover/scripts/validation.mjs
?? skills/verdikta-discover/templates/evidence-pack-v1.rubric.json
?? skills/verdikta-discover/templates/evidence-pack-v1.template.json
?? skills/verdikta-discover/templates/source-check-v1.rubric.json
?? skills/verdikta-discover/templates/source-check-v1.template.json
?? skills/verdikta-discover/tests/EVALUATION_PROTOCOL.md
?? skills/verdikta-discover/tests/behavior-cases.json
?? skills/verdikta-discover/tests/preview.test.mjs
?? skills/verdikta-discover/tests/requirements.txt
?? skills/verdikta-discover/tests/validate_package.py
```

The report and live-evidence files are included in the execution/validation PR. The untracked status markers above are historical; the unrelated server start script remains excluded from both PRs.
