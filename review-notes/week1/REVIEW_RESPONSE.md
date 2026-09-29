# Review response for PRs #48 and #49

## PR #48

- Direct repository-directory and raw SKILL.md URLs appear on the Skills page, agents.txt and llms.txt. The discovery guidance now belongs to #48, so it can ship independently. Installation/deployment notes require the client’s locked dependencies before rebuilding; no registry publication is claimed.
- A draft requires explicit OPEN/TARGETED intent and sharing approval. Invalid scope, sensitive/refused sharing, local work and missing/invalid targets return no draft. Drafts carry procurement. Target validation rejects non-strings, zero addresses and invalid mixed-case EIP-55 checksums. The preview schema constrains procurement; `preview(null)` returns NEEDS_SCOPE.
- Skill trigger wording includes verify, fact-check, second opinion, hire, Verdikta and bounty. The 30 authored behavior cases include varied intents and targeted-address cases; B05/B06 now expect NEEDS_SCOPE. Native/model sessions remain NOT_RUN.
- Removed the unavailable jobs.txt route from discovery guidance and the llms listing. Missing sharing approval asks for scope; explicit refusal remains unsuitable.
- Effort locations must be approved source URLs; blocked access counts only for its own location. Non-blocked inspection needs linked source evidence. An impossible minimum-location policy fails validation. Evidence remains structural: an individual source excerpt and per-item evidence IDs do not establish semantic truth. Per-claim quotations were considered but deferred to a versioned evidence-schema change; the pilot continues to require independent evaluation.
- BuyerPreview is lazy loaded. Main bundle gzip is approximately 400.6 KB; preview dependencies add approximately 52.4 KB only when loaded. Strict CSP without runtime evaluation still requires precompiled validators for the preview route, documented in install notes.
- Hash navigation scrolls to the lazily mounted section. The form says Request JSON, uses plain-language statuses and labels its prefilled fixture synthetic and non-commissionable.
- Isolation tests now use Node filesystem permissions, deny network builtins with synchronized named exports, and prove credential/network/child-process denial. Browser tests block non-loopback traffic, stub the wallet, inspect downloaded authorization flags and check scrolling.

## PR #49

- Normalize all three payment amounts before IPFS/storage work; reject invalid values with HTTP 400, preserve exact decimal strings through link/sync, canonicalize targets and store OPEN as null. No-mode remains supported, with stricter prefixed checksum-valid address validation documented.
- Restore the read-only worker used by onboarding; restore setup helper guidance, funding/configuration/endpoint references and explicit per-action confirmation approval. Retire the swap helper before imports/prompts and remove stale swap metadata and setup instructions.
- Require the owner-approved draft file hash, recompute the preview and bind OPEN/TARGETED in both directions. Whole-hour CLI windows prevent fractional server round-trip drift. Absolute deadline skew is capped at 15 minutes, and spend review includes ISO deadline and escrow.
- Verify the post-create on-chain creator, CID, class, threshold, target, deadline, split payments, assessment window and oracle settings before linking success.
- API_CREATED state can resume to its first broadcast after fresh validation and approval. An ambiguous BROADCAST_PENDING state cannot auto-rebroadcast. Existing broadcast recovery verifies its transaction and links only. Preserve state after errors.
- Confirmation retries indexing/temporary failures with bounded backoff; resume confirms unconfirmed submissions using on-chain identity before starting. Creator approval shows escrow payout amount, hunter and work CID.
- Add route-level and mocked lifecycle tests, live-prepay/cumulative-cap checks, and resume mismatch coverage. npm test compiles ABI artifacts with the secret-free config; CI installs locked dependencies and runs these checks. Shared compiler settings remove duplication.
- Move historical implementation/live evidence out of the published docs tree into this review-notes directory. Add the 1.5.0 migration guide.

## Local validation on the revised stack

- Discovery: 20 tests pass; artifact validator 57 checks pass; skill metadata valid.
- Execution/lifecycle: 23 tests pass, including the restored onboarding listing.
- Server: 195 tests pass across 18 suites, including 14 create/sync regressions; existing open-handle warning, successful exit.
- Client: 1 rubric unit test and 3 buyer browser tests pass; focused lint and build pass. Existing large-bundle warning remains.
- Contracts: forced compilation of 11 Solidity files and 246 tests pass using the secret-free config and shared settings. No Solidity changes.
- Initial validator invocation lacked Python dependencies; the declared requirements were installed in a temporary virtual environment and all checks then passed. Early regression-test fixture/permission-path mistakes were corrected before the final results.

Native OpenClaw/Hermes binaries remain absent on PATH. Native loading, 30-case model sessions, authenticated model availability, and the owner-funded targeted Sepolia lifecycle are still unverified. No real wallet, API identity, funds, deployment or registry publication was used in this review pass. PRs remain drafts pending those integration gates.
