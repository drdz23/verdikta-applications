/**
 * Tests for messageAuth — creator-signed publicSubmissions toggle.
 * Covers EOA (ecrecover) and smart-wallet (EIP-1271) verification paths.
 * Run with: npx jest test/messageAuth.test.js
 */

const { ethers } = require('ethers');
const {
  buildPublicSubmissionsMessage,
  verifyPublicSubmissionsAction,
  isValidContractSignature,
  EIP1271_MAGIC_VALUE,
} = require('../utils/messageAuth');

const CONTRACT_CREATOR = '0xA3b423861e6D6501a05e87d1f500fFff2402f7B1';
const SOME_CODE = '0x363d3d373d3d3d363d73';
const SELECTOR = ethers.id('isValidSignature(bytes32,bytes)').slice(0, 10);

/** Minimal fake ethers provider: getCode + call (which ethers.Contract uses). */
function makeProvider({ code = SOME_CODE, callImpl } = {}) {
  const calls = [];
  const provider = {
    calls,
    async getCode() { return code; },
    async call(tx) {
      calls.push(tx);
      return callImpl(tx);
    },
    // ethers.Contract resolves the address and network through the runner
    async resolveName(name) { return name; },
    async getNetwork() { return { chainId: 8453n, name: 'base' }; },
    provider: null,
  };
  provider.provider = provider;
  return provider;
}

const magicReturn = ethers.zeroPadBytes(EIP1271_MAGIC_VALUE, 32);
const nonMagicReturn = ethers.zeroPadBytes('0xffffffff', 32);

let wallet;
let bountyId;
let message;
let eoaSig;

beforeEach(async () => {
  wallet = ethers.Wallet.createRandom();
  bountyId = 101;
  message = buildPublicSubmissionsMessage({ bountyId, publicSubmissions: true });
  eoaSig = await wallet.signMessage(message);
});

describe('EOA creators (ecrecover, unchanged)', () => {
  test('valid EOA signature passes without touching the provider', async () => {
    const provider = makeProvider({ callImpl: () => { throw new Error('should not be called'); } });
    const parsed = await verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: wallet.address, expectedBountyId: bountyId, provider,
    });
    expect(parsed).toEqual(expect.objectContaining({ bountyId, publicSubmissions: true }));
    expect(provider.calls).toHaveLength(0);
  });

  test('creator address compare is case-insensitive', async () => {
    const parsed = await verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: wallet.address.toLowerCase(), expectedBountyId: bountyId,
      provider: makeProvider({ code: '0x' }),
    });
    expect(parsed.bountyId).toBe(bountyId);
  });

  test('wrong EOA signer is rejected (creator has no code)', async () => {
    const other = ethers.Wallet.createRandom();
    await expect(verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: other.address, expectedBountyId: bountyId,
      provider: makeProvider({ code: '0x' }),
    })).rejects.toThrow('Signature does not match expected signer');
  });

  test('Bounty ID mismatch is rejected before any signature work', async () => {
    await expect(verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: wallet.address, expectedBountyId: 102,
    })).rejects.toThrow('Message Bounty ID does not match path');
  });

  test('expired timestamp is rejected', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const msg = buildPublicSubmissionsMessage({ bountyId, publicSubmissions: true, timestamp: old });
    const sig = await wallet.signMessage(msg);
    await expect(verifyPublicSubmissionsAction({
      message: msg, signature: sig, expectedSigner: wallet.address, expectedBountyId: bountyId,
    })).rejects.toThrow('Signature expired or from the future');
  });

  test('future timestamp is rejected', async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const msg = buildPublicSubmissionsMessage({ bountyId, publicSubmissions: true, timestamp: future });
    const sig = await wallet.signMessage(msg);
    await expect(verifyPublicSubmissionsAction({
      message: msg, signature: sig, expectedSigner: wallet.address, expectedBountyId: bountyId,
    })).rejects.toThrow('Signature expired or from the future');
  });

  test('malformed signature with an EOA creator is rejected with a verification error', async () => {
    await expect(verifyPublicSubmissionsAction({
      message, signature: '0xdeadbeef', expectedSigner: wallet.address, expectedBountyId: bountyId,
      provider: makeProvider({ code: '0x' }),
    })).rejects.toThrow('Signature verification failed');
  });
});

describe('Smart-wallet creators (EIP-1271)', () => {
  test('contract creator returning the magic value passes', async () => {
    const provider = makeProvider({ callImpl: () => magicReturn });
    // Any 65-byte ECDSA signature recovers to some unrelated EOA; the
    // contract wallet is what decides.
    const parsed = await verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: CONTRACT_CREATOR, expectedBountyId: bountyId, provider,
    });
    expect(parsed).toEqual(expect.objectContaining({ bountyId, publicSubmissions: true }));
    expect(provider.calls).toHaveLength(1);
    const tx = provider.calls[0];
    expect(tx.to.toLowerCase()).toBe(CONTRACT_CREATOR.toLowerCase());
    expect(tx.data.slice(0, 10)).toBe(SELECTOR);
    // The hash argument must be hashMessage(message) (EIP-191 personal_sign hash)
    const iface = new ethers.Interface(['function isValidSignature(bytes32,bytes)']);
    const [hash, sig] = iface.decodeFunctionData('isValidSignature', tx.data);
    expect(hash).toBe(ethers.hashMessage(message));
    expect(sig).toBe(eoaSig);
  });

  test('non-ECDSA-shaped smart-wallet signature blob passes when the contract accepts it', async () => {
    const provider = makeProvider({ callImpl: () => magicReturn });
    // Coinbase Smart Wallet signatures are ABI-encoded SignatureWrapper
    // structs, not 65-byte r/s/v — ecrecover throws on them.
    const blob = '0x' + '00'.repeat(20) + 'ab'.repeat(100);
    const parsed = await verifyPublicSubmissionsAction({
      message, signature: blob, expectedSigner: CONTRACT_CREATOR, expectedBountyId: bountyId, provider,
    });
    expect(parsed.publicSubmissions).toBe(true);
  });

  test('non-magic return value is rejected', async () => {
    const provider = makeProvider({ callImpl: () => nonMagicReturn });
    await expect(verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: CONTRACT_CREATOR, expectedBountyId: bountyId, provider,
    })).rejects.toThrow('Signature does not match expected signer');
  });

  test('isValidSignature revert is rejected, not thrown as a 500-class error', async () => {
    const provider = makeProvider({ callImpl: () => { const e = new Error('execution reverted'); e.code = 'CALL_EXCEPTION'; throw e; } });
    await expect(verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: CONTRACT_CREATOR, expectedBountyId: bountyId, provider,
    })).rejects.toThrow('Signature does not match expected signer');
  });

  test('RPC failure never results in acceptance', async () => {
    const provider = makeProvider({ callImpl: () => { throw new Error('ECONNRESET'); } });
    provider.getCode = async () => { throw new Error('ECONNRESET'); };
    await expect(verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: CONTRACT_CREATOR, expectedBountyId: bountyId, provider,
    })).rejects.toThrow('Signature does not match expected signer');
  });

  test('empty return data is rejected', async () => {
    const provider = makeProvider({ callImpl: () => '0x' });
    await expect(verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: CONTRACT_CREATOR, expectedBountyId: bountyId, provider,
    })).rejects.toThrow('Signature does not match expected signer');
  });

  test('a contract creator with a wrong Bounty ID / body mismatch still fails before RPC', async () => {
    const provider = makeProvider({ callImpl: () => magicReturn });
    await expect(verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: CONTRACT_CREATOR, expectedBountyId: 7, provider,
    })).rejects.toThrow('Message Bounty ID does not match path');
    expect(provider.calls).toHaveLength(0);
  });

  test('isValidContractSignature is false for an address with no code', async () => {
    const provider = makeProvider({ code: '0x', callImpl: () => magicReturn });
    const ok = await isValidContractSignature({ provider, signer: CONTRACT_CREATOR, message, signature: eoaSig });
    expect(ok).toBe(false);
    expect(provider.calls).toHaveLength(0);
  });
});

describe('Verifier is async and callers must await it', () => {
  test('returns a Promise', () => {
    const r = verifyPublicSubmissionsAction({
      message, signature: eoaSig, expectedSigner: wallet.address, expectedBountyId: bountyId,
    });
    expect(r).toBeInstanceOf(Promise);
    return r;
  });
});
