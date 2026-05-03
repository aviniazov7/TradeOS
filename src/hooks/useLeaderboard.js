import { useState, useEffect, useMemo } from 'react';
import { subscribeToLeaderboard } from '../services/firestoreService';

export function useLeaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('score'); // 'score' | 'winRate' | 'pnlPercent' | 'trades'

  useEffect(() => {
    const unsub = subscribeToLeaderboard(
      (data) => {
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        console.error('Leaderboard subscription error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const sorted = useMemo(() => {
    const list = [...entries];
    switch (sortBy) {
      case 'winRate':
        return list.sort((a, b) => (b.live?.winRate || 0) - (a.live?.winRate || 0));
      case 'pnlPercent':
        return list.sort((a, b) => (b.live?.pnlPercent || 0) - (a.live?.pnlPercent || 0));
      case 'trades':
        return list.sort((a, b) => (b.live?.totalTrades || 0) - (a.live?.totalTrades || 0));
      default:
        return list.sort((a, b) => (b.score || 0) - (a.score || 0));
    }
  }, [entries, sortBy]);

  return { entries: sorted, loading, sortBy, setSortBy };
}
