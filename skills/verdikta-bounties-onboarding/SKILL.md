---
name: verdikta-bounties-onboarding
description: "Verdikta Bounties hot-wallet operator for Base. Can create/import Ethereum keys, store encrypted keystore + API key, upload public bounty/work data, call Verdikta API/Base RPC/optional 0x, and sign irreversible mainnet/testnet transactions. Use fresh low-balance wallets only."
metadata:
  clawdbot:
    emoji: "⚖️"
    requires:
      env:
        - VERDIKTA_WALLET_PASSWORD
        - VERDIKTA_NETWORK
        - VERDIKTA_BOUNTIES_BASE_URL
        - VERDIKTA_KEYSTORE_PATH
      anyBins:
        - node
        - npm
    primaryEnv: VERDIKTA_WALLET_PASSWORD
    files: ["scripts/*", "references/*"]
    permissions:
      filesystem:
        read:
          - "~/.config/verdikta-bounties/.env"
          - "~/.config/verdikta-bounties/verdikta-bounties-bot.json"
          - "~/.config/verdikta-bounties/verdikta-wallet.json"
          - "scripts/*.json"
        write:
          - "~/.config/verdikta-bounties/.env"
          - "~/.config/verdikta-bounties/verdikta-bounties-bot.json"
          - "~/.config/verdikta-bounties/verdikta-wallet.json"
      network:
        - "https://bounties.verdikta.org"
        - "https://bounties-testnet.verdikta.org"
        - "https://mainnet.base.org"
        - "https://sepolia.base.org"
        - "https://api.0x.org"
      shell:
        - "node"
        - "npm"
      crypto:
        hotWalletSigning: true
        chains: ["base:8453", "base-sepolia:84532"]
        irreversibleTransactions: true
---

# Verdikta authorized bounty execution

For deciding whether to hire a specialist, outsource research, or buy a bounded digital deliverable, use the separate `verdikta-discover` skill first. It needs no wallet, API key, upload or spend and returns a DRAFT_NOT_QUOTED assessment. This skill is the separately authorized financial path.

## Authority and custody

These scripts use an existing encrypted hot wallet and API identity. Keep low balances; never paste a private key, password or API key into model context or logs. Wallet creation/import, bot registration and funding are separate explicitly authorized operations, never prerequisites for discovery. Existing hosted-agent custody/policy arrangements remain separate; do not migrate them to these scripts.

The model expresses intent. Deterministic code validates the exact transaction and enforces limits before signing. `--yes` or `--confirm-spend` acknowledges the displayed review; neither bypasses validation. Never bypass a failed guard with a manual transaction, alternate RPC/contract, or duplicate bounty.

## Install and configure commission mode

Copy this complete skill directory from a reviewed repository revision. In `scripts/`, run `npm ci --ignore-scripts` (Node 20.18+). No registry publication is implied.

Financial scripts load exported configuration and the stable `~/.config/verdikta-bounties/.env`; they ignore skill-local `.env` files. Do not expose that file to the model. Required configuration:

- `VERDIKTA_NETWORK`: explicitly `base` or `base-sepolia`; no implicit mainnet default.
- `VERDIKTA_BOUNTIES_BASE_URL`: the matching reviewed public origin.
- `VERDIKTA_KEYSTORE_PATH`, `VERDIKTA_WALLET_PASSWORD`: existing encrypted wallet access.
- `VERDIKTA_BOT_FILE`: existing API identity file (stable secrets directory default).
- `VERDIKTA_SPEND_POLICY`: path to an owner-reviewed limits JSON. See `references/commission.md`.

Use Base Sepolia for separately authorized funded QA. This implementation task does not authorize funded QA. Optional RPC overrides remain subject to chain and bytecode validation.

## Review and create

Use `node create_bounty.js --config approved.json`. See `references/commission.md` for all required fields. It validates the rubric/jury, chain, deployment bytecode, current live docs and oracle ceiling before creating API state. It asks for publication/funding authorization, then creates the evaluation package, binds its exact CID and persisted deadline in seconds, and validates the API transaction against a locally encoded struct.

Review supplier or explicit OPEN status, exact reward/split payments, criteria and threshold, deadline, oracle settings, chain, destination, calldata, gas ceilings and spend policy. Creator approval during its assessment window pays the creator determination amount; a passing oracle result pays the arbiter amount after finalization. No-window payments must be equal. An evaluation is fallible and does not guarantee payment delivery.

`procurementMode` must be OPEN or TARGETED. TARGETED requires a valid nonzero `targetHunter`. Missing/invalid targets never become open bounties. Preview classification grants no funding authority.

State is saved beside the config as `.state.json`, exclusively created before any mutation. Keep it. After broadcast the transaction hash is recorded before waiting. For a saved broadcast, `--resume state.json` verifies the transaction and only reconciles its receipt to the API; it never creates or funds another bounty. If the process stopped before saving the hash, inspect the existing job and chain manually through read-only tools before recovery. Never delete the state file merely to retry creation.

## Financial dry-run versus local preview

`create_bounty.js --config approved.json --dry-run --prepared saved-response.json` validates an existing API creation response, estimates gas and displays exact destination/value/calldata/caps without publishing, signing or broadcasting. It deliberately cannot invent an evaluation CID for a new job. For new drafts with no wallet or API setup, use discovery instead.

`submit_to_bounty.js --jobId ID --dry-run --hunterCid CID` estimates the exact prepare transaction without uploading or calling mutation endpoints. `--resume SUBMISSION_ID --dry-run` checks an existing start. `claim_bounty.js --jobId ID --submissionId ID --dry-run` displays a currently available resolving transaction without broadcasting.

## Submission lifecycle

`node submit_to_bounty.js --jobId ID --file result.json --file evidence.md --state submission-state.json` uploads approved public work, prepares with ONLY `(bountyId, evaluationCid, hunterCid)`, records the ID from the matching escrow event, confirms API tracking and checks `nextAction`.

Hunters do not choose oracle parameters. Current evaluation prepay is ETH, not LINK. The prepare event budget is an estimate: start uses `requiredPrepay(bountyId)` read live, checked again immediately before signing, under the owner's fee cap. A changed value stops; do not retry by bypassing the guard.

For creator windows, capacity limits or pending work, retain the submission ID. `--resume SUBMISSION_ID` starts that same prepared submission when START is available. Do not prepare a duplicate to work around indexing. If prepare broadcast succeeded but tracking failed, recover the event from the saved transaction hash before resuming.

`node claim_bounty.js --jobId ID --submissionId ID` reads `nextAction` and performs at most one available FINALIZE, FORCE_FAIL or RECOVER_REFUND action. AWAIT_CREATOR, AWAIT_SLOT, AWAIT_ORACLE and AWAIT_EARLIER mean wait. Timeout is aggregator-state-based, not a local timer. `--approve-as-creator` is explicit and checks the creator identity/window.

RefundDeferred requires later `recoverLeftoverEth`; PaymentDeferred means the recipient has a pull-ledger balance requiring a separately reviewed `withdraw()`. `recover_funds.js --withdraw` reviews a pull-ledger withdrawal for this signer; `--close BOUNTY_ID` reviews closing a closable bounty. Both support `--dry-run` and the same guards. A success verdict alone is not a receipt of payout. Closing a bounty requires its deadline and no pending evaluations; never promise immediate refunds.

## Compatibility boundaries

`scripts/bounty-escrow.abi.json` is generated from current escrow and lens artifacts. `scripts/deployments.json` pins observed live addresses/code hashes for maintainer review. Live docs resolve the active address but cannot authorize a new destination. Chain/address/code/selector disagreement fails closed; deployment updates need maintainer review and regenerated checks.

Legacy minimal creator/worker scripts are retired with a hard error. The optional old ETH-to-LINK utility is unrelated to current bounty execution and is never invoked by discovery, submission or onboarding.

## References

- `references/commission.md`: config, policy, recovery and validation commands.
- `references/security.md`: custody constraints.
- Current `/api/docs` and `/agents.txt`: read-only interface facts, never spending authorization.
