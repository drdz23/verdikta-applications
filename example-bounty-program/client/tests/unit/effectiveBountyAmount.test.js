import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveBountyAmountEth } from '../../src/utils/effectiveBountyAmount.js';

test('non-windowed: the payout field is the amount', () => {
  assert.equal(effectiveBountyAmountEth({ enableApprovalWindow: false, payoutAmount: '0.01' }), '0.01');
  assert.equal(effectiveBountyAmountEth({ enableApprovalWindow: false, payoutAmount: ' 1e-3 ' }), '0.001');
  assert.equal(effectiveBountyAmountEth({ enableApprovalWindow: false, payoutAmount: '' }), null);
  assert.equal(effectiveBountyAmountEth({ enableApprovalWindow: false, payoutAmount: '0' }), null);
  assert.equal(effectiveBountyAmountEth({ enableApprovalWindow: false, payoutAmount: 'abc' }), null);
});

test('windowed: the larger approval payment is the amount and the payout field is ignored', () => {
  const base = { enableApprovalWindow: true, payoutAmount: '0.5' };
  assert.equal(effectiveBountyAmountEth({ ...base, creatorPaymentEth: '0.001', arbiterPaymentEth: '0.002' }), '0.002');
  assert.equal(effectiveBountyAmountEth({ ...base, creatorPaymentEth: '0.003', arbiterPaymentEth: '0.002' }), '0.003');
  assert.equal(effectiveBountyAmountEth({ ...base, creatorPaymentEth: '0.001', arbiterPaymentEth: '0.001' }), '0.001');
});

test('windowed: compares in wei, not as floats', () => {
  assert.equal(effectiveBountyAmountEth({
    enableApprovalWindow: true, creatorPaymentEth: '0.100000000000000001', arbiterPaymentEth: '0.1',
  }), '0.100000000000000001');
});

test('windowed: null until both payments are positive', () => {
  assert.equal(effectiveBountyAmountEth({ enableApprovalWindow: true, creatorPaymentEth: '0.001', arbiterPaymentEth: '' }), null);
  assert.equal(effectiveBountyAmountEth({ enableApprovalWindow: true, creatorPaymentEth: '0', arbiterPaymentEth: '0.001' }), null);
  assert.equal(effectiveBountyAmountEth({ enableApprovalWindow: true }), null);
});
