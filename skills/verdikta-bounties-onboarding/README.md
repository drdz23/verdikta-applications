# Verdikta Bounties operator skill

This skill sets up an explicitly authorized low-balance wallet/API identity and executes reviewed bounty transactions on Base or Base Sepolia. It uses ETH for rewards, evaluation prepay and gas. For wallet-free planning use the separate `verdikta-discover` skill.

## Install and set up

Copy the complete skill directory from a reviewed revision. In `scripts/`, run `npm ci --ignore-scripts`, then run `node onboard.js` in a human-controlled terminal after owner approval. The wizard handles network selection, encrypted wallet setup, owner funding and API registration, and prints the command for a read-only job-list check. It does not store the wallet password; see [wallet password](references/onboarding.md#wallet-password).

A ClawHub install (`clawhub install verdikta-bounties-onboarding`) has the same skill files without the tests and the two repository-only maintainer tools, `compile-contracts.js` and `sync_contract_assets.js`; set it up the same way. Draft handoff (a creator config with `workOrderDraft`) also needs the `verdikta-discover` skill installed beside this one, in a directory named exactly `verdikta-discover` (for example `clawhub install verdikta-discover` into the same skills directory), with `npm ci --ignore-scripts` run inside it. Install both from releases you reviewed: this 1.6.0 pairs with `verdikta-discover` 1.0.0, released from the same repository revision. Without the sibling, `create_bounty.js` stops before any upload or transaction: with no `verdikta-discover` directory, Node reports `ERR_MODULE_NOT_FOUND` for `../verdikta-discover/scripts/preview-core.mjs`; with the directory but without its dependencies, `Cannot find package '@noble/hashes'`.

For the separate `wallet_init`, `funding_instructions`, `funding_check`, `bot_register` and `preflight` helpers, required environment variables and API endpoint table, see [operator setup](references/onboarding.md). Never put wallet secrets in chat, and never pass confirmation flags without approval of the specific action.

## Execute approved work

Read [SKILL.md](SKILL.md) and [commission configuration](references/commission.md) before creating, submitting, resolving or recovering funds. Every transaction needs the configured network and an owner-reviewed spending policy. Keep saved state files for recovery. A preview never authorizes funding.

Existing bots must follow the [1.6.0 migration notes](references/migration-1.6.0.md): the wallet password is no longer stored in `.env`, and scripts refuse to run until `node onboard.js --migrate-password` has moved it to a secret store. Then follow the [1.5.0 notes](references/migration-1.5.0.md). This version is a review candidate; native runtime integration and funded lifecycle testing remain outstanding.

## Validate from a repository checkout

Install dependencies in `scripts/`, `../verdikta-discover/` and `../../example-bounty-program/onchain/`. `npm test` in `scripts/` compiles contracts using the secret-free config before checking ABI compatibility and mocked lifecycle tests. Compilation may download the pinned Solidity compiler on first use; no deployment credentials are loaded. Hosted CI runs the same setup.
