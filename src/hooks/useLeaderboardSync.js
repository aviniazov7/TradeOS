import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserProfile,
  getUserCollectionDocs,
  setLeaderboardEntry,
  deleteLeaderboardEntry,
  timestamp,
} from '../services/firestoreService';
import { calculateProfitFactor, calculateMaxDrawdown, isClosedTrade } from '../utils/calculations';

/**
 * Computes a 0-100 score based on live trading + backtest performance.
 */
function computeScore(live, backtest) {
  // Live score (0-100) — weight 70%
  let liveScore = 0;
  if (live.totalTrades >= 10) {
    liveScore =
      live.winRate * 0.3 +
      (Math.min(live.profitFactor === Infinity ? 3 : live.profitFactor, 3) / 3) * 100 * 0.3 +
      (1 - Math.min(live.maxDrawdown, 100) / 100) * 100 * 0.2 +
      (Math.min(live.avgRR, 3) / 3) * 100 * 0.2;
  }

  // Backtest score (0-100) — weight 30%
  let backtestScore = 0;
  if (backtest.totalTests >= 5) {
    backtestScore =
      backtest.winRate * 0.5 +
      (Math.min(backtest.avgR, 3) / 3) * 100 * 0.5;
  }

  return Math.round(liveScore * 0.7 + backtestScore * 0.3);
}

/**
 * Runs once on app load. If user opted-in to leaderboard,
 * computes stats from their data and writes to leaderboard/{uid}.
 */
export function useLeaderboardSync() {
  const { user } = useAuth();
  const synced = useRef(false);
  const lastUid = useRef(null);

  useEffect(() => {
    // Reset sync flag when user changes (logout/login or account switch)
    if (user?.uid !== lastUid.current) {
      synced.current = false;
      lastUid.current = user?.uid || null;
    }
    if (!user || synced.current) return;
    synced.current = true;

    (async () => {
      try {
        const { data: profile } = await getUserProfile(user.uid);
        if (!profile?.isPublicProfile) return;

        // Fetch all user data in parallel
        const [trades, backtests, journals] = await Promise.all([
          getUserCollectionDocs(user.uid, 'trades'),
          getUserCollectionDocs(user.uid, 'backtests'),
          getUserCollectionDocs(user.uid, 'journals'),
        ]);

        // ── Live Trading Stats ──
        const closed = trades.filter(isClosedTrade);
        if (closed.length < 10) return; // minimum threshold

        const wins = closed.filter((t) => t.result === 'win');
        const winRate = (wins.length / closed.length) * 100;
        const totalPnL = closed.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
        const totalInitial = journals.reduce((s, j) => s + (j.initialBalance || 0), 0);
        const pnlPercent = totalInitial > 0 ? (totalPnL / totalInitial) * 100 : 0;
        const profitFactor = calculateProfitFactor(closed);
        const avgRR =
          closed.length > 0
            ? closed.reduce((s, t) => s + (t.rrRatio || 0), 0) / closed.length
            : 0;

        // Max drawdown
        const sorted = [...closed].sort((a, b) => {
          const da = a.exitDate?.toDate?.() || new Date(a.exitDate);
          const db = b.exitDate?.toDate?.() || new Date(b.exitDate);
          return da - db;
        });
        let equity = totalInitial || 1000;
        const equityCurve = sorted.map((t) => {
          equity += t.netPnl ?? t.pnl ?? 0;
          return equity;
        });
        const maxDrawdown = calculateMaxDrawdown(equityCurve);

        const live = {
          totalTrades: closed.length,
          winRate: Math.round(winRate * 10) / 10,
          pnlPercent: Math.round(pnlPercent * 10) / 10,
          profitFactor: profitFactor === Infinity ? 999 : Math.round(profitFactor * 100) / 100,
          avgRR: Math.round(avgRR * 100) / 100,
          maxDrawdown: Math.round(maxDrawdown * 10) / 10,
        };

        // ── Backtest Stats ──
        const backtestWins = backtests.filter((b) => b.result === 'win');
        const backtestWinRate = backtests.length > 0 ? (backtestWins.length / backtests.length) * 100 : 0;
        const avgR =
          backtests.length > 0
            ? backtests.reduce((s, b) => s + (b.rResult || 0), 0) / backtests.length
            : 0;

        const backtest = {
          totalTests: backtests.length,
          winRate: Math.round(backtestWinRate * 10) / 10,
          avgR: Math.round(avgR * 100) / 100,
        };

        // ── Score ──
        const score = computeScore(live, backtest);

        await setLeaderboardEntry(user.uid, {
          displayName: profile.leaderboardName || user.displayName || 'Anonymous',
          photoURL: user.photoURL || null,
          joinedAt: profile.createdAt || timestamp(),
          updatedAt: timestamp(),
          live,
          backtest,
          score,
        });
      } catch (err) {
        console.error('Leaderboard sync failed:', err);
        // Reset flag so a retry is possible on next render (e.g. after reconnect)
        synced.current = false;
      }
    })();
  }, [user]);
}
