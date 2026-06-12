import { useState, useEffect, useRef } from 'react';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.aviniazov7.workers.dev';

/**
 * Poll a worker quotes endpoint that returns { SYM: { price, change24h }, … }.
 * Used for both the Yahoo-backed futures feed (/fut/quotes) and the Bybit-backed
 * crypto feed (/cx/quotes) — both reachable from the worker where Binance /
 * CoinGecko are geo-blocked (403).
 *
 * @param {string} path        worker path, e.g. '/cx/quotes'
 * @param {string[]} symbols   symbols to request
 * @param {object} opts        { enabled, intervalMs }
 */
export function useWorkerQuotes(path, symbols = [], { enabled = true, intervalMs = 60_000 } = {}) {
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
        const res = await fetch(`${WORKER_BASE}${path}?symbols=${encodeURIComponent(symbolsKey)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data && typeof data === 'object' && !data.error) setPrices(data);
      } catch {
        // network/abort — keep last good prices
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [path, symbolsKey, enabled, intervalMs]);

  return { prices, loading };
}
