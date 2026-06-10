import { useState, useEffect, useRef } from 'react';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.aviniazov7.workers.dev';
// Yahoo data behind the worker is delayed ~10-15 min and KV-cached for 2 min,
// so polling faster than this buys nothing.
const POLL_INTERVAL = 120_000;

/**
 * Delayed CME futures quotes via the worker's /fut/quotes proxy.
 * Returns { prices: { ES: { price, change24h }, ... }, loading }.
 */
export function useFuturesPrices({ symbols = [], enabled = true } = {}) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const abortRef = useRef(null);

  const symbolsKey = symbols.join(',');

  useEffect(() => {
    if (!enabled || !symbolsKey) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchQuotes = async () => {
      try {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const res = await fetch(`${WORKER_BASE}/fut/quotes?symbols=${encodeURIComponent(symbolsKey)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data && typeof data === 'object') setPrices(data);
      } catch {
        // network/abort — keep last good prices
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [symbolsKey, enabled]);

  return { prices, loading };
}
