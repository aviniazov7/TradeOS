import { useState, useEffect } from 'react';
import { fetchLeaderboard } from '../services/polymarketService';
import { scoreLeaderboard } from '../utils/polymarketScore';
import { POLYMARKET as C } from '../config/polymarket';

// Module-level cache so switching tabs / remounting doesn't re-paginate the
// leaderboard (4 sequential calls) every time. Keyed by category.
let cache = { at: 0, category: null, data: null };

export function usePolymarketLeaderboard(category = 'overall') {
  const [rows, setRows] = useState(() => (cache.category === category ? cache.data : null));
  const [loading, setLoading] = useState(() => !(cache.category === category && cache.data));
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const fresh = cache.data && cache.category === category && Date.now() - cache.at < C.CACHE_TTL_MS;
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
  }, [category]);

  return { rows: rows || [], loading, error };
}
