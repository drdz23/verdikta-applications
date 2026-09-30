jest.mock('../config', () => ({
  config: {
    network: 'base-sepolia',
    chainId: 84532,
    bountyEscrowAddress: '0x' + '11'.repeat(20),
    submissionDefaults: { maxOracleFeeWei: '20000000000000', alpha: 500, estimatedBaseCostWei: '10000000000000', maxFeeBasedScaling: 3 }
  }
}));
jest.mock('../utils/verdiktaService', () => ({ isVerdiktaServiceAvailable: () => false }));
jest.mock('../utils/contractService', () => ({ getContractService: () => ({ provider: {}, contract: {} }) }));
jest.mock('../utils/jobStorage', () => ({ readStorage: jest.fn(async () => ({ jobs: [] })), listJobs: jest.fn(async () => []) }));

const express = require('express');
const request = require('supertest');
const logger = require('../utils/logger');
const { resetEthPriceCache } = require('../utils/ethPrice');

const app = express();
app.use('/jobs', require('../routes/jobRoutes'));

const realFetch = global.fetch;

beforeEach(() => {
  resetEthPriceCache();
  jest.spyOn(logger, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = realFetch;
});

test('GET /jobs/eth-price answers from Coinbase', async () => {
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify({ data: { amount: '2673.015', base: 'ETH', currency: 'USD' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
  const res = await request(app).get('/jobs/eth-price');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ usd: 2673.015, source: 'coinbase' });
});

test('GET /jobs/eth-price keeps { usd: 0, stale: true } when every source is down', async () => {
  global.fetch = jest.fn(async () => new Response('<html>Request blocked</html>', { status: 403 }));
  const res = await request(app).get('/jobs/eth-price');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ usd: 0, stale: true });
});
