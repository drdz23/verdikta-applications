# Migrating to 1.6.0 (unpublished review candidate)

1.6.0 addresses ClawHub's security review of 1.4.3. Existing operators must migrate before any script runs again.

## The wallet password leaves `.env`

Before 1.6.0, onboarding saved `VERDIKTA_WALLET_PASSWORD` in plaintext in `~/.config/verdikta-bounties/.env`, beside the keystore it unlocks. 1.6.0 never stores it, and no script reads it from a file. Every script now stops with a message while that line is present.

1. Put the password in a secret store, or decide on a file path for an OpenClaw file SecretRef.
2. Run one of these from `scripts/`:
   - `node onboard.js --migrate-password --to-file ~/.config/verdikta-secrets/wallet-password` writes the password to a new mode-600 file outside the configuration directory (for a file SecretRef), then removes it from `.env`.
   - `node onboard.js --migrate-password`, for when the password is already in your secret manager. It asks you to type it, without echo (or reads `VERDIKTA_WALLET_PASSWORD` if exported), and removes the stored copy only if the two match.

   In both cases the stored password must unlock the keystore first. If any check fails, nothing is changed.
3. Configure the runtime to supply `VERDIKTA_WALLET_PASSWORD` (see [wallet password](onboarding.md#wallet-password)). With OpenClaw, set `skills.entries.verdikta-bounties-onboarding.apiKey` to a SecretRef, then run `openclaw secrets audit --check`.
4. Delete backups or copies of the old `.env`: they still contain the password.

## Other changes

- The bot API key goes only to the network's reviewed API origin from `deployments.json`. `VERDIKTA_BOUNTIES_BASE_URL` is optional, and any other value is refused. Onboarding no longer asks for a custom URL and replaces one left in `.env`.
- Passwords and pasted private keys are no longer echoed in the terminal.
- Onboarding prints the read-only job-listing command instead of running it.
- `dotenv` and `ethers` are pinned to exact versions; install with `npm ci --ignore-scripts`.
