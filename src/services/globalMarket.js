// Global crypto market stats for the home page's "השוק עכשיו" card, in the
// CoinGecko /global `data` shape the card reads. CoinPaprika is tried first
// (free, CORS-open, and what the market page already uses); the worker's
// CoinGecko proxy is the fallback. The proxy alone left the card on "טוען…"
// for minutes whenever CoinGecko rate-limited it (HTTP 429).

const PAPRIKA_GLOBAL = 'https://api.coinpaprika.com/v1/global';
const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

/** CoinPaprika /v1/global → the shape MarketCard reads, or null if unusable. */
export function fromPaprika(d) {
  if (!d || !(d.market_cap_usd > 0)) return null;
  return {
    total_market_cap: { usd: d.market_cap_usd },
    total_volume: { usd: d.volume_24h_usd },
    market_cap_change_percentage_24h_usd: d.market_cap_change_24h,
    market_cap_percentage: { btc: d.bitcoin_dominance_percentage },
  };
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<object>} market stats; rejects when every source failed
 */
export async function fetchGlobalMarket({ signal } = {}) {
  const errors = [];
  try {
    const m = fromPaprika(await getJson(PAPRIKA_GLOBAL, signal));
    if (m) return m;
    errors.push(new Error('paprika: empty'));
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    errors.push(e);
  }
  try {
    const json = await getJson(`${WORKER_URL}/cg/global`, signal);
    if (json?.data?.total_market_cap?.usd > 0) return json.data;
    errors.push(new Error('coingecko: empty'));
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    errors.push(e);
  }
  throw new Error(`market data unavailable (${errors.map((e) => e.message).join('; ')})`);
}
