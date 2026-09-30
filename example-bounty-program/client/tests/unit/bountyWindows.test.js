import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateBountyWindows, hoursToSeconds } from '../../src/utils/bountyWindows.js';
const require = createRequire(import.meta.url);
const { normalizeBountyPayments } = require('../../../server/utils/validation.js');

// The server is authoritative. For each case, the client must accept exactly
// when the server accepts, so the create wizard never sends a doomed request
// and never blocks one the server would take.
function serverAccepts({ submissionWindowHours, approvalWindowHours, enableApprovalWindow }) {
  try {
    normalizeBountyPayments({
      bountyAmount: '0.001',
      submissionWindowHours,
      ...(enableApprovalWindow ? {
        creatorDeterminationPayment: '0.001',
        arbiterDeterminationPayment: '0.001',
        creatorAssessmentWindowHours: approvalWindowHours,
      } : {}),
    });
    return true;
  } catch (e) {
    if (e.code === 'INVALID_BOUNTY_WINDOW') return false;
    throw e;
  }
}

test('client window feedback agrees with the server rule', () => {
  const cases = [
    { submissionWindowHours: 1, approvalWindowHours: '0.5', enableApprovalWindow: true },
    { submissionWindowHours: 1.5, approvalWindowHours: '1', enableApprovalWindow: true },   // the 1.5h case
    { submissionWindowHours: 1, approvalWindowHours: '1', enableApprovalWindow: true },
    { submissionWindowHours: 1.0005, approvalWindowHours: '1', enableApprovalWindow: true }, // rounds to +2s: rejected
    { submissionWindowHours: 1.001, approvalWindowHours: '1', enableApprovalWindow: true },  // rounds to +4s: accepted
    { submissionWindowHours: 0.5, approvalWindowHours: '1', enableApprovalWindow: true },
    { submissionWindowHours: 24, approvalWindowHours: '0', enableApprovalWindow: false },
    { submissionWindowHours: 0.25, approvalWindowHours: '9', enableApprovalWindow: false },
    { submissionWindowHours: 0, approvalWindowHours: '0', enableApprovalWindow: false },
    { submissionWindowHours: '', approvalWindowHours: '0', enableApprovalWindow: false },
    { submissionWindowHours: 'abc', approvalWindowHours: '0', enableApprovalWindow: false },
  ];
  for (const c of cases) {
    assert.equal(validateBountyWindows(c) === null, serverAccepts(c), JSON.stringify(c));
  }
});

test('hours round to the nearest second like the server', () => {
  assert.equal(hoursToSeconds(1.5), 5400);
  assert.equal(hoursToSeconds('0.5'), 1800);
  assert.equal(hoursToSeconds(1.0005), 3602);
});

test('messages name the offending field', () => {
  assert.match(validateBountyWindows({ submissionWindowHours: 0, enableApprovalWindow: false }), /Submission window/);
  assert.match(validateBountyWindows({ submissionWindowHours: 2, approvalWindowHours: '0', enableApprovalWindow: true }), /Approval window/);
  assert.match(validateBountyWindows({ submissionWindowHours: 1, approvalWindowHours: '1', enableApprovalWindow: true }), /exceed the approval window/);
});
