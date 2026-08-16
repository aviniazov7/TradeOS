import { useState, useEffect } from 'react';
import { fetchMarkets, fetchHolders } from '../services/polymarketService';
import { POLYMARKET as C } from '../config/polymarket';

// Module-level cache — the markets tab shouldn't refetch on every mount.
let cache = { at: 0, data: null };

// Top open markets (by 24h volume) for the explorer tab.
export function usePolymarkets() {
  const [markets, setMarkets] = useState(() => cache.data);
  const [loading, setLoading] = useState(() => !cache.data);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const fresh = nonce === 0 && cache.data && Date.now() - cache.at < C.CACHE_TTL_MS;
    if (fresh) { setMarkets(cache.data); setLoading(false); return () => controller.abort(); }
    setLoading(true);
    setError('');
    fetchMarkets({ limit: 60, signal: controller.signal })
      .then((rows) => { cache = { at: Date.now(), data: rows }; setMarkets(rows); setLoading(false); })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError('טעינת השווקים נכשלה. נסה שוב בעוד רגע.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [nonce]);

  return { markets: markets || [], loading, error, refetch: () => setNonce((n) => n + 1) };
}

// Holders of a single market, fetched on demand (market detail page).
export function useMarketHolders(conditionId) {
  const [holders, setHolders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conditionId) { setHolders([]); setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    fetchHolders(conditionId, { signal: controller.signal })
      .then((rows) => { setHolders(rows); setLoading(false); })
      .catch((e) => { if (e.name !== 'AbortError') setLoading(false); });
    return () => controller.abort();
  }, [conditionId]);

  return { holders, loading };
}
