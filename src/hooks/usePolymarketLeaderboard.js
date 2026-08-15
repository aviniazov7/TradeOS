import { useState, useEffect } from 'react';
import { fetchLeaderboard } from '../services/polymarketService';
import { scoreLeaderboard } from '../utils/polymarketScore';
import { POLYMARKET as C } from '../config/polymarket';

// Module-level cache so switching tabs / remounting doesn't re-paginate the
// leaderboard (4 sequential calls) every time. Keyed by category.
let cache = { at: 0, category: null, data: null };

export function usePolymarketLeaderboard(category = 'overall') {
  const hit = () => (cache.category === category && cache.data ? cache.data : null);
  const [rows, setRows] = useState(hit);
  const [loading, setLoading] = useState(() => !hit());
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0); // bump to force a refetch (bypasses cache)

  useEffect(() => {
    const controller = new AbortController();
    const fresh = nonce === 0 && cache.data && cache.category === category && Date.now() - cache.at < C.CACHE_TTL_MS;
    if (fresh) {
      setRows(cache.data);
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    setError('');
    fetchLeaderboard({ category, signal: controller.signal })
      .then((raw) => {
        const scored = scoreLeaderboard(raw);
        cache = { at: Date.now(), category, data: scored };
        setRows(scored);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError('טעינת הנתונים מ-Polymarket נכשלה. נסה שוב בעוד רגע.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [category, nonce]);

  return { rows: rows || [], loading, error, refetch: () => setNonce((n) => n + 1) };
}
