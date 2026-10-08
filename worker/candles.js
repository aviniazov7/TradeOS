// OHLC candles for a time window — feeds the journal's MAE/MFE (max adverse /
// favourable excursion) calculation.
//
// GET /candles?symbol=BTCUSDT&asset=crypto|stocks|futures&from=<ms>&to=<ms>
//   → { symbol, source, interval (minutes), from, to, candles: [{ t, o, h, l, c }] }
//
//   crypto  → Bybit v5 kline (api.bybit.com is reachable from Workers; Binance
//             isn't), linear perp first, spot as fallback.
//   stocks  → Yahoo chart API (same host as /stk/quotes).
//   futures → Yahoo continuous contract (ES → ES=F, same map as /fut/quotes).
//
// The interval is picked automatically so the window is ≤ MAX_CANDLES candles
// (finest available first: MAE/MFE is only as precise as the candles). The
// window is aligned to that interval, so repeat lookups of the same trade hit
// the same cache key. Edge-cached in caches.default (free) — never KV: a fully
// past window is immutable and kept for a week; one reaching "now" for 60s.

export const MAX_CANDLES = 1000;
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const MAX_SPAN = 5 * 365 * DAY;
const EARLIEST = Date.UTC(2000, 0, 1);

// Keep in sync with the /fut/quotes map in index.js.
export const YAHOO_FUT = {
  ES: 'ES=F', MES: 'MES=F', NQ: 'NQ=F', MNQ: 'MNQ=F', YM: 'YM=F', MYM: 'MYM=F',
  RTY: 'RTY=F', M2K: 'M2K=F', CL: 'CL=F', MCL: 'MCL=F', NG: 'NG=F',
  GC: 'GC=F', MGC: 'MGC=F', SI: 'SI=F', ZB: 'ZB=F', ZN: 'ZN=F',
};

// Bybit kline intervals (minutes → API code).
const BYBIT_INTERVALS = [
  [1, '1'], [3, '3'], [5, '5'], [15, '15'], [30, '30'], [60, '60'], [120, '120'],
  [240, '240'], [360, '360'], [720, '720'], [1440, 'D'], [10080, 'W'],
];
// Yahoo intervals with how far back intraday data exists (days).
const YAHOO_INTERVALS = [
  [1, '1m', 29], [2, '2m', 59], [5, '5m', 59], [15, '15m', 59], [30, '30m', 59],
  [60, '60m', 729], [1440, '1d', Infinity], [10080, '1wk', Infinity],
];

/**
 * Finest interval whose aligned window is ≤ MAX_CANDLES candles and (Yahoo)
 * still within that interval's history. Returns [minutes, code] or null.
 */
export function pickInterval(fromMs, toMs, source, now = Date.now()) {
  const table = source === 'yahoo' ? YAHOO_INTERVALS : BYBIT_INTERVALS;
  for (const [minutes, code, maxAgeDays] of table) {
    const step = minutes * MIN;
    const count = Math.floor(toMs / step) - Math.floor(fromMs / step) + 1;
    if (count > MAX_CANDLES) continue;
    if (maxAgeDays !== undefined && now - fromMs > maxAgeDays * DAY) continue;
    return [minutes, code];
  }
  return null;
}

/** Validate the query. Returns { error } or { symbol, asset, from, to }. */
export function parseCandlesQuery(params, now = Date.now()) {
  const asset = String(params.get('asset') || 'crypto').toLowerCase();
  if (!['crypto', 'stocks', 'futures'].includes(asset)) return { error: 'invalid asset' };
  const symbol = String(params.get('symbol') || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-^=/:]{0,19}$/.test(symbol)) return { error: 'invalid symbol' };
  const from = Number(params.get('from'));
  const to = Number(params.get('to'));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < EARLIEST || to <= from) return { error: 'invalid range' };
  if (to - from > MAX_SPAN) return { error: 'range too long' };
  if (from > now) return { error: 'range in the future' };
  return { symbol, asset, from: Math.floor(from), to: Math.min(Math.floor(to), now) };
}

/** Bybit symbols to try for a journal pair ("BTCUSDT", "BTC", "ETH/USDT", "KPEPEUSDT"). */
export function bybitCandidates(symbol) {
  const base = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(USDT|USDC|BUSD|PERP|USD)$/, '');
  if (!base) return [];
  const out = [{ category: 'linear', symbol: `${base}USDT` }];
  // Hyperliquid's kPEPE-style units are Bybit's 1000PEPE.
  if (/^K[A-Z]{3,}$/.test(base)) out.push({ category: 'linear', symbol: `1000${base.slice(1)}USDT` });
  out.push({ category: 'spot', symbol: `${base}USDT` });
  return out;
}

/** Yahoo ticker for a futures symbol: ES, ESZ5, ESZ25, ES1!, ES=F → ES=F. */
export function futuresTicker(symbol) {
  const s = String(symbol).toUpperCase().replace(/=F$|1!$/, '');
  if (YAHOO_FUT[s]) return YAHOO_FUT[s];
  const m = s.match(/^([A-Z0-9]{1,3}?)[FGHJKMNQUVXZ]\d{1,2}$/);
  return m && YAHOO_FUT[m[1]] ? YAHOO_FUT[m[1]] : null;
}

const toNum = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Bybit kline list (newest first, string fields) → ascending candles. */
export function bybitToCandles(list = []) {
  const out = [];
  for (const k of list) {
    const [t, o, h, l, c] = [parseInt(k[0]), toNum(k[1]), toNum(k[2]), toNum(k[3]), toNum(k[4])];
    if (Number.isFinite(t) && o != null && h != null && l != null && c != null) out.push({ t, o, h, l, c });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Yahoo chart result → ascending candles (null bars dropped; TASE agorot → shekels). */
export function yahooToCandles(result) {
  const ts = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0] || {};
  const div = result?.meta?.currency === 'ILA' ? 100 : 1;
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = toNum(q.open?.[i]); const h = toNum(q.high?.[i]); const l = toNum(q.low?.[i]); const c = toNum(q.close?.[i]);
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ t: ts[i] * 1000, o: o / div, h: h / div, l: l / div, c: c / div });
  }
  return out;
}

async function fetchBybit(symbol, from, to, code, fetchImpl) {
  for (const cand of bybitCandidates(symbol)) {
    const u = `https://api.bybit.com/v5/market/kline?category=${cand.category}&symbol=${cand.symbol}&interval=${code}&start=${from}&end=${to}&limit=${MAX_CANDLES}`;
    const r = await fetchImpl(u, { headers: { Accept: 'application/json' } });
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    if (j?.retCode !== 0) continue; // unknown symbol → next candidate
    const candles = bybitToCandles(j.result?.list);
    if (candles.length) return { symbol: cand.symbol, candles };
  }
  return null;
}

async function fetchYahoo(ticker, from, to, code, stepMs, fetchImpl) {
  const p1 = Math.floor(from / 1000);
  const p2 = Math.ceil((to + stepMs) / 1000);
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${code}&period1=${p1}&period2=${p2}&includePrePost=false`;
  const r = await fetchImpl(u, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const res = j?.chart?.result?.[0];
  if (!res) return null;
  const candles = yahooToCandles(res).filter((c) => c.t + stepMs > from && c.t <= to);
  return candles.length ? { symbol: ticker, candles } : null;
}

export async function handleCandlesRoute(request, url, cors, { fetchImpl = fetch, cache = (typeof caches !== 'undefined' ? caches.default : null), now = Date.now() } = {}) {
  const json = (body, status = 200, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', ...extra },
  });
  const q = parseCandlesQuery(url.searchParams, now);
  if (q.error) return json({ error: q.error }, 400);

  let ticker = q.symbol;
  if (q.asset === 'futures') {
    ticker = futuresTicker(q.symbol);
    if (!ticker) return json({ error: 'unsupported futures symbol' }, 400);
  } else if (q.asset === 'stocks') {
    ticker = q.symbol.replace(/USDT$/, '');
    if (!/^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/.test(ticker)) return json({ error: 'invalid symbol' }, 400);
  }
  const source = q.asset === 'crypto' ? 'bybit' : 'yahoo';
  const iv = pickInterval(q.from, q.to, source, now);
  if (!iv) return json({ error: 'range not available at this resolution' }, 400);
  const [minutes, code] = iv;
  const step = minutes * MIN;
  const from = Math.floor(q.from / step) * step;
  const to = Math.floor(q.to / step) * step;

  const cacheKey = new Request(`https://cache.tradeos.internal/candles/${q.asset}/${encodeURIComponent(ticker)}/${code}/${from}/${to}`);
  try {
    const hit = cache ? await cache.match(cacheKey) : null;
    if (hit) return json(await hit.text(), 200, { 'X-Cache': 'HIT' });

    const got = source === 'bybit'
      ? await fetchBybit(ticker, from, to + step - 1, code, fetchImpl)
      : await fetchYahoo(ticker, from, to, code, step, fetchImpl);
    if (!got) return json({ error: 'no data' }, 404);

    const body = JSON.stringify({ symbol: got.symbol, source, interval: minutes, from, to, candles: got.candles });
    // Immutable once the window's last candle has closed.
    const settled = to + 2 * step < now;
    const ttl = settled ? 7 * 24 * 3600 : 60;
    if (cache) {
      try {
        await cache.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } }));
      } catch { /* cache is best-effort */ }
    }
    return json(body, 200, { 'X-Cache': 'MISS', 'Cache-Control': `public, max-age=${settled ? 3600 : 60}` });
  } catch (err) {
    return json({ error: err?.message || 'upstream failed' }, 502);
  }
}
