import { useState, useEffect } from 'react';
import { fetchActivity } from '../services/polymarketService';

// A wallet's trade history, fetched on demand. Falsy wallet resets to idle.
// `enabled=false` skips fetching (so the history tab only loads when opened).
export function useWalletActivity(wallet, { limit = 100, enabled = true } = {}) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!wallet || !enabled) { setActivity([]); setError(''); setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchActivity(wallet, { limit, signal: controller.signal })
      .then((rows) => { setActivity(rows); setLoading(false); })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError('טעינת ההיסטוריה נכשלה.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [wallet, limit, enabled]);

  return { activity, loading, error };
}
