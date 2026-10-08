// Browser-direct Bybit v5 public market data.
//
// Fallback path for when the Worker's /bnb and /cx routes fail (the Worker's
// Cloudflare egress is periodically blocked by upstream exchanges). Bybit's
// public market endpoints are CORS-enabled and serve Israeli ISPs, unlike
// api.binance.com / fapi.binance.com which geo-block browsers here.

const BYBIT = 'https://api.bybit.com';

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function getJson(url, ms = 8000) {
  const t = withTimeout(ms);
  try {
    const res = await fetch(url, { signal: t.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    t.done();
  }
}

// Translate a Bybit spot ticker to the Binance /api/v3/ticker/24hr shape the
// market-overview pipeline consumes (same mapping the Worker applies).
function spotToBinance(t) {
  return {
    symbol: t.symbol,
    lastPrice: t.lastPrice,
    // Binance reports percent units; Bybit's price24hPcnt is a fraction.
    priceChangePercent: String((parseFloat(t.price24hPcnt) || 0) * 100),
    highPrice: t.highPrice24h,
    lowPrice: t.lowPrice24h,
    volume: t.volume24h,
    quoteVolume: t.turnover24h,
    // Binance exposes a 24h trade count used to filter dead pairs; Bybit has
    // no equivalent, so report a passing constant and let the $-volume filter decide.
    count: '100000',
  };
}

// All Bybit spot tickers, Binance-shaped. Returns null on failure.
export async function fetchSpotTickersAsBinance() {
  const j = await getJson(`${BYBIT}/v5/market/tickers?category=spot`);
  const list = j?.result?.list;
  if (!Array.isArray(list) || !list.length) return null;
  return list.map(spotToBinance);
}

// Spot quotes for specific symbols: { BTC: { price, change24h }, … }.
// Same shape as the Worker's /cx/quotes. Returns null on failure.
export async function fetchSpotQuotes(symbols) {
  const j = await getJson(`${BYBIT}/v5/market/tickers?category=spot`);
  const list = j?.result?.list;
  if (!Array.isArray(list) || !list.length) return null;
  const bySym = {};
  for (const t of list) bySym[t.symbol] = t;
  const out = {};
  for (const sym of symbols) {
    const t = bySym[`${sym}USDT`];
    if (!t) continue;
    const price = parseFloat(t.lastPrice);
    if (!Number.isFinite(price)) continue;
    out[sym] = { price, change24h: (parseFloat(t.price24hPcnt) || 0) * 100 };
  }
  return Object.keys(out).length ? out : null;
}

// All Bybit linear (USDT-perp) tickers — fundingRate, nextFundingTime,
// markPrice, openInterest, openInterestValue. Returns null on failure.
export async function fetchLinearTickers() {
  const j = await getJson(`${BYBIT}/v5/market/tickers?category=linear`);
  const list = j?.result?.list;
  return Array.isArray(list) && list.length ? list : null;
}

// Latest long/short account ratio for one perp symbol (e.g. 'BTCUSDT').
// Returns { longAccount, shortAccount, ratio } or null.
export async function fetchAccountRatio(symbol) {
  const j = await getJson(`${BYBIT}/v5/market/account-ratio?category=linear&symbol=${encodeURIComponent(symbol)}&period=5min&limit=1`);
  const row = j?.result?.list?.[0];
  if (!row) return null;
  const longAccount = parseFloat(row.buyRatio);
  const shortAccount = parseFloat(row.sellRatio);
  if (!Number.isFinite(longAccount) || !Number.isFinite(shortAccount)) return null;
  return { longAccount, shortAccount, ratio: shortAccount > 0 ? longAccount / shortAccount : 0 };
}

// Last prices for journal pairs (e.g. 'BTCUSDT') — one perp call for all,
// topping up from spot for pairs that only trade there.
export async function fetchPerpPrices(pairs) {
  if (!pairs?.length) return {};
  const out = {};
  const fill = (list) => {
    if (!Array.isArray(list)) return;
    const bySym = {};
    for (const t of list) bySym[t.symbol] = t;
    for (const p of pairs) {
      if (out[p] != null) continue;
      const price = parseFloat(bySym[p]?.lastPrice);
      if (Number.isFinite(price)) out[p] = price;
    }
  };
  const linear = await getJson(`${BYBIT}/v5/market/tickers?category=linear`);
  fill(linear?.result?.list);
  if (Object.keys(out).length < pairs.length) {
    const spot = await getJson(`${BYBIT}/v5/market/tickers?category=spot`);
    fill(spot?.result?.list);
  }
  return out;
}

// Live MARK prices for perp pairs (e.g. 'BTCUSDT') — the trading terminal's
// between-polls price. A handful of pairs → one tiny per-symbol call each;
// more → the one full linear ticker list. Pairs Bybit doesn't list are
// simply missing from the result. { BTCUSDT: 64123.5, … }
export async function fetchPerpMarks(pairs) {
  const list = [...new Set((pairs || []).map((p) => String(p).toUpperCase()))].filter((p) => /^[A-Z0-9]{2,30}$/.test(p));
  if (!list.length) return {};
  const out = {};
  const take = (t) => {
    const price = parseFloat(t?.markPrice) || parseFloat(t?.lastPrice);
    if (t?.symbol && Number.isFinite(price) && price > 0) out[t.symbol] = price;
  };
  if (list.length > 6) {
    const j = await getJson(`${BYBIT}/v5/market/tickers?category=linear`);
    const wanted = new Set(list);
    for (const t of j?.result?.list || []) if (wanted.has(t.symbol)) take(t);
    return out;
  }
  const rows = await Promise.all(list.map((p) => getJson(`${BYBIT}/v5/market/tickers?category=linear&symbol=${encodeURIComponent(p)}`, 5000)));
  for (const j of rows) take(j?.result?.list?.[0]);
  return out;
}

// Liquidity snapshot for the coin-analysis screen — replaces six direct
// Binance calls (book ticker, OI, funding, depth) with Bybit equivalents,
// translated to the Binance field names the UI consumes.
export async function fetchAnalysisLiquidity(pair) {
  const [spotJ, linearJ, depthJ] = await Promise.all([
    getJson(`${BYBIT}/v5/market/tickers?category=spot&symbol=${encodeURIComponent(pair)}`),
    getJson(`${BYBIT}/v5/market/tickers?category=linear&symbol=${encodeURIComponent(pair)}`),
    getJson(`${BYBIT}/v5/market/orderbook?category=spot&symbol=${encodeURIComponent(pair)}&limit=20`),
  ]);
  const spot = spotJ?.result?.list?.[0] || null;
  const linear = linearJ?.result?.list?.[0] || null;
  const ob = depthJ?.result;
  return {
    onBybitSpot: !!spot,
    bookTicker: spot ? {
      symbol: pair,
      bidPrice: spot.bid1Price, bidQty: spot.bid1Size,
      askPrice: spot.ask1Price, askQty: spot.ask1Size,
    } : null,
    openInterest: linear?.openInterest ? { symbol: pair, openInterest: linear.openInterest } : null,
    funding: linear ? {
      symbol: pair,
      lastFundingRate: linear.fundingRate,
      markPrice: linear.markPrice,
      nextFundingTime: Number(linear.nextFundingTime),
    } : null,
    depth: (ob?.b?.length || ob?.a?.length) ? { bids: ob.b || [], asks: ob.a || [] } : null,
  };
}
