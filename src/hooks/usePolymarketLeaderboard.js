import { useState, useEffect } from 'react';
import { fetchLeaderboard } from '../services/polymarketService';
import { scoreLeaderboard } from '../utils/polymarketScore';
import { POLYMARKET as C } from '../config/polymarket';

// Module-level cache so switching tabs / remounting doesn't refetch. Keyed by
// category. Loading all 200 wallets up front meant four SEQUENTIAL calls before
// anything painted — the first page lands on its own now, the rest on demand.
let cache = { at: 0, category: null, data: null, loaded: 0 };

export function usePolymarketLeaderboard(category = 'overall') {
  const hit = () => (cache.category === category && cache.data ? cache.data : null);
  const [rows, setRows] = useState(hit);
  const [loading, setLoading] = useState(() => !hit());
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0); // bump to force a refetch (bypasses cache)
  const [loaded, setLoaded] = useState(() => (hit() ? cache.loaded : 0));
  const [loadingMore, setLoadingMore] = useState(false);

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
    fetchLeaderboard({ category, top: C.LEADERBOARD_PAGE, signal: controller.signal })
      .then((raw) => {
        const scored = scoreLeaderboard(raw);
        cache = { at: Date.now(), category, data: scored, loaded: raw.length };
        setRows(scored);
        setLoaded(raw.length);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError('טעינת הנתונים מ-Polymarket נכשלה. נסה שוב בעוד רגע.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [category, nonce]);

  // Pull the next page and re-score across the whole cohort (the score is
  // normalised within the set, so it must be recomputed, not appended).
  const loadMore = async () => {
    if (loadingMore || loaded >= C.LEADERBOARD_TOP) return;
    setLoadingMore(true);
    try {
      const more = await fetchLeaderboard({ category, from: loaded, top: loaded + C.LEADERBOARD_PAGE });
      const merged = [...(cache.data || []), ...more];
      const seen = new Set();
      const unique = merged.filter((r) => (seen.has(r.wallet) ? false : seen.add(r.wallet)));
      const scored = scoreLeaderboard(unique);
      cache = { at: cache.at, category, data: scored, loaded: loaded + more.length };
      setRows(scored);
      setLoaded(cache.loaded);
    } catch {
      setError('טעינת ארנקים נוספים נכשלה.');
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    rows: rows || [],
    loading,
    loadingMore,
    error,
    hasMore: loaded > 0 && loaded < C.LEADERBOARD_TOP,
    loadMore,
    refetch: () => setNonce((n) => n + 1),
  };
}
