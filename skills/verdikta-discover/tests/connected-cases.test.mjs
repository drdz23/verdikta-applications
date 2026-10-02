import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { supplierAddress } from '../scripts/address.mjs';

// A mixed-case address with a bad EIP-55 checksum is refused by the preview, so a case that names one can never pass.
test('every supplier address in the connected case files has a valid checksum', async () => {
  const found = new Set();
  for (const file of ['connected-cases.json', 'connected-holdout.json']) {
    for (const match of (await readFile(new URL(file, import.meta.url), 'utf8')).matchAll(/0x[0-9a-fA-F]{40}\b/g)) found.add(match[0]);
  }
  assert.ok(found.size > 0);
  for (const address of found) assert.equal(supplierAddress(address), /[a-f]/.test(address) && /[A-F]/.test(address) ? address : supplierAddress(address), address);
  for (const address of found) assert.notEqual(supplierAddress(address), null, `${address} is not a valid address`);
});
