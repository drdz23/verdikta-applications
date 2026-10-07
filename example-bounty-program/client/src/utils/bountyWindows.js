// Client-side mirror of the server's window rule (normalizeBountyPayments in
// server/utils/validation.js): hours are rounded to the nearest second, and the
// submission window must exceed the creator assessment window by more than
// 2 seconds. Returns a user-facing message, or null when the windows are valid.
// The server remains authoritative; this only prevents an avoidable 400.
export function hoursToSeconds(hours) {
  return Math.round(Number(hours) * 3600);
}

export function validateBountyWindows({ submissionWindowHours, approvalWindowHours, enableApprovalWindow }) {
  const submission = Number(submissionWindowHours);
  if (!Number.isFinite(submission) || submission <= 0) return 'Submission window must be > 0 hours';
  if (!enableApprovalWindow) return null;
  const approval = Number(approvalWindowHours);
  if (!Number.isFinite(approval) || approval <= 0) return 'Approval window must be > 0 hours';
  if (hoursToSeconds(submission) <= hoursToSeconds(approval) + 2) {
    return 'Submission window must exceed the approval window by more than 2 seconds';
  }
  return null;
}
