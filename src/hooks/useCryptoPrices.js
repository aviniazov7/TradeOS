import { useState, useEffect, useCallback, useRef } from 'react';
import { COINS } from '../utils/constants';
import { fetchPrices, transformPriceData } from '../services/coingeckoApi';

const POLL_INTERVAL = 10_000;

export function useCryptoPrices({ symbols, extraCoins = [], enabled = true } = {}) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const baseCoins = symbols
    ? COINS.filter((c) => symbols.includes(c.symbol))
    : COINS;

  // Merge extra coins (custom coins with coingeckoId) that aren't already in COINS
  const targetCoins = [
    ...baseCoins,
    ...extraCoins.filter((ec) => ec.coingeckoId && !COINS.find((c) => c.symbol === ec.symbol)),
  ];

  const idsKey = targetCoins.map((c) => c.coingeckoId).filter(Boolean).join(',');

  const abortRef = useRef(null);

  const fetchData = useCallback(async (signal) => {
    if (!idsKey) return;
    try {
      const coingeckoIds = idsKey.split(',');
      const data = await fetchPrices(coingeckoIds, signal);
      if (signal?.aborted) return;
      const transformed = transformPriceData(data, targetCoins);
      setPrices(transformed);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to fetch crypto prices:', err);
      setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [idsKey]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    fetchData(signal);

    intervalRef.current = setInterval(() => fetchData(signal), POLL_INTERVAL);

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, enabled]);

  return { prices, loading, error, lastUpdated };
}
