import { useMemo } from 'react';
import { getPeriodStart, toDate } from '../utils/period';

export function useBacktestStats(backtests, period = 'all') {
  return useMemo(() => {
    // Filter by period
    const periodStart = getPeriodStart(period);
    const filtered = periodStart
      ? backtests.filter((b) => toDate(b.date || b.createdAt) >= periodStart)
      : backtests;

    if (!filtered.length) {
      return {
        total: 0, wins: 0, losses: 0, winRate: 0,
        totalR: 0, avgR: 0, bestR: 0, worstR: 0,
        profitFactorR: 0, maxWinStreak: 0, maxLossStreak: 0,
        byStrategy: [], byPair: [], bySession: [], byTimeframe: [],
        monthlyPerformance: [], dailyR: [], pieData: [],
      };
    }

    const wins = filtered.filter((b) => b.result === 'win').length;
    const losses = filtered.filter((b) => b.result === 'loss').length;
    const breakevens = filtered.filter((b) => b.result === 'breakeven').length;
    const total = filtered.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    const rValues = filtered.map((b) => b.rResult || 0);
    const totalR = rValues.reduce((s, r) => s + r, 0);
    const avgR = total > 0 ? totalR / total : 0;
    const bestR = Math.max(...rValues);
    const worstR = Math.min(...rValues);

    // Profit Factor (R-based)
    const positiveR = rValues.filter((r) => r > 0).reduce((s, r) => s + r, 0);
    const negativeR = Math.abs(rValues.filter((r) => r < 0).reduce((s, r) => s + r, 0));
    const profitFactorR = negativeR > 0 ? positiveR / negativeR : positiveR > 0 ? Infinity : 0;

    // Win/Loss streaks
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
    // Sort by date for streaks
    const sorted = [...filtered].sort((a, b) => toDate(a.date || a.createdAt) - toDate(b.date || b.createdAt));
    sorted.forEach((b) => {
      if (b.result === 'win') {
        curWin++;
        curLoss = 0;
        maxWinStreak = Math.max(maxWinStreak, curWin);
      } else if (b.result === 'loss') {
        curLoss++;
        curWin = 0;
        maxLossStreak = Math.max(maxLossStreak, curLoss);
      } else {
        curWin = 0;
        curLoss = 0;
      }
    });

    // By Strategy
    const stratMap = {};
    filtered.forEach((b) => {
      const key = b.strategy || 'ללא אסטרטגיה';
      if (!stratMap[key]) stratMap[key] = { strategy: key, count: 0, wins: 0, totalR: 0 };
      stratMap[key].count++;
      if (b.result === 'win') stratMap[key].wins++;
      stratMap[key].totalR += b.rResult || 0;
    });
    const byStrategy = Object.values(stratMap)
      .map((s) => ({ ...s, winRate: s.count > 0 ? (s.wins / s.count) * 100 : 0, avgR: s.count > 0 ? s.totalR / s.count : 0 }))
      .sort((a, b) => b.totalR - a.totalR);

    // By Pair
    const pairMap = {};
    filtered.forEach((b) => {
      const key = b.pair || '–';
      if (!pairMap[key]) pairMap[key] = { pair: key, count: 0, wins: 0, totalR: 0 };
      pairMap[key].count++;
      if (b.result === 'win') pairMap[key].wins++;
      pairMap[key].totalR += b.rResult || 0;
    });
    const byPair = Object.values(pairMap)
      .map((p) => ({ ...p, winRate: p.count > 0 ? (p.wins / p.count) * 100 : 0, avgR: p.count > 0 ? p.totalR / p.count : 0 }))
      .sort((a, b) => b.totalR - a.totalR);

    // By Session
    const sessionMap = {};
    filtered.forEach((b) => {
      const key = b.session || 'לא ידוע';
      if (!sessionMap[key]) sessionMap[key] = { session: key, count: 0, wins: 0, totalR: 0 };
      sessionMap[key].count++;
      if (b.result === 'win') sessionMap[key].wins++;
      sessionMap[key].totalR += b.rResult || 0;
    });
    const bySession = Object.values(sessionMap)
      .map((s) => ({ ...s, winRate: s.count > 0 ? (s.wins / s.count) * 100 : 0, avgR: s.count > 0 ? s.totalR / s.count : 0 }))
      .sort((a, b) => b.totalR - a.totalR);

    // By Timeframe
    const tfMap = {};
    filtered.forEach((b) => {
      const key = b.timeframe || '–';
      if (!tfMap[key]) tfMap[key] = { timeframe: key, count: 0, wins: 0, totalR: 0 };
      tfMap[key].count++;
      if (b.result === 'win') tfMap[key].wins++;
      tfMap[key].totalR += b.rResult || 0;
    });
    const byTimeframe = Object.values(tfMap)
      .map((t) => ({ ...t, winRate: t.count > 0 ? (t.wins / t.count) * 100 : 0 }))
      .sort((a, b) => b.totalR - a.totalR);

    // Monthly Performance
    const monthMap = {};
    sorted.forEach((b) => {
      const d = toDate(b.date || b.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { month: key, count: 0, wins: 0, totalR: 0 };
      monthMap[key].count++;
      if (b.result === 'win') monthMap[key].wins++;
      monthMap[key].totalR += b.rResult || 0;
    });
    let cumulativeR = 0;
    const monthlyPerformance = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => {
        cumulativeR += d.totalR;
        return { ...d, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0, cumulativeR };
      });

    // Daily R (for bar chart)
    const dayMap = {};
    sorted.forEach((b) => {
      const d = toDate(b.date || b.createdAt);
      const key = d.toISOString().slice(0, 10);
      if (!dayMap[key]) dayMap[key] = { date: key, r: 0, count: 0 };
      dayMap[key].r += b.rResult || 0;
      dayMap[key].count++;
    });
    const dailyR = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

    // Pie data
    const pieData = [
      { name: 'Win', value: wins },
      { name: 'Loss', value: losses },
      ...(breakevens > 0 ? [{ name: 'BE', value: breakevens }] : []),
    ];

    return {
      total, wins, losses, winRate,
      totalR, avgR, bestR, worstR,
      profitFactorR, maxWinStreak, maxLossStreak,
      byStrategy, byPair, bySession, byTimeframe,
      monthlyPerformance, dailyR, pieData,
    };
  }, [backtests, period]);
}

