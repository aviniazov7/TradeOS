const CG_BASE = 'https://api.coingecko.com/api/v3';
const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
// Use worker proxy to avoid browser rate-limits; fall back to direct API
const BASE_URL = WORKER_URL ? `${WORKER_URL}/cg` : CG_BASE;

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

export async function fetchPrices(coingeckoIds, signal) {
  if (!coingeckoIds.length) return {};

  const ids = coingeckoIds.join(',');
  const url = `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  return response.json();
}

export async function searchCoins(query) {
  if (!query) return [];
  const url = `${BASE_URL}/search?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.coins || []).slice(0, 10).map((c) => ({
    symbol: c.symbol?.toUpperCase(),
    name: c.name,
    coingeckoId: c.id,
    thumb: c.thumb,
  }));
}

export async function fetchCoinDetails(coinId) {
  const key = `details:${coinId}`;
  const cached = getCached(key);
  if (cached) return cached;
  const url = `${BASE_URL}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CoinGecko error: ${response.status}`);
  const data = await response.json();
  setCache(key, data);
  return data;
}

export async function fetchCoinChart(coinId, days = 30) {
  const key = `chart:${coinId}:${days}`;
  const cached = getCached(key);
  if (cached) return cached;
  const url = `${BASE_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CoinGecko error: ${response.status}`);
  const data = await response.json();
  setCache(key, data);
  return data;
}

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
