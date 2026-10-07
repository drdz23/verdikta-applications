/**
 * Phase D.6 heal-sweep candidate rule + exact-amount backfill.
 *
 * Legacy records (pre bountyAmountWei) must be re-read from chain even when
 * they were already marked _chainFieldsHealed, and the re-read must land the
 * exact wei string alongside the numeric display amount.
 */
const { needsChainFieldHeal, applyChainBountyFields } = require('../utils/syncService');

const CONTRACT = '0xa741eff41bcf14793e61cebb4179e05c9124d3f6';
const COUNT = 100;

function synced(overrides = {}) {
  return {
    jobId: 5,
    contractAddress: CONTRACT.toUpperCase(),
    syncedFromBlockchain: true,
    status: 'CLOSED',
    creatorDeterminationPayment: '0.004',
    arbiterDeterminationPayment: '0.004',
    creatorAssessmentWindowSize: 0,
    targetHunter: null,
    oracleSettings: { maxOracleFee: '1', alpha: 500, estimatedBaseCost: '1', maxFeeBasedScaling: 10 },
    _chainFieldsHealed: true,
    bountyAmount: 0.004,
    bountyAmountWei: '4000000000000000',
    ...overrides,
  };
}

describe('needsChainFieldHeal', () => {
  test('fully healed record with exact wei is not a candidate', () => {
    expect(needsChainFieldHeal(synced(), CONTRACT, COUNT)).toBe(false);
  });

  test('healed legacy record missing bountyAmountWei IS a candidate', () => {
    expect(needsChainFieldHeal(synced({ bountyAmountWei: undefined }), CONTRACT, COUNT)).toBe(true);
  });

  test('legacy record already attempted is not retried', () => {
    expect(needsChainFieldHeal(
      synced({ bountyAmountWei: undefined, _weiBackfillAttempted: true }), CONTRACT, COUNT
    )).toBe(false);
  });

  test('original rule: unhealed record missing chain fields is a candidate', () => {
    expect(needsChainFieldHeal(
      synced({ _chainFieldsHealed: false, creatorDeterminationPayment: undefined }), CONTRACT, COUNT
    )).toBe(true);
  });

  test('original rule: healed record missing chain fields but with wei is not re-read', () => {
    expect(needsChainFieldHeal(
      synced({ targetHunter: null, oracleSettings: undefined }), CONTRACT, COUNT
    )).toBe(false);
  });

  test('scope guards still apply to the wei backfill', () => {
    const legacy = { bountyAmountWei: undefined };
    expect(needsChainFieldHeal(synced({ ...legacy, contractAddress: '0x' + '1'.repeat(40) }), CONTRACT, COUNT)).toBe(false);
    expect(needsChainFieldHeal(synced({ ...legacy, syncedFromBlockchain: false, onChain: true }), CONTRACT, COUNT)).toBe(false);
    expect(needsChainFieldHeal(synced({ ...legacy, status: 'ORPHANED' }), CONTRACT, COUNT)).toBe(false);
    expect(needsChainFieldHeal(synced({ ...legacy, jobId: COUNT }), CONTRACT, COUNT)).toBe(false);
    expect(needsChainFieldHeal(synced({ ...legacy, jobId: null }), CONTRACT, COUNT)).toBe(false);
    expect(needsChainFieldHeal(null, CONTRACT, COUNT)).toBe(false);
  });
});

describe('applyChainBountyFields exact-amount backfill', () => {
  test('sets bountyAmountWei and the display amount from the chain read', () => {
    const job = synced({ bountyAmountWei: undefined, bountyAmount: 0.004 });
    const changed = applyChainBountyFields(job, {
      bountyAmount: '0.004',
      bountyAmountWei: '4000000000000000',
      creatorDeterminationPayment: '0.004',
      arbiterDeterminationPayment: '0.004',
      creatorAssessmentWindowSize: 0,
      targetHunter: null,
    });
    expect(changed).toBe(true);
    expect(job.bountyAmountWei).toBe('4000000000000000');
    expect(job.bountyAmount).toBe(0.004);
    // After the backfill the record leaves the candidate set on its own.
    expect(needsChainFieldHeal(job, CONTRACT, COUNT)).toBe(false);
  });

  test('is a no-op when the exact amount already matches', () => {
    const job = synced();
    const changed = applyChainBountyFields(job, {
      bountyAmount: '0.004',
      bountyAmountWei: '4000000000000000',
      creatorDeterminationPayment: '0.004',
      arbiterDeterminationPayment: '0.004',
      creatorAssessmentWindowSize: 0,
      targetHunter: null,
    });
    expect(changed).toBe(false);
  });
});

describe('drained-escrow protection (2026-09-30 regression)', () => {
  const { fundedBountyWei, fundedBountyAmountFields } = require('../utils/bountyAmounts');

  test('funded amount is max(creator, arbiter) even after payoutWei is zeroed', () => {
    const paidOut = { payoutWei: 0n, creatorDeterminationPayment: 1000000000000000n, arbiterDeterminationPayment: 1000000000000000n };
    expect(fundedBountyWei(paidOut)).toBe(1000000000000000n);
    const windowed = { payoutWei: 0n, creatorDeterminationPayment: 2000000000000000n, arbiterDeterminationPayment: 5000000000000000n };
    expect(fundedBountyWei(windowed)).toBe(5000000000000000n);
    expect(fundedBountyAmountFields(paidOut)).toEqual({ bountyAmount: 0.001, bountyAmountWei: '1000000000000000' });
  });

  test('falls back to payoutWei only when the payment fields are absent', () => {
    expect(fundedBountyWei({ payoutWei: 42n })).toBe(42n);
    expect(fundedBountyWei({})).toBe(0n);
  });

  test("a record holding a '0' amount is a heal candidate, and is not retried after an attempt", () => {
    expect(needsChainFieldHeal(synced({ bountyAmountWei: '0', bountyAmount: 0 }), CONTRACT, COUNT)).toBe(true);
    expect(needsChainFieldHeal(synced({ bountyAmountWei: '0', bountyAmount: 0, _weiBackfillAttempted: true }), CONTRACT, COUNT)).toBe(false);
  });

  test('applyChainBountyFields never overwrites a nonzero amount with zero', () => {
    const job = synced();
    const changed = applyChainBountyFields(job, {
      bountyAmount: '0.0', bountyAmountWei: '0',
      creatorDeterminationPayment: '0.004', arbiterDeterminationPayment: '0.004',
      creatorAssessmentWindowSize: 0, targetHunter: null,
    });
    expect(changed).toBe(false);
    expect(job.bountyAmountWei).toBe('4000000000000000');
    expect(job.bountyAmount).toBe(0.004);
  });

  test("applyChainBountyFields repairs a zeroed record from a correct chain read", () => {
    const job = synced({ bountyAmountWei: '0', bountyAmount: 0 });
    applyChainBountyFields(job, {
      bountyAmount: '0.004', bountyAmountWei: '4000000000000000',
      creatorDeterminationPayment: '0.004', arbiterDeterminationPayment: '0.004',
      creatorAssessmentWindowSize: 0, targetHunter: null,
    });
    expect(job.bountyAmountWei).toBe('4000000000000000');
    expect(job.bountyAmount).toBe(0.004);
    expect(needsChainFieldHeal(job, CONTRACT, COUNT)).toBe(false);
  });
});
