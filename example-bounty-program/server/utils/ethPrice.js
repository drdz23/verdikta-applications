/**
 * ETH/USD spot price for the website's USD hints, receipts and agents' USD
 * spend caps (GET /api/jobs/eth-price).
 *
 * Sources, in order:
 *   1. Coinbase public spot price (no key required).
 *   2. CoinGecko simple/price. CoinGecko started rejecting keyless market-data
 *      requests with an HTML 403 on 2026-09-29, so set COINGECKO_API_KEY (a
 *      free Demo key) to make this fallback reliable. Without a key the
 *      keyless request is still attempted.
 *
 * A good price is cached for CACHE_MS. When every source fails, the last good
 * price is returned with `stale: true` (and its age), or `usd: 0` if there has
 * been none since startup. After a failed refresh, sources are not retried for
 * RETRY_MS so an outage does not turn every request into upstream calls.
 */

const logger = require('./logger');

const CACHE_MS = 60_000;
const RETRY_MS = 15_000;
const TIMEOUT_MS = 5000;
const COINBASE_URL = 'https://api.coinbase.com/v2/prices/ETH-USD/spot';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function positivePrice(value) {
  const usd = Number(value);
  if (value == null || value === '' || !Number.isFinite(usd) || usd <= 0) {
    throw new Error(`invalid price ${JSON.stringify(value)}`);
  }
  return usd;
}

const SOURCES = [
  {
    name: 'coinbase',
    price: async () => positivePrice((await fetchJson(COINBASE_URL))?.data?.amount)
  },
  {
    name: 'coingecko',
    price: async () => {
      const key = process.env.COINGECKO_API_KEY;
      const data = await fetchJson(COINGECKO_URL, key ? { 'x-cg-demo-api-key': key } : {});
      return positivePrice(data?.ethereum?.usd);
    }
  }
];

let last = { usd: 0, source: null, fetchedAt: 0 };
let failedAt = 0;
let inflight = null;

function staleResult() {
  if (!(last.usd > 0)) return { usd: 0, stale: true };
  return {
    usd: last.usd,
    source: last.source,
    stale: true,
    ageSeconds: Math.floor((Date.now() - last.fetchedAt) / 1000)
  };
}

async function refresh() {
  for (const source of SOURCES) {
    try {
      const usd = await source.price();
      last = { usd, source: source.name, fetchedAt: Date.now() };
      failedAt = 0;
      return { usd, source: source.name };
    } catch (err) {
      logger.warn('[eth-price] source failed', { source: source.name, msg: err.message });
    }
  }
  failedAt = Date.now();
  logger.warn('[eth-price] all sources failed', { lastUsd: last.usd || null, lastSource: last.source });
  return staleResult();
}

/**
 * Resolve the current ETH price. Never throws.
 * @returns {Promise<{usd: number, source?: string, cached?: boolean, stale?: boolean, ageSeconds?: number}>}
 */
async function getEthPriceUsd() {
  const now = Date.now();
  if (last.usd > 0 && now - last.fetchedAt < CACHE_MS) {
    return { usd: last.usd, source: last.source, cached: true };
  }
  if (failedAt && now - failedAt < RETRY_MS) return staleResult();
  // Concurrent requests share one upstream refresh.
  if (!inflight) inflight = refresh().finally(() => { inflight = null; });
  return inflight;
}

/** Test helper: forget cached prices and failure backoff. */
function resetEthPriceCache() {
  last = { usd: 0, source: null, fetchedAt: 0 };
  failedAt = 0;
  inflight = null;
}

module.exports = { getEthPriceUsd, resetEthPriceCache, CACHE_MS, RETRY_MS };
