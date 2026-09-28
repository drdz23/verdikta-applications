# Verdikta bounty commissioning

Start with the separate [wallet-free discovery skill](../verdikta-discover/SKILL.md) to assess outside help. No supplier or quote is implied.

This execution skill uses an existing encrypted wallet and API identity under separate owner authorization. Read [SKILL.md](SKILL.md) and [commission configuration](references/commission.md) before running it. Network, destination, bytecode, ABI, arguments and owner caps fail closed. A failed guard is never permission to construct a manual replacement transaction.

Install dependencies in `scripts/` with `npm ci --ignore-scripts`. Run `npm test` for mocked compatibility tests. To regenerate ABI/rubric assets in the repository, first compile with `hardhat.local.cjs`, then run `node sync_contract_assets.js`. No publication or deployment is part of these commands.
