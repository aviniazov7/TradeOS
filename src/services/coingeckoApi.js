import { WORKER_BASE } from '../config/workerBase';
const CG_BASE = 'https://api.coingecko.com/api/v3';
// Default to the deployed worker (same as exchangeService/NewsPage) so CI builds
// without VITE_WORKER_URL still proxy through the worker instead of hitting
// Binance/CoinGecko directly from the browser (which caused 503/408 on prices).
const WORKER_URL = WORKER_BASE;
// Use worker proxy for CoinGecko (details/charts) and Binance (prices/klines)
const BASE_URL = WORKER_URL ? `${WORKER_URL}/cg` : CG_BASE;
// Binance through worker proxy to avoid CORS / geo-restriction issues in browser
const BINANCE_BASE = WORKER_URL ? `${WORKER_URL}/bnb` : 'https://api.binance.com/api/v3';

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ── Prices (Binance — no rate limits) ────────────────────────────────────────
// Accepts full coin objects [{symbol, coingeckoId}]; returns { coingeckoId: { usd, usd_24h_change } }
export async function fetchPrices(coinsOrIds, signal) {
  if (!coinsOrIds?.length) return {};

  const coins = coinsOrIds.filter(c => typeof c === 'object' && c.symbol);
  if (!coins.length) return {};

  // Binance covers most coins; XAU (gold) has no Binance USDT pair and is
  // always sourced from the CoinGecko fallback below.
  const binanceCoins = coins.filter(c => c.symbol !== 'XAU');

  // Split into chunks — Binance returns 503/408 for very long `symbols=[...]`
  // lists, so request ~25 at a time and merge (a short request returns 200).
  const CHUNK = 25;
  const chunks = [];
  for (let i = 0; i < binanceCoins.length; i += CHUNK) {
    chunks.push(binanceCoins.slice(i, i + CHUNK));
  }

  // allSettled — Binance rejects the WHOLE batch with 400 if a single symbol
  // isn't a valid pair, so one bad chunk must not drop prices for the others.
  const settled = await Promise.allSettled(chunks.map(async (chunk) => {
    const symbolsParam = JSON.stringify(chunk.map(c => `${c.symbol}USDT`));
    const url = `${BINANCE_BASE}/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
    return response.json();
  }));

  if (signal?.aborted) return {};
  const responses = settled.filter(s => s.status === 'fulfilled').map(s => s.value);

  const result = {};
  for (const data of responses) {
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      const sym = item.symbol?.replace('USDT', '');
      const coin = coins.find(c => c.symbol === sym);
      if (coin && item.lastPrice) {
        result[coin.coingeckoId] = {
          usd: parseFloat(item.lastPrice),
          usd_24h_change: parseFloat(item.priceChangePercent ?? 0),
        };
      }
    }
  }

  // CoinGecko fallback for any coin still missing a price — covers XAU (no
  // Binance pair) and the case where Binance is geo-blocked (HTTP 451) at a
  // Cloudflare colo and returns nothing. CoinGecko isn't geo-blocked and is
  // KV-cached. Same return shape: { coingeckoId: { usd, … } }.
  if (!signal?.aborted) {
    const missingIds = [...new Set(
      coins.map(c => c.coingeckoId).filter(id => id && !result[id])
    )];
    if (missingIds.length) {
      try {
        const cgUrl = `${BASE_URL}/simple/price?ids=${encodeURIComponent(missingIds.join(','))}&vs_currencies=usd&include_24hr_change=true`;
        const r = await fetch(cgUrl, { signal });
        if (r.ok) {
          const cg = await r.json();
          for (const [id, v] of Object.entries(cg)) {
            if (v && typeof v.usd === 'number') {
              result[id] = { usd: v.usd, usd_24h_change: v.usd_24h_change ?? 0 };
            }
          }
        }
      } catch { /* keep whatever we have (possibly empty) */ }
    }
  }

  return result;
}

// ── Coin search (CoinGecko proxy) ─────────────────────────────────────────────
export async function searchCoins(query) {
  if (!query) return [];
  const url = `${BASE_URL}/search?query=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.coins || []).slice(0, 10).map((c) => ({
      symbol: c.symbol?.toUpperCase(),
      name: c.name,
      coingeckoId: c.id,
      thumb: c.thumb,
    }));
  } catch { return []; }
}

// ── Coin details: Binance-first, CoinGecko fallback ───────────────────────────
async function fetchCoinDetailsFromBinance(symbol) {
  const [tickerRes, klinesRes] = await Promise.all([
    fetch(`${BINANCE_BASE}/ticker/24hr?symbol=${symbol}USDT`),
    fetch(`${BINANCE_BASE}/klines?symbol=${symbol}USDT&interval=1d&limit=31`),
  ]);
  if (!tickerRes.ok) throw new Error(`Binance ticker: ${tickerRes.status}`);

  const ticker = await tickerRes.json();
  const klines = klinesRes.ok ? await klinesRes.json() : [];
  const closes = klines.map(k => parseFloat(k[4]));
  const current = parseFloat(ticker.lastPrice);
  const p7 = closes.length >= 8 ? closes[closes.length - 8] : null;
  const p30 = closes.length >= 31 ? closes[0] : null;

  return {
    symbol: symbol.toLowerCase(),
    name: symbol,
    image: { small: null, large: null, thumb: null },
    description: { en: '' },
    _fromBinance: true,
    market_data: {
      current_price: { usd: current },
      price_change_percentage_24h: parseFloat(ticker.priceChangePercent),
      price_change_percentage_7d: p7 ? ((current - p7) / p7) * 100 : null,
      price_change_percentage_30d: p30 ? ((current - p30) / p30) * 100 : null,
      market_cap: { usd: null },
      total_volume: { usd: parseFloat(ticker.quoteVolume) },
      ath: { usd: parseFloat(ticker.highPrice) }, // 24h high as proxy
      ath_change_percentage: { usd: null },
      circulating_supply: null,
      max_supply: null,
    },
  };
}

export async function fetchCoinDetails(coinId, symbol = null) {
  const key = `details:${coinId}`;
  const cached = getCached(key);
  if (cached) return cached;

  // Try CoinGecko proxy first (has market cap, ATH, description)
  try {
    const url = `${BASE_URL}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      setCache(key, data);
      return data;
    }
  } catch { /* fall through */ }

  // Fallback: build data from Binance (always available)
  if (symbol && symbol !== 'XAU') {
    const data = await fetchCoinDetailsFromBinance(symbol);
    // Cache for shorter time (missing market cap etc.)
    cache.set(key, { data, ts: Date.now() - (CACHE_TTL - 60_000) });
    return data;
  }
  throw new Error('שגיאה בטעינת נתוני המטבע');
}

// ── Coin chart: Binance klines first, CoinGecko fallback ─────────────────────
async function fetchBinanceKlines(symbol, days) {
  const limit = Math.min(days + 2, 1000);
  const res = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}USDT&interval=1d&limit=${limit}`);
  if (!res.ok) throw new Error(`Binance klines: ${res.status}`);
  const klines = await res.json();
  return {
    prices: klines.map(k => [k[0], parseFloat(k[4])]),
    total_volumes: klines.map(k => [k[0], parseFloat(k[5])]),
    market_caps: [],
  };
}

// Raw klines through the worker /bnb proxy (which falls back to Bybit when
// Binance blocks its egress) — Binance 12-column array shape.
export async function fetchKlines(pair, interval = '1h', limit = 720) {
  const url = `${BINANCE_BASE}/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`klines error: ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('klines: unexpected response');
  return data;
}

// Klines for an explicit time window [startMs, endMs]. Binance natively
// supports startTime/endTime; the worker forwards them, and the Bybit
// fallback maps them to start/end. Returns Binance 12-col arrays (oldest-first).
export async function fetchKlinesRange(pair, interval, startMs, endMs, limit = 500) {
  const s = Math.floor(startMs);
  const e = Math.floor(endMs);
  const qs = `symbol=${encodeURIComponent(pair)}&interval=${interval}&startTime=${s}&endTime=${e}&limit=${limit}`;
  // The data actually overlaps the requested window (detects a proxy that
  // ignored the time window and returned only the most-recent candles).
  const covers = (rows) =>
    Array.isArray(rows) && rows.length >= 3 &&
    Number(rows[0][0]) <= e && Number(rows[rows.length - 1][0]) >= s;

  // 1) Worker proxy (preferred — avoids CORS / geo issues).
  try {
    const r = await fetch(`${BINANCE_BASE}/klines?${qs}`);
    if (r.ok) {
      const d = await r.json();
      if (covers(d)) return d;
    }
  } catch { /* fall through */ }

  // 2) Binance public data mirror (CORS-enabled, honours startTime/endTime).
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?${qs}`);
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d) && d.length) return d;
    }
  } catch { /* fall through */ }

  throw new Error('klines range unavailable');
}

export async function fetchCoinChart(coinId, days = 30, symbol = null) {
  const key = `chart:${coinId}:${days}`;
  const cached = getCached(key);
  if (cached) return cached;

  // Try Binance klines first (no rate limits)
  if (symbol && symbol !== 'XAU') {
    try {
      const data = await fetchBinanceKlines(symbol, days);
      setCache(key, data);
      return data;
    } catch { /* fall through */ }
  }

  // Fallback: CoinGecko proxy
  const url = `${BASE_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CoinGecko error: ${response.status}`);
  const data = await response.json();
  setCache(key, data);
  return data;
}

// ── Transform price data ──────────────────────────────────────────────────────
export function transformPriceData(data, coins) {
  const result = {};
  for (const coin of coins) {
    const geckoData = data[coin.coingeckoId];
    if (geckoData) {
      result[coin.symbol] = {
        price: geckoData.usd,
        change24h: geckoData.usd_24h_change ?? 0,
      };
    }
  }
  return result;
}
