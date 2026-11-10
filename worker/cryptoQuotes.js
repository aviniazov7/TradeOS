// Spot quotes for the price ticker.
// Bybit's public tickers answer 403 to Cloudflare Worker egress (CloudFront
// country block). Yahoo's chart API is the same host the futures and stock
// routes already reach from this Worker, so a Bybit miss falls through to it.
// Shape stays { SYM: { price, change24h } }.

export const BYBIT_SPOT_URL = 'https://api.bybit.com/v5/market/tickers?category=spot';

export function yahooCryptoUrl(symbol) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}-USD?interval=1d&range=2d`;
}

export function quotesFromBybit(payload, symbols) {
  const list = payload?.result?.list;
  if (!Array.isArray(list) || !list.length) return null;
  const bySym = {};
  for (const row of list) if (row?.symbol) bySym[row.symbol] = row;
  const out = {};
  for (const sym of symbols) {
    const row = bySym[`${sym}USDT`];
    if (!row) continue;
    const price = parseFloat(row.lastPrice);
    if (!Number.isFinite(price)) continue;
    out[sym] = { price, change24h: (parseFloat(row.price24hPcnt) || 0) * 100 };
  }
  return Object.keys(out).length ? out : null;
}

export function quoteFromYahooChart(payload) {
  const meta = payload?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  const prev = meta?.chartPreviousClose ?? meta?.previousClose;
  const change24h = (typeof prev === 'number' && prev > 0) ? ((price - prev) / prev) * 100 : 0;
  return { price, change24h };
}

async function quotesFromYahoo(symbols, fetchImpl) {
  const out = {};
  await Promise.all(symbols.map(async (sym) => {
    try {
      const res = await fetchImpl(yahooCryptoUrl(sym), {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res?.ok) return;
      const row = quoteFromYahooChart(await res.json());
      if (row) out[sym] = row;
    } catch { /* one symbol must not blank the rest */ }
  }));
  return Object.keys(out).length ? out : null;
}

/**
 * Bybit first. Any non-OK, thrown, or empty Bybit body uses Yahoo.
 * Returns { quotes, source } with quotes null when both miss.
 */
export async function resolveCryptoQuotes(symbols, fetchImpl = fetch) {
  const wanted = Array.isArray(symbols) ? symbols : [];
  try {
    const res = await fetchImpl(BYBIT_SPOT_URL, { headers: { Accept: 'application/json' } });
    if (res?.ok) {
      const parsed = quotesFromBybit(await res.json(), wanted);
      if (parsed) return { quotes: parsed, source: 'bybit' };
    }
  } catch { /* Yahoo covers a blocked Bybit */ }
  const quotes = await quotesFromYahoo(wanted, fetchImpl);
  return { quotes, source: quotes ? 'yahoo' : 'none' };
}
