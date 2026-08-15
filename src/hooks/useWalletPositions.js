import { useState, useEffect } from 'react';
import { fetchPositions } from '../services/polymarketService';
import { withConviction } from '../utils/polymarketScore';

// Fetch a single wallet's positions on demand. Sorted by size with a conviction
// share attached. Passing a falsy wallet resets to idle.
export function useWalletPositions(wallet, limit = 100) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!wallet) { setPositions([]); setError(''); setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchPositions(wallet, { limit, signal: controller.signal })
      .then((rows) => { setPositions(withConviction(rows)); setLoading(false); })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError('טעינת הפוזיציות נכשלה.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [wallet, limit]);

  return { positions, loading, error };
}
