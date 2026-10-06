/**
 * Route wiring for the hunter archive shape check (#34):
 *  - /submit/prepare blocks a malformed hunterCid (400) and reports an unreachable
 *    one as a gateway problem (502), never as malformed.
 *  - /submissions/confirm records archiveShape without blocking, and an unreachable
 *    CID is recorded as 'unknown', never 'malformed(...)'.
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
jest.mock('../config', () => ({ config: { network: 'base-sepolia', bountyEscrowAddress: '0xabc123', chainId: 84532, explorer: 'https://sepolia.basescan.org',
  submissionDefaults: { maxOracleFeeWei: '20000000000000', alpha: 500, estimatedBaseCostWei: '10000000000000', maxFeeBasedScaling: 3 } } }));
let mockGetSubmission = jest.fn();
jest.mock('../utils/contractService', () => ({ getContractService: () => ({ contract: { getSubmission: (...a) => mockGetSubmission(...a) } }) }));

const AdmZip = require('adm-zip');
const express = require('express');
const request = require('supertest');
const jobRoutes = require('../routes/jobRoutes');
const { CONFORMING_SHAPE_EXAMPLE } = require('../utils/archiveShapeValidator');

const HUNTER = '0x' + '1'.repeat(40);
const ZERO = '0x' + '0'.repeat(40);
const ZERO_HASH = '0x' + '0'.repeat(64);
const CID = 'QmPPhtCMngdLhxiKwEbP2Vds9dTWD6rM82piDkxa94kkY5';

function zipOf(files) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content, 'utf8'));
  return zip.toBuffer();
}
const conforming = zipOf({
  'manifest.json': JSON.stringify(CONFORMING_SHAPE_EXAMPLE),
  'primary_query.json': JSON.stringify({ query: 'This is my submitted work, please review it.' }),
});
// Bounty 59 shape: primary file is markdown.
const bounty59 = zipOf({
  'manifest.json': JSON.stringify({ version: '1.0', name: 'submittedWork', primary: { filename: 'submission.md' } }),
  'submission.md': '# My work',
});

const chainPrepared = () => ({ status: 0n, hunter: HUNTER, hunterCid: CID, evalWallet: '0x' + '2'.repeat(40), verdiktaAggId: ZERO_HASH,
  acceptance: 0n, rejection: 0n, submittedAt: 1789000000n, finalizedAt: 0n, ethMaxBudget: 240000000000000n, creatorWindowEnd: 0n, funder: ZERO });
function makeJob() { return { jobId: 7, title: 'T', creator: '0xcreator', bountyAmount: 0.01, threshold: 70, evaluationCid: 'QmEval', status: 'OPEN', createdAt: 1789000000, submissionCount: 0, submissions: [], contractAddress: '0xabc123', onChain: true, syncedFromBlockchain: true }; }

const app = express();
app.use(express.json());
app.use('/api/jobs', jobRoutes);

const realFetch = global.fetch;
const serve = (buf) => { global.fetch = jest.fn(async () => new Response(buf)); };
const unreachable = () => { global.fetch = jest.fn(async () => { throw new Error('ECONNREFUSED'); }); };

beforeEach(() => {
  mockStorageData = { jobs: [makeJob()], nextId: 8 };
  mockGetSubmission = jest.fn().mockResolvedValue(chainPrepared());
});
afterAll(() => { global.fetch = realFetch; });

describe('POST /:jobId/submit/prepare shape check', () => {
  const prepare = () => request(app).post('/api/jobs/7/submit/prepare').send({ hunter: HUNTER, hunterCid: CID });

  it('returns calldata for a conforming archive', async () => {
    serve(conforming);
    const res = await prepare();
    expect(res.status).toBe(200);
    expect(res.body.transaction.data).toMatch(/^0x/);
  });

  it('rejects the bounty-59 shape with 400 MALFORMED_HUNTER_CID naming primary-not-json', async () => {
    serve(bounty59);
    const res = await prepare();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_HUNTER_CID');
    expect(res.body.error).toMatch(/primary-not-json/);
    expect(res.body.conformingShape).toEqual(CONFORMING_SHAPE_EXAMPLE);
  });

  it('reports an unreachable CID as 502 HUNTER_CID_UNREACHABLE, not malformed', async () => {
    unreachable();
    const res = await prepare();
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('HUNTER_CID_UNREACHABLE');
    expect(res.body.retryable).toBe(true);
  });
});

describe('POST /:jobId/submissions/confirm archiveShape', () => {
  const confirm = () => request(app).post('/api/jobs/7/submissions/confirm').send({ submissionId: 0, hunter: HUNTER, hunterCid: CID });

  it('records "ok" for a conforming archive', async () => {
    serve(conforming);
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.submission.archiveShape).toBe('ok');
    expect(mockStorageData.jobs[0].submissions[0].archiveShape).toBe('ok');
  });

  it('records "malformed(<check>)" but still saves the submission', async () => {
    serve(bounty59);
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.submission.archiveShape).toBe('malformed(primary-not-json)');
    expect(mockStorageData.jobs[0].submissions).toHaveLength(1);
  });

  it('records "unknown" when no gateway can deliver the CID', async () => {
    unreachable();
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.submission.archiveShape).toBe('unknown');
  });
});
