import { ethers } from 'ethers';

// The amount a bounty is actually funded with, as a decimal ETH string.
//
// Non-windowed: the Payout Amount field. Windowed: the larger of the creator
// and arbiter approval payments — that is what BountyEscrow.createBounty
// escrows and what the API records as bountyAmount, so the wizard must
// display, price in USD, and send exactly this value rather than a separate
// payout field the server would ignore. Compared in wei to avoid float error.
// Returns null when the relevant inputs are missing or not positive.
export function effectiveBountyAmountEth({ enableApprovalWindow, payoutAmount, creatorPaymentEth, arbiterPaymentEth }) {
  const toWei = (v) => {
    if (v == null || String(v).trim() === '') return null;
    const text = String(v).trim();
    try { const wei = ethers.parseEther(text); return wei > 0n ? wei : null; }
    catch {
      // Number inputs can yield exponent notation ("1e-3"), which parseEther
      // rejects. Expand it to a plain decimal; positive finite values only.
      const n = Number(text);
      if (!Number.isFinite(n) || n <= 0) return null;
      try { const wei = ethers.parseEther(n.toFixed(18)); return wei > 0n ? wei : null; }
      catch { return null; }
    }
  };
  if (!enableApprovalWindow) {
    const wei = toWei(payoutAmount);
    return wei == null ? null : ethers.formatEther(wei);
  }
  const creator = toWei(creatorPaymentEth);
  const arbiter = toWei(arbiterPaymentEth);
  if (creator == null || arbiter == null) return null;
  return ethers.formatEther(creator > arbiter ? creator : arbiter);
}
