import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getTodayClosedTrades, getUserSetting } from '../services/firestoreService';
import { auth } from '../services/firebase';
import { isClosedTrade } from '../utils/calculations';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';

export function useDailySummarySync() {
  const { user } = useAuth();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!user || !WORKER_URL || hasSynced.current) return;
    hasSynced.current = true;

    (async () => {
      try {
        // Only sync when the user scheduled a daily summary push — the
        // schedule mirror lives in the notifications setting (#219).
        const notif = await getUserSetting(user.uid, 'notifications');
        if (!notif?.schedule?.summary?.enabled) return;

        const trades = await getTodayClosedTrades(user.uid);
        const closed = trades.filter(isClosedTrade);

        const wins = closed.filter((t) => t.result === 'win').length;
        const losses = closed.filter((t) => t.result === 'loss').length;
        const pnl = closed.reduce((sum, t) => sum + (t.netPnl ?? t.pnl ?? 0), 0);

        let bestTrade = null;
        let worstTrade = null;
        for (const t of closed) {
          const p = t.netPnl ?? t.pnl ?? 0;
          if (!bestTrade || p > bestTrade.pnl) bestTrade = { pair: t.pair, pnl: p };
          if (!worstTrade || p < worstTrade.pnl) worstTrade = { pair: t.pair, pnl: p };
        }

        const stats = {
          tradeCount: closed.length,
          pnl,
          wins,
          losses,
          bestTrade,
          worstTrade,
        };

        // Fire-and-forget push to worker
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        fetch(`${WORKER_URL}/daily-stats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ uid: user.uid, stats }),
        }).catch(() => {});
      } catch {
        // Silent fail — don't affect app
      }
    })();
  }, [user]);
}
