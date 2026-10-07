#!/usr/bin/env node
// Repository-only packaging step; first compile via hardhat.local.cjs (no secrets).
import { readFile, writeFile } from 'node:fs/promises';
import { Interface } from 'ethers';
const contracts = new URL('../../../example-bounty-program/onchain/artifacts/contracts/', import.meta.url);
const escrow = JSON.parse(await readFile(new URL('BountyEscrow.sol/BountyEscrow.json', contracts))).abi;
const lens = JSON.parse(await readFile(new URL('BountyEscrowLens.sol/BountyEscrowLens.json', contracts))).abi;
const merged = new Interface([...escrow, ...lens.filter(f => f.type === 'function' && !escrow.some(e => e.type === f.type && e.name === f.name))]);
await writeFile(new URL('bounty-escrow.abi.json', import.meta.url), JSON.stringify(JSON.parse(merged.formatJson()), null, 2) + '\n');
const source = await readFile(new URL('../../../example-bounty-program/server/utils/validation.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('function validateRubric('), source.indexOf('\n/**', source.indexOf('function validateRubric('))).trim();
await writeFile(new URL('rubric.cjs', import.meta.url), '// Generated from server/utils/validation.js by sync_contract_assets.js; do not edit.\n' + fn + '\nmodule.exports = { validateRubric };\n');
