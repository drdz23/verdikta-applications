# Operator setup and endpoint reference

Use a fresh low-balance wallet. Owner approval of setup does not authorize a bounty, submission, payout, or withdrawal. Run commands from `scripts/` after `npm ci --ignore-scripts` (Node 20.18+). Install the complete reviewed skill directory.

## Guided setup

Run `node onboard.js` in a human-controlled terminal. Select the network explicitly and choose wallet creation or import; the API origin follows from the network. The wizard writes the encrypted keystore and non-secret configuration locally, never the wallet password. It waits for owner funding in ETH, registers the API identity, and prints the command for a read-only job listing. Private keys and passwords must not enter agent messages or logs. Import only a separately approved low-balance wallet; never overwrite an existing wallet without approval.

## Individual helpers

1. Configure the variables below outside the agent-writable workspace.
2. `node wallet_init.js --out <keystore>` creates an encrypted wallet; `--import` prompts the human for an existing key. It writes the destination, so use a new path unless replacement is explicitly intended.
3. `node funding_instructions.js --address <wallet>` prints funding guidance for the selected network. The owner sends ETH on that network; Base Sepolia needs test ETH. Reserve gas plus additional L1 data fees.
4. `node funding_check.js` reads the configured wallet’s balance. No token approval or swap is part of this flow.
5. `node bot_register.js --name <name> --owner <wallet> --out <bot-file>` registers an identity and saves the API key with restrictive permissions. This is an external write requiring owner approval.
6. `node preflight.js --jobId <id>` checks an existing bounty and its live ETH prepay; use `--minBuffer <minutes>` to require a deadline buffer. It does not authorize spending.
7. `node bounty_worker_min.js` lists open jobs as a read-only connectivity check. It does not submit work.

## Environment

Scripts use exported variables and `~/.config/verdikta-bounties/.env`; they ignore skill-local `.env`. Helpers load secrets directly without exposing them to the model.

| Variable | Use |
| --- | --- |
| VERDIKTA_NETWORK | Required explicit `base` or `base-sepolia`; no transaction mainnet default |
| VERDIKTA_BOUNTIES_BASE_URL | Optional. Only the network's reviewed origin is accepted (https://bounties.verdikta.org or https://bounties-testnet.verdikta.org); unset means that origin |
| VERDIKTA_KEYSTORE_PATH | Encrypted wallet file |
| VERDIKTA_WALLET_PASSWORD | Keystore password. Process environment or terminal prompt only; never read from `.env`. See below |
| VERDIKTA_BOT_FILE | API identity file; stable configuration directory default |
| VERDIKTA_SPEND_POLICY | Owner-approved per-run value/gas cap file; required for every transaction |
| BASE_RPC_URL / BASE_SEPOLIA_RPC_URL | Optional reviewed RPC; deployment/chain/code checks still apply |
| VERDIKTA_SECRETS_DIR | Optional stable configuration directory used by setup helpers |

## Wallet password

The skill never stores the keystore password, and no script reads it from a file. Each signing script takes `VERDIKTA_WALLET_PASSWORD` from its environment, or asks for it in a human-controlled terminal without echoing it. A stable `.env` that still contains it makes every script stop until it is migrated ([1.6.0 notes](migration-1.6.0.md)).

For unattended agent runs, keep the password in a secret store and let the runtime inject it:

- OpenClaw: the skill declares `VERDIKTA_WALLET_PASSWORD` as its `primaryEnv`, so set `skills.entries.verdikta-bounties-onboarding.apiKey` to a SecretRef. OpenClaw resolves it and sets the variable for the agent's host runs only. Use an `exec` provider for a password manager (OpenClaw's secrets documentation covers 1Password, Bitwarden, Vault, `pass` and `sops`), or a `file` provider for a mode-600 file outside this configuration directory:

  ```json5
  secrets: { providers: { verdikta_wallet: { source: "file", path: "/home/you/.config/verdikta-secrets/wallet-password", mode: "singleValue" } } },
  skills: { entries: { "verdikta-bounties-onboarding": { apiKey: { source: "file", provider: "verdikta_wallet", id: "value" } } } }
  ```

  Then run `openclaw secrets audit --check`.
- Other runtimes: export the variable from your secret manager for the process that runs the scripts.

Limits to keep in mind: during a run the password is in the agent process's environment, so this keeps it off disk and out of configuration files; it does not isolate it from the agent. A file provider still holds the password in plaintext, outside the skill's own files. Keep the wallet balance low and the spend policy tight; for real isolation, run the signing scripts under a separate OS account that the agent cannot read.

## Endpoint map

Use the configured origin. Write endpoints require `X-Bot-API-Key`. Read live `/api/docs` for current shapes; the executor independently validates descriptors.

| Method and path | Purpose |
| --- | --- |
| GET /api/docs, /agents.txt | Public compatibility documentation |
| POST /api/bots/register | Register API identity |
| GET /api/classes/:id/models | Authenticated model availability |
| GET /api/jobs | List jobs |
| POST /api/jobs/rubric/validate | Validate rubric/jury without creating a job |
| GET /api/jobs/:id/validate | Check existing evaluation package |
| POST /api/jobs/create | Pin package and create API state; immediately fund and link the approved bounty |
| PATCH /api/jobs/:id/bountyId | Link receipt-derived on-chain identity |
| POST /api/jobs/:id/submit | Upload approved public work |
| POST /api/jobs/:id/submit/prepare | Current three-argument prepare descriptor |
| POST /api/jobs/:id/submissions/confirm | Idempotent API tracking after prepare receipt |
| POST /api/jobs/:id/submissions/:subId/start | Start descriptor with live ETH prepay |
| GET /api/jobs/:id/submissions/:subId/diagnose | State and next action |
| POST /api/jobs/:id/submissions/:subId/finalize | Resolve a completed evaluation |
| POST /api/jobs/:id/submissions/:subId/timeout | Force-fail only when aggregator state permits |
| POST /api/jobs/:id/submissions/:subId/recover-refund | Recover deferred oracle prepay |
| POST /api/jobs/:id/close | Close only when contract state permits |

Use the guarded scripts, not raw descriptors, for approved transactions. See `commission.md` for exact configuration, recovery, and cap limits.
