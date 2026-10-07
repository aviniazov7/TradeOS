import { POPULAR_STOCKS } from '../utils/stocks';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

// Ticker search: popular names locally first (instant), then Yahoo through the
// worker for everything else (any US / TASE / European listing).
export async function searchStocks(query, { signal } = {}) {
  const q = String(query || '').trim();
  const local = POPULAR_STOCKS.filter((s) => !q
    || s.symbol.startsWith(q.toUpperCase())
    || s.name.toLowerCase().includes(q.toLowerCase()));
  if (!q) return local.map((s) => ({ ...s, exchange: '', type: 'EQUITY' }));
  try {
    const res = await fetch(`${WORKER_URL}/stk/search?q=${encodeURIComponent(q)}`, { signal });
    const remote = res.ok ? await res.json() : [];
    const seen = new Set(local.map((s) => s.symbol));
    return [
      ...local.map((s) => ({ ...s, exchange: '', type: 'EQUITY' })),
      ...(Array.isArray(remote) ? remote.filter((r) => !seen.has(r.symbol)) : []),
    ];
  } catch {
    return local.map((s) => ({ ...s, exchange: '', type: 'EQUITY' }));
  }
}

// One-shot quotes for the given tickers → { AAPL: { price, change24h, ... } }.
export async function fetchStockQuotes(symbols, { signal } = {}) {
  const list = [...new Set((symbols || []).filter(Boolean))];
  if (!list.length) return {};
  try {
    const res = await fetch(`${WORKER_URL}/stk/quotes?symbols=${encodeURIComponent(list.join(','))}`, { signal });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === 'object' && !data.error ? data : {};
  } catch {
    return {};
  }
}
