#!/usr/bin/env node
// Authorized commissioning only. Local/no-wallet preview is in verdikta-discover.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Contract } from 'ethers';
import { arg, getNetwork, providerFor, loadWallet, loadApiKey, confirmSpendOrExit,
  isDryRun, preflightDeployment, loadSpendPolicy, getSupportedModelsForClass,
  validateAndNormalizeJuryNodes, sendTx } from './_lib.js';
import { creationTerms, bindCreation, verifyTransaction, iface, deployments } from './_transaction-guards.js';
import { validateRubric } from './rubric.cjs';
import { applyWorkOrder } from './_work-order.js';

const configPath = arg('config');
if (!configPath) throw new Error('Usage: create_bounty.js --config approved.json [--dry-run --prepared response.json] [--resume state.json]');
const raw = await fs.readFile(configPath, 'utf8');
const config = await applyWorkOrder(JSON.parse(raw));
if (config.fixture_only) throw new Error('Synthetic config cannot commission real work; replace it with an owner-reviewed non-fixture request');
const configHash = createHash('sha256').update(raw + (config.workOrderDraftSha256 || '')).digest('hex');
const terms = creationTerms(config);
const rubric = validateRubric(config.rubricJson);
if (!rubric.valid) throw new Error(rubric.errors.join('; '));
if (!config.title || !config.description || !Array.isArray(config.juryNodes) || !config.juryNodes.length) throw new Error('Title, description and juryNodes required');
if ('threshold' in config.rubricJson) throw new Error('Threshold belongs outside rubricJson');
const network = getNetwork(), provider = providerFor(network);
const baseUrl = (process.env.VERDIKTA_BOUNTIES_BASE_URL || '').replace(/\/+$/, '');
await preflightDeployment(network, provider, baseUrl);
const policy = await loadSpendPolicy();
if (terms.value > BigInt(policy.maxValueWei) || terms.value > BigInt(policy.maxTotalWei)) throw new Error('Reward exceeds owner cap');
const aggregatorAddress = await new Contract(deployments[network].address, ['function verdikta() view returns(address)'], provider).verdikta();
const ceiling = await new Contract(aggregatorAddress, ['function maxOracleFee() view returns(uint256)'], provider).maxOracleFee();
if (terms.params.oracle.maxOracleFee > ceiling) throw new Error('Oracle fee exceeds live ceiling');
const wallet = (await loadWallet()).connect(provider);
const apiKey = await loadApiKey();
if (!apiKey) throw new Error('Configured API identity required');
const headers = { 'Content-Type': 'application/json', 'X-Bot-API-Key': apiKey };
async function api(path, body, method = 'POST') {
  const res = await fetch(`${baseUrl}/api${path}`, { method, headers, body: JSON.stringify(body), redirect: 'error' });
  if (!res.ok) throw new Error(`API ${path}: HTTP ${res.status}; do not create a replacement job`);
  return res.json();
}
const statePath = arg('resume') || `${configPath}.state.json`;
async function link(state, receipt) {
  if (receipt.status !== 1) throw new Error('Creation did not succeed; inspect saved transaction');
  const event = receipt.logs.filter(l => l.address.toLowerCase() === deployments[network].address.toLowerCase())
    .map(l => { try { return iface.parseLog(l); } catch { return null; } }).find(l => l?.name === 'BountyCreated');
  if (!event) throw new Error('No escrow BountyCreated event; inspect saved transaction');
  const result = await api(`/jobs/${state.response.job.jobId}/bountyId`, { bountyId: Number(event.args.bountyId), txHash: receipt.hash, blockNumber: receipt.blockNumber }, 'PATCH');
  if (!result.success || result.job?.jobId == null || String(result.job.jobId) !== event.args.bountyId.toString()) throw new Error('API link response drift; keep the saved transaction and reconcile it');
  state.linkedJobId = result.job.jobId;
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  console.log(`Linked API job ${state.linkedJobId ?? '(verify API response)'}; on-chain bounty ${event.args.bountyId}`);
}
if (arg('resume')) {
  if (isDryRun()) throw new Error('Resume performs linking; use --prepared for a non-mutating dry-run');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  if (state.configHash !== configHash || state.network !== network || !state.txHash) throw new Error('Recovery needs the matching config/network and a saved broadcast hash; inspect chain/API before further action');
  const saved = bindCreation(config, state.response, { recovery: true });
  const tx = await provider.getTransaction(state.txHash);
  if (!tx || tx.from.toLowerCase() !== wallet.address.toLowerCase()) throw new Error('Saved transaction missing or wrong creator');
  verifyTransaction(tx, { network, method: 'createBounty', args: [saved.params], value: saved.value, maxValueWei: policy.maxValueWei });
  const receipt = await provider.getTransactionReceipt(state.txHash);
  if (!receipt) throw new Error('Transaction still pending; retry resume later');
  await link(state, receipt); // Never broadcasts or creates a second API job.
} else {
  const supported = await getSupportedModelsForClass(baseUrl, apiKey, config.classId);
  const juryNodes = validateAndNormalizeJuryNodes({ classId: config.classId, juryNodes: config.juryNodes, supported });
  let response, state;
  if (isDryRun()) {
    if (!arg('prepared')) throw new Error('Exact financial dry-run requires --prepared saved API response; no API job was created. For wallet-free drafting use verdikta-discover.');
    response = JSON.parse(await fs.readFile(arg('prepared'), 'utf8'));
  } else {
    await confirmSpendOrExit([`Commission ${config.procurementMode} work for ${terms.params.targetHunter}`, `Reward: ${config.bountyAmount} ETH; chain: ${network}`, `Threshold ${config.threshold}; window ${config.submissionWindowHours} hours`, `Publish the reviewed description/rubric; then review exact transaction`, `Payout follows creator approval in its window or passing oracle evaluation; finalization is required.`]);
    // Reserve before mutation. Existing state always stops duplicate creation.
    state = { configHash, network, status: 'API_CREATE_PENDING' };
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
    const o = terms.params.oracle;
    response = await api('/jobs/create', {
      title: config.title, description: config.description, workProductType: config.workProductType || 'research',
      creator: wallet.address, bountyAmount: config.bountyAmount, threshold: config.threshold,
      classId: config.classId, submissionWindowHours: config.submissionWindowHours,
      procurementMode: config.procurementMode, targetHunter: terms.params.targetHunter, rubricJson: config.rubricJson, juryNodes,
      creatorDeterminationPayment: config.creatorDeterminationPayment ?? config.bountyAmount,
      arbiterDeterminationPayment: config.arbiterDeterminationPayment ?? config.bountyAmount,
      creatorAssessmentWindowHours: Number(terms.params.creatorAssessmentWindowSize) / 3600,
      oracleMaxOracleFee: o.maxOracleFee.toString(), oracleAlpha: Number(o.alpha),
      oracleEstimatedBaseCost: o.estimatedBaseCost.toString(), oracleMaxFeeBasedScaling: Number(o.maxFeeBasedScaling),
    });
    state.response = response; state.status = 'API_CREATED';
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  }
  const bound = bindCreation(config, response);
  const receipt = await sendTx(wallet, 'createBounty', bound.transaction, {
    network, args: [bound.params], exactValueWei: bound.value, policy,
    onBroadcast: async hash => { state.txHash = hash; state.status = 'BROADCAST'; await fs.writeFile(statePath, JSON.stringify(state, null, 2)); },
  });
  if (receipt) await link(state, receipt);
}
provider.destroy();
