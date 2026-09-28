#!/usr/bin/env node
// One state-driven action per invocation; no polling, automatic re-prepare or payout promise.
import { Contract } from 'ethers';
import { arg, getNetwork, providerFor, loadWallet, preflightDeployment, loadSpendPolicy, sendTx } from './_lib.js';
import { abi, iface, deployments } from './_transaction-guards.js';
const jobId = arg('jobId'), submissionId = arg('submissionId');
if (!/^[0-9]+$/.test(jobId || '') || !/^[0-9]+$/.test(submissionId || '')) throw new Error('Usage: claim_bounty.js --jobId ID --submissionId ID [--dry-run] [--approve-as-creator]');
const network = getNetwork(), provider = providerFor(network);
await preflightDeployment(network, provider, process.env.VERDIKTA_BOUNTIES_BASE_URL || '');
const policy = await loadSpendPolicy(), signer = (await loadWallet()).connect(provider);
const escrow = new Contract(deployments[network].address, abi, provider);
const next = await escrow.nextAction(jobId, submissionId);
console.log(`Submission ${submissionId}: ${next}`);
let method = { FINALIZE: 'finalizeSubmission', FORCE_FAIL: 'failTimedOutSubmission', RECOVER_REFUND: 'recoverLeftoverEth' }[next];
if (process.argv.includes('--approve-as-creator')) {
  if (next !== 'AWAIT_CREATOR' || (await escrow.getBounty(jobId)).creator.toLowerCase() !== signer.address.toLowerCase()) throw new Error('Creator approval unavailable to this signer');
  method = 'creatorApproveSubmission';
}
if (method) {
  const args = [BigInt(jobId), BigInt(submissionId)];
  const tx = { to: deployments[network].address, chainId: deployments[network].chainId, value: '0', data: iface.encodeFunctionData(method, args) };
  const receipt = await sendTx(signer, method, tx, { network, args, policy });
  if (receipt) {
    const events = receipt.logs.filter(l => l.address.toLowerCase() === tx.to.toLowerCase()).map(l => { try { return iface.parseLog(l)?.name; } catch { return null; } }).filter(Boolean);
    console.log(`Confirmed events: ${events.join(', ')}. Read state to establish outcome; an accepted verdict alone does not prove payment delivery.`);
    if (events.includes('PaymentDeferred')) console.log('Payment is on the pull ledger; the recipient must separately authorize withdraw().');
    if (events.includes('RefundDeferred')) console.log('Refund recovery deferred; re-check nextAction and recoverLeftoverEth later.');
  }
} else console.log('No resolving action is available now. AWAIT_* means wait; DONE/DEAD does not imply a payout.');
provider.destroy();
