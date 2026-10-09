import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchSpotQuotes } from '../services/bybitDirect';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

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
export function useWorkerQuotes(path, symbols = [], { enabled = true, intervalMs = 60_000, timeoutMs = 8_000 } = {}) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  // True when the latest attempt (worker + direct fallback) returned nothing.
  // Earlier prices stay on screen; callers decide whether to show an error.
  const [failed, setFailed] = useState(false);
  // Bumped by retry() to re-run the effect (fetch now + restart the interval).
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef(null);

  const symbolsKey = symbols.join(',');

  useEffect(() => {
    if (!enabled || !symbolsKey) return;

    let cancelled = false;
    const fetchQuotes = async () => {
      let gotData = false;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      // A hung request must not leave the caller on "loading" forever.
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
      try {
        const res = await fetch(`${WORKER_BASE}${path}?symbols=${encodeURIComponent(symbolsKey)}`, { signal: ctrl.signal });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data && typeof data === 'object' && !data.error && Object.keys(data).length) {
            setPrices(data);
            gotData = true;
          }
        }
      } catch {
        // network/abort/timeout — fall through to the direct fallback
      } finally {
        clearTimeout(timer);
      }
      // Superseded by a newer request (not our own timeout) → let that one report.
      if (cancelled || (ctrl.signal.aborted && !timedOut)) return;
      // Worker route down → crypto quotes can come straight from Bybit (CORS-enabled)
      if (!gotData && path === '/cx/quotes') {
        const direct = await fetchSpotQuotes(symbolsKey.split(',')).catch(() => null);
        if (cancelled) return;
        if (direct) { setPrices(direct); gotData = true; }
      }
      setFailed(!gotData);
      setLoading(false);
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [path, symbolsKey, enabled, intervalMs, timeoutMs, attempt]);

  // Manual "try again": show loading and fetch immediately.
  const retry = useCallback(() => {
    setLoading(true);
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  // When the hook is idle (disabled / no symbols) there's nothing to load.
  const active = Boolean(enabled && symbolsKey);
  return { prices, loading: active ? loading : false, failed: active ? failed : false, retry };
}
