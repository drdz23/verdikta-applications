# Migrating to 1.5.0 (unpublished review candidate)

Existing hunter automation must stop and review its configuration before upgrading:

- Set explicit `VERDIKTA_NETWORK` and the matching API URL; there is no default mainnet transaction network.
- Add an owner-approved `VERDIKTA_SPEND_POLICY` for every transaction. Limits are per process and exclude Base L1 data fees; they do not provide a daily spending ledger.
- Never use `--yes` / `--confirm-spend` without approval for that specific action.
- Current bounties use ETH evaluation prepay. The token-swap helper is retired.
- Creation requires explicit OPEN/TARGETED intent, whole-hour submission/assessment windows, and the current oracle parameters. Discovery handoff additionally requires the owner-reviewed file’s exact `workOrderDraftSha256`.
- Submission `--dry-run` requires an existing `--hunterCid`; it uploads nothing. `--bundle` and legacy oracle flags are rejected.
- Use `--state` for submissions. Resume confirms API tracking if needed, then starts the same prepared submission; it never prepares another one.
- Claim is one state-dependent action per invocation. `--maxWait` is rejected; wait outside the script and invoke it again when appropriate.
- `create_bounty_min.js` is retired. `bounty_worker_min.js` remains a read-only listing check used by onboarding.

Before a funded pilot, review deployment snapshots, run the offline checks, verify authenticated class/model availability, and authorize a small targeted Base Sepolia lifecycle test. No funded pilot has been performed by this change.
