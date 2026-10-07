/**
 * getAggHistory outcome labels for settled rounds with no commits (#40).
 *
 * The chain reads are stubbed on a real VerdiktaService instance so the
 * outcome logic runs unchanged: getAggregationStatus reports a round that
 * started an hour ago with no commits, and getLogs returns only the
 * OracleSelected events each case supplies.
 */
const { ethers } = require('ethers');
const { VerdiktaService, LIKELY_MALFORMED_OUTCOME } = require('../utils/verdiktaService');

const AGG_ID = '0x9d02b66c55369fa170307f235598f54c5a2630c1d98d151d417f158442e9001a';
const CURRENT_BLOCK = 50_000_000;

function makeService({ oracleSelectedSlots = 0 } = {}) {
  const svc = new VerdiktaService('http://127.0.0.1:1', '0x' + '1'.repeat(40), 0);
  const iface = svc.aggregator.interface;
  const selectedTopic = iface.getEvent('OracleSelected').topicHash;

  const logFor = (eventName, args, i) => {
    const { data, topics } = iface.encodeEventLog(iface.getEvent(eventName), args);
    return { data, topics, blockNumber: CURRENT_BLOCK - 1500 + i, transactionHash: ethers.zeroPadValue(ethers.toBeHex(i + 1), 32) };
  };
  const selectedLogs = Array.from({ length: oracleSelectedSlots }, (_, i) =>
    logFor('OracleSelected', [AGG_ID, i, ethers.getAddress('0x' + String(i + 2).repeat(40)), ethers.ZeroHash], i));

  svc.provider = { getBlockNumber: async () => CURRENT_BLOCK };
  svc._getBlockTimestamps = async () => ({});
  svc._getLogsChunked = async (topics) => {
    if (topics[0] === selectedTopic) return selectedLogs;
    return [];
  };
  svc.aggregator = {
    interface: iface,
    commitOraclesToPoll: async () => 6n,
    oraclesToPoll: async () => 4n,
    requiredResponses: async () => 3n,
    maxLikelihoodLength: async () => 2n,
    getAggregationStatus: async () => ({
      commitPhaseComplete: false, commitExpected: 6n, commitReceived: 0n, responseCount: 0n,
      requiredN: 3n, clusterP: 2n, requester: ethers.ZeroAddress,
      startTimestamp: BigInt(Math.floor(Date.now() / 1000) - 3600), isComplete: false, failed: false,
    }),
  };
  return svc;
}

describe('getAggHistory zero-commit outcome', () => {
  it('labels a settled round with selected oracles but no commits LIKELY MALFORMED', async () => {
    const h = await makeService({ oracleSelectedSlots: 6 }).getAggHistory(AGG_ID);
    expect(h.analysis.totalSlots).toBe(6);
    expect(h.analysis.committed).toBe(0);
    expect(h.outcome).toBe(LIKELY_MALFORMED_OUTCOME);
    expect(h.analysis.likelyMalformed).toBe(true);
  });

  it('does not label it malformed when the scan found no selected oracles at all', async () => {
    const h = await makeService({ oracleSelectedSlots: 0 }).getAggHistory(AGG_ID);
    expect(h.analysis.totalSlots).toBe(0);
    expect(h.outcome).not.toBe(LIKELY_MALFORMED_OUTCOME);
    expect(h.outcome).toMatch(/^FAILED/);
    expect(h.analysis.likelyMalformed).toBe(false);
  });
});
