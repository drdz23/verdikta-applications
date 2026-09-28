/**
 * Signed-message auth for creator-only off-chain mutations.
 *
 * The canonical message is a plain-text block the wallet signs via
 * personal_sign (ethers `signer.signMessage`). Format:
 *
 *   Verdikta Bounty: set public submissions
 *   Bounty ID: <numeric-jobId>
 *   Public: true|false
 *   Timestamp: <ISO-8601 UTC>
 *
 * The server checks the fields match the intended action, enforces a short
 * validity window to prevent replay of ancient signatures, then verifies the
 * signature against the bounty creator:
 *
 *   1. EOA creators: ethers.verifyMessage (ecrecover) must recover to the
 *      creator address. No RPC call is made.
 *   2. Smart-wallet creators (EIP-1271): a contract wallet has no private key,
 *      so no signature can ever recover to its address. When ecrecover does
 *      not match and the creator address has code, the server calls
 *      `creator.isValidSignature(hashMessage(message), signature)` through the
 *      configured RPC provider and accepts only the magic value 0x1626ba7e.
 *      A revert, a non-magic return, or an RPC failure is a rejection — never
 *      an acceptance and never a 500.
 *
 * ERC-6492 (undeployed counterfactual wallets) is intentionally not supported:
 * every bounty creator has already sent createBounty, so its wallet is deployed.
 */
const { ethers } = require('ethers');

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

// bytes4(keccak256("isValidSignature(bytes32,bytes)"))
const EIP1271_MAGIC_VALUE = '0x1626ba7e';
const EIP1271_ABI = ['function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'];

let cachedProvider = null;
function getDefaultProvider() {
  if (cachedProvider) return cachedProvider;
  const { config } = require('../config');
  if (!config.rpcUrl) throw new Error('RPC provider not configured');
  cachedProvider = new ethers.JsonRpcProvider(config.rpcUrl);
  return cachedProvider;
}

/**
 * EIP-1271 check. Returns true only when the contract at `signer` returns the
 * magic value. Every failure mode (no code, revert, RPC error, malformed
 * return) yields false so the caller rejects — never throws.
 */
async function isValidContractSignature({ provider, signer, message, signature }) {
  try {
    const code = await provider.getCode(signer);
    if (!code || code === '0x') return false;
    const hash = ethers.hashMessage(message);
    const wallet = new ethers.Contract(signer, EIP1271_ABI, provider);
    const result = await wallet.isValidSignature(hash, signature);
    return typeof result === 'string' && result.toLowerCase() === EIP1271_MAGIC_VALUE;
  } catch (err) {
    return false;
  }
}

function buildPublicSubmissionsMessage({ bountyId, publicSubmissions, timestamp }) {
  const ts = timestamp || new Date().toISOString();
  return [
    'Verdikta Bounty: set public submissions',
    `Bounty ID: ${bountyId}`,
    `Public: ${publicSubmissions ? 'true' : 'false'}`,
    `Timestamp: ${ts}`,
  ].join('\n');
}

function parsePublicSubmissionsMessage(message) {
  const lines = String(message || '').split('\n').map(l => l.trim());
  if (lines[0] !== 'Verdikta Bounty: set public submissions') {
    throw new Error('Unrecognized message header');
  }
  const fields = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const bountyIdRaw = fields['Bounty ID'];
  const publicRaw   = fields['Public'];
  const tsRaw       = fields['Timestamp'];
  if (bountyIdRaw == null || publicRaw == null || tsRaw == null) {
    throw new Error('Message missing required fields');
  }
  const bountyId = Number(bountyIdRaw);
  if (!Number.isInteger(bountyId) || bountyId < 0) {
    throw new Error('Invalid Bounty ID');
  }
  if (publicRaw !== 'true' && publicRaw !== 'false') {
    throw new Error('Invalid Public value');
  }
  const timestampMs = Date.parse(tsRaw);
  if (!Number.isFinite(timestampMs)) {
    throw new Error('Invalid Timestamp');
  }
  return {
    bountyId,
    publicSubmissions: publicRaw === 'true',
    timestampMs,
  };
}

/**
 * Verify a creator-signed publicSubmissions action. Async because smart-wallet
 * (EIP-1271) creators require an RPC call; every caller must await it.
 *
 * `provider` is injectable for tests; defaults to the server's configured RPC.
 */
async function verifyPublicSubmissionsAction({
  message,
  signature,
  expectedSigner,
  expectedBountyId,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  provider,
}) {
  const parsed = parsePublicSubmissionsMessage(message);

  if (Number(parsed.bountyId) !== Number(expectedBountyId)) {
    throw new Error('Message Bounty ID does not match path');
  }

  const age = Date.now() - parsed.timestampMs;
  if (age < -60_000 || age > maxAgeMs) {
    throw new Error('Signature expired or from the future; request a fresh one');
  }

  const expected = String(expectedSigner || '').toLowerCase();
  if (!ethers.isAddress(expected)) {
    throw new Error('Expected signer is not a valid address');
  }

  // 1. EOA path: ecrecover. A smart-wallet signature is not a 65-byte ECDSA
  //    signature (or recovers to some unrelated address), so a recovery error
  //    here is not fatal — it just means we fall through to EIP-1271.
  let recovered = null;
  let recoverError = null;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch (err) {
    recoverError = err;
  }
  if (recovered && recovered.toLowerCase() === expected) {
    return parsed;
  }

  // 2. Smart-wallet path: EIP-1271 isValidSignature on the creator contract.
  let rpc = provider;
  if (!rpc) {
    try {
      rpc = getDefaultProvider();
    } catch (err) {
      throw new Error('Signature does not match expected signer (smart-wallet check unavailable: RPC provider not configured)');
    }
  }
  const contractOk = await isValidContractSignature({
    provider: rpc,
    signer: expected,
    message,
    signature,
  });
  if (contractOk) {
    return parsed;
  }

  if (recoverError && !recovered) {
    throw new Error(`Signature verification failed: ${recoverError.message}`);
  }
  throw new Error('Signature does not match expected signer');
}

module.exports = {
  buildPublicSubmissionsMessage,
  parsePublicSubmissionsMessage,
  verifyPublicSubmissionsAction,
  isValidContractSignature,
  EIP1271_MAGIC_VALUE,
};
