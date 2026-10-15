// Which crypto symbols the header ticker asks for. The live list is the top
// coins by market cap (same CoinGecko markets feed the icon cache already
// uses). A fixed list is the fallback when that feed is down, so the strip
// never fills with small names just because they used to be hardcoded.

export const TICKER_CRYPTO_LIMIT = 15;

// Majors that stay on the strip when the ranking feed fails. Not a dump of
// every pair the app can trade.
export const TICKER_CRYPTO_FALLBACK = [
  'BTC', 'ETH', 'XRP', 'BNB', 'SOL', 'DOGE', 'ADA', 'TRX',
  'LINK', 'AVAX', 'LTC', 'BCH', 'TON', 'SUI', 'XLM',
];

// Stables and wrapped receipts are large by cap and useless as a USDT quote.
const SKIP = new Set([
  'USDT', 'USDC', 'USDE', 'DAI', 'FDUSD', 'TUSD', 'USDD', 'PYUSD', 'USD1', 'USDS', 'BUSD', 'USDG', 'RLUSD',
  'WBTC', 'WETH', 'STETH', 'WSTETH', 'WEETH', 'CBBTC', 'WBETH', 'RETH', 'CBETH',
]);

/**
 * @param {Array<{ symbol?: string, market_cap?: number }>|null|undefined} rows
 * @param {number} [limit]
 * @returns {string[]} symbols, largest cap first
 */
export function pickTopCrypto(rows, limit = TICKER_CRYPTO_LIMIT) {
  const ranked = [];
  const seen = new Set();
  for (const row of rows || []) {
    const symbol = String(row?.symbol || '').toUpperCase();
    const cap = Number(row?.market_cap);
    if (!/^[A-Z0-9]{2,10}$/.test(symbol) || SKIP.has(symbol) || seen.has(symbol)) continue;
    if (!(cap > 0)) continue;
    seen.add(symbol);
    ranked.push({ symbol, cap });
  }
  ranked.sort((a, b) => b.cap - a.cap);
  return ranked.slice(0, limit).map((r) => r.symbol);
}

const WORKER = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

/** Top symbols, or the static fallback when the markets feed is empty. */
export async function loadTopCryptoSymbols(fetchImpl = fetch) {
  try {
    const url = `${WORKER}/cg/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=40&page=1&sparkline=false`;
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (res?.ok) {
      const picked = pickTopCrypto(await res.json());
      if (picked.length >= 8) return picked;
    }
  } catch { /* the fallback list is the product */ }
  return TICKER_CRYPTO_FALLBACK.slice(0, TICKER_CRYPTO_LIMIT);
}
