/**
 * GET /:jobId/onchain-status reports payoutWei as the LIVE escrow (the raw struct
 * payoutWei, zeroed by the contract on payout or refund), and the funded amount
 * separately as bountyAmountWei. Regression: after bountyAmountWei became the funded
 * amount, payoutWei briefly reported 0.001 ETH "still escrowed" for AWARDED/CLOSED
 * bounties whose on-chain payoutWei was 0.
 */
let mockStorageData = { jobs: [], nextId: 0 };
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, promises: { ...actual.promises,
    mkdir: jest.fn().mockResolvedValue(undefined), access: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockImplementation(() => Promise.resolve(JSON.stringify(mockStorageData))),
    writeFile: jest.fn().mockImplementation((_p, data) => { mockStorageData = JSON.parse(data); return Promise.resolve(); }),
    rename: jest.fn().mockResolvedValue(undefined) } };
});
jest.mock('../config', () => ({ config: { network: 'base-sepolia', bountyEscrowAddress: '0xabc123', chainId: 84532, explorer: 'https://sepolia.basescan.org' } }));

const { ethers } = require('ethers');
const ZERO = ethers.ZeroAddress;
const CREATOR = '0x' + 'c'.repeat(40);
const HUNTER = '0x' + '1'.repeat(40);
const FUNDED = 1000000000000000n;
// Raw getBounty() struct as ethers returns it (named fields).
const chainStruct = (over = {}) => ({ creator: CREATOR, evaluationCid: 'QmEval', requestedClass: 128n, threshold: 85n, payoutWei: FUNDED,
  createdAt: 1790000000n, submissionDeadline: 1790003600n, status: 0n, winner: ZERO, submissions: 0n, targetHunter: HUNTER,
  creatorDeterminationPayment: FUNDED, arbiterDeterminationPayment: FUNDED, creatorAssessmentWindowSize: 0n,
  oracle: { maxOracleFee: 20000000000000n, alpha: 500n, estimatedBaseCost: 10000000000000n, maxFeeBasedScaling: 3n }, ...over });

let mockStruct = chainStruct();
jest.mock('../utils/contractService', () => {
  const actual = jest.requireActual('../utils/contractService');
  const service = Object.create(actual.ContractService.prototype);
  service.contract = {
    getBounty: async () => mockStruct,
    requiredPrepay: async () => 240000000000000n,
    prepareCutoff: async () => 1790003590n
  };
  return { ...actual, getContractService: () => service };
});

const express = require('express');
const request = require('supertest');
const jobRoutes = require('../routes/jobRoutes');
const { getContractService } = require('../utils/contractService');
const app = express();
app.use(express.json());
app.use('/api/jobs', jobRoutes);

beforeEach(() => { mockStorageData = { jobs: [], nextId: 0 }; mockStruct = chainStruct(); });

describe('contractService.getBounty amount fields', () => {
  it('keeps the funded amount and exposes the live escrow separately', async () => {
    mockStruct = chainStruct({ status: 1n, payoutWei: 0n, winner: HUNTER, submissions: 1n });
    const b = await getContractService().getBounty(7);
    expect(b.bountyAmountWei).toBe('1000000000000000');
    expect(b.escrowWei).toBe('0');
  });
});

describe('GET /api/jobs/:id/onchain-status', () => {
  it('reports zero escrow and the funded amount for an AWARDED bounty', async () => {
    mockStruct = chainStruct({ status: 1n, payoutWei: 0n, winner: HUNTER, submissions: 1n });
    const res = await request(app).get('/api/jobs/7/onchain-status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'AWARDED', rawStatus: 1, payoutWei: '0', payoutEth: '0.0',
      bountyAmountWei: '1000000000000000', bountyAmount: '0.001' });
  });

  it('reports zero escrow for a CLOSED (refunded) bounty', async () => {
    mockStruct = chainStruct({ status: 2n, payoutWei: 0n });
    const res = await request(app).get('/api/jobs/6/onchain-status');
    expect(res.body).toMatchObject({ status: 'CLOSED', rawStatus: 2, payoutWei: '0', bountyAmountWei: '1000000000000000' });
  });

  it('reports the full escrow while the bounty is open', async () => {
    const res = await request(app).get('/api/jobs/8/onchain-status');
    expect(res.body).toMatchObject({ rawStatus: 0, payoutWei: '1000000000000000', payoutEth: '0.001',
      bountyAmountWei: '1000000000000000', requiredPrepay: '240000000000000' });
  });
});
