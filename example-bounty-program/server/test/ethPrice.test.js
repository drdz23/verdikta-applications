const logger = require('../utils/logger');
const { getEthPriceUsd, resetEthPriceCache, CACHE_MS, RETRY_MS } = require('../utils/ethPrice');

const COINBASE = 'https://api.coinbase.com/v2/prices/ETH-USD/spot';
const COINGECKO = 'https://api.coingecko.com/api/v3/simple/price';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// What CoinGecko's edge returns for keyless requests since 2026-09-29.
const blocked = () =>
  new Response('<HTML><TITLE>ERROR: The request could not be satisfied</TITLE>Request blocked.</HTML>', {
    status: 403,
    headers: { 'content-type': 'text/html' }
  });
const coinbaseOk = (amount = '2673.015') => () => json({ data: { amount, base: 'ETH', currency: 'USD' } });
const coingeckoOk = (usd = 2671.81) => () => json({ ethereum: { usd } });

const realFetch = global.fetch;
let now;

// Route each upstream URL to a handler that builds a fresh Response per call.
function upstream({ coinbase, coingecko }) {
  global.fetch = jest.fn(async (url, opts) => {
    if (url.startsWith(COINBASE)) return coinbase(url, opts);
    if (url.startsWith(COINGECKO)) return coingecko(url, opts);
    throw new Error(`unexpected upstream ${url}`);
  });
  return global.fetch;
}

beforeEach(() => {
  resetEthPriceCache();
  delete process.env.COINGECKO_API_KEY;
  now = 1_800_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(logger, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = realFetch;
  delete process.env.COINGECKO_API_KEY;
});

describe('getEthPriceUsd sources', () => {
  test('uses the Coinbase spot price first, without any key', async () => {
    const fetch = upstream({ coinbase: coinbaseOk(), coingecko: coingeckoOk() });
    await expect(getEthPriceUsd()).resolves.toEqual({ usd: 2673.015, source: 'coinbase' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(COINBASE);
  });

  test('falls back to keyless CoinGecko when Coinbase fails', async () => {
    const fetch = upstream({ coinbase: () => json({ message: 'unavailable' }, 503), coingecko: coingeckoOk() });
    await expect(getEthPriceUsd()).resolves.toEqual({ usd: 2671.81, source: 'coingecko' });
    const [, opts] = fetch.mock.calls[1];
    expect(opts.headers).not.toHaveProperty('x-cg-demo-api-key');
  });

  test('sends COINGECKO_API_KEY as the demo key header when configured', async () => {
    process.env.COINGECKO_API_KEY = 'CG-test-key';
    const fetch = upstream({
      coinbase: async () => { throw new TypeError('fetch failed'); },
      coingecko: coingeckoOk()
    });
    await expect(getEthPriceUsd()).resolves.toEqual({ usd: 2671.81, source: 'coingecko' });
    expect(fetch.mock.calls[1][1].headers['x-cg-demo-api-key']).toBe('CG-test-key');
  });

  test.each([
    ['zero', () => json({ data: { amount: '0' } })],
    ['non-numeric', () => json({ data: { amount: 'abc' } })],
    ['missing amount', () => json({ data: {} })],
    ['HTML body with 200', () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })]
  ])('rejects a %s Coinbase answer and uses the fallback', async (_label, coinbase) => {
    upstream({ coinbase, coingecko: coingeckoOk() });
    await expect(getEthPriceUsd()).resolves.toEqual({ usd: 2671.81, source: 'coingecko' });
  });

  test('keeps the old response contract when no price is available since startup', async () => {
    upstream({ coinbase: blocked, coingecko: blocked });
    await expect(getEthPriceUsd()).resolves.toEqual({ usd: 0, stale: true });
    expect(logger.warn).toHaveBeenCalledWith('[eth-price] all sources failed', expect.any(Object));
  });
});

describe('getEthPriceUsd caching', () => {
  test('serves a good price from cache for CACHE_MS, then refreshes', async () => {
    const fetch = upstream({ coinbase: coinbaseOk(), coingecko: coingeckoOk() });
    await getEthPriceUsd();
    now += CACHE_MS - 1;
    await expect(getEthPriceUsd()).resolves.toEqual({ usd: 2673.015, source: 'coinbase', cached: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 1;
    await getEthPriceUsd();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('returns the last good price, marked stale with its age, when every source fails', async () => {
    upstream({ coinbase: coinbaseOk(), coingecko: coingeckoOk() });
    await getEthPriceUsd();
    now += CACHE_MS + 5000;
    upstream({ coinbase: blocked, coingecko: blocked });
    await expect(getEthPriceUsd()).resolves.toEqual({
      usd: 2673.015,
      source: 'coinbase',
      stale: true,
      ageSeconds: (CACHE_MS + 5000) / 1000
    });
  });

  test('a rate-limited CoinGecko (JSON 429) never turns a known price into 0', async () => {
    upstream({ coinbase: coinbaseOk(), coingecko: coingeckoOk() });
    await getEthPriceUsd();
    now += CACHE_MS;
    upstream({
      coinbase: () => json({ message: 'unavailable' }, 503),
      coingecko: () => json({ status: { error_code: 429, error_message: 'rate limited' } }, 429)
    });
    await expect(getEthPriceUsd()).resolves.toMatchObject({ usd: 2673.015, stale: true });
  });

  test('does not retry upstream for RETRY_MS after a failed refresh', async () => {
    const fetch = upstream({ coinbase: blocked, coingecko: blocked });
    await getEthPriceUsd();
    expect(fetch).toHaveBeenCalledTimes(2);
    now += RETRY_MS - 1;
    await expect(getEthPriceUsd()).resolves.toEqual({ usd: 0, stale: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    now += 1;
    await getEthPriceUsd();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test('concurrent requests share one upstream refresh', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const fetch = upstream({ coinbase: async () => { await gate; return coinbaseOk()(); }, coingecko: coingeckoOk() });
    const pending = [getEthPriceUsd(), getEthPriceUsd(), getEthPriceUsd()];
    release();
    const results = await Promise.all(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results).toEqual(Array(3).fill({ usd: 2673.015, source: 'coinbase' }));
  });
});
