import { useMemo } from 'react';
import {
  calculateWinRate,
  calculateProfitFactor,
  calculateExpectancy,
  calculateAvgRR,
  calculateMaxDrawdown,
  calculateSharpeRatio,
  calculateCalmarRatio,
  calculateCurrentStreak,
  calculateAvgDuration,
  calculateSortinoRatio,
  calculateRecoveryFactor,
  pearsonCorrelation,
  clampRatio,
} from '../utils/calculations';
import { getSessionFromDate, SESSION_UNKNOWN } from '../utils/sessions';

function getPeriodStart(period) {
  const now = new Date();
  switch (period) {
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'year': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    default:
      return null;
  }
}

function toDate(d) {
  if (!d) return new Date(0);
  return d.toDate ? d.toDate() : new Date(d);
}

export function useDashboardStats(trades, initialBalance = 0, period = 'all') {
  // Step 1: Filter & sort trades
  const { closed, sorted, openCount } = useMemo(() => {
    const periodStart = getPeriodStart(period);
    const filtered = periodStart
      ? trades.filter((t) => {
          const d = toDate(t.exitDate || t.entryDate);
          return d >= periodStart;
        })
      : trades;

    const cl = filtered.filter((t) => t.status === 'closed' || t.status === 'partial' || t.exitPrice > 0);
    // openCount is derived from closed so the two counts always sum to filtered.length
    const oc = filtered.length - cl.length;
    const sr = [...cl].sort((a, b) => toDate(a.exitDate) - toDate(b.exitDate));
    return { closed: cl, sorted: sr, openCount: oc };
  }, [trades, period]);

  // Step 2: Core stats + performance breakdowns
  const coreStats = useMemo(() => {
    const wins = closed.filter((t) => t.result === 'win');
    const losses = closed.filter((t) => t.result === 'loss');

    const totalPnL = closed.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
    const currentBalance = initialBalance + totalPnL;
    const balanceChangePercent = initialBalance > 0 ? (totalPnL / initialBalance) * 100 : 0;
    const winRate = calculateWinRate(closed);
    const expectancy = calculateExpectancy(closed);
    const avgRR = calculateAvgRR(closed);
    const currentStreak = calculateCurrentStreak(sorted);
    const profitFactor = calculateProfitFactor(closed);
    const pfRating = profitFactor === Infinity ? 'מעולה' : profitFactor >= 2.5 ? 'גבוה' : profitFactor >= 1.5 ? 'בינוני' : 'נמוך';

    const tradingDays = new Set(
      closed.map((t) => toDate(t.exitDate).toISOString().slice(0, 10))
    ).size;
    const tradesPerDay = tradingDays > 0 ? closed.length / tradingDays : 0;
    const avgDurationMs = calculateAvgDuration(closed);
    const avgDurationHours = avgDurationMs / (1000 * 60 * 60);
    const totalFees = closed.reduce((s, t) => s + (t.fees || 0), 0);

    // Today's PnL
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyPnL = closed
      .filter((t) => toDate(t.exitDate) >= today)
      .reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);

    // Strategy Performance
    const strategyMap = {};
    closed.forEach((t) => {
      const strat = t.strategy || 'ללא אסטרטגיה';
      if (!strategyMap[strat]) strategyMap[strat] = { wins: 0, losses: 0, pnl: 0, count: 0 };
      strategyMap[strat].count++;
      if (t.result === 'win') strategyMap[strat].wins++;
      else if (t.result === 'loss') strategyMap[strat].losses++;
      strategyMap[strat].pnl += t.netPnl ?? t.pnl ?? 0;
    });
    const strategyPerformance = Object.entries(strategyMap)
      .map(([name, d]) => ({ name, ...d, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0 }))
      .sort((a, b) => b.pnl - a.pnl);
    const bestStrategy = strategyPerformance[0]?.name || '–';

    // Monthly Performance
    const monthlyMap = {};
    sorted.forEach((t) => {
      const d = toDate(t.exitDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) monthlyMap[key] = { wins: 0, losses: 0, pnl: 0, count: 0 };
      monthlyMap[key].count++;
      if (t.result === 'win') monthlyMap[key].wins++;
      else if (t.result === 'loss') monthlyMap[key].losses++;
      monthlyMap[key].pnl += t.netPnl ?? t.pnl ?? 0;
    });
    let cumulativePnl = 0;
    // Keys are formatted YYYY-MM (zero-padded), so a plain string compare gives
    // chronological order without depending on locale-specific collation rules.
    const monthlyPerformance = Object.entries(monthlyMap)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([month, d]) => {
        cumulativePnl += d.pnl;
        return { month, ...d, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0, cumulativePnl };
      });

    // Session Performance — uses shared utility (Israel timezone, single source of truth)
    const sessionMap = {};
    closed.forEach((t) => {
      const sess = t.session || getSessionFromDate(t.entryDate, { fallback: SESSION_UNKNOWN });
      if (!sessionMap[sess]) sessionMap[sess] = { name: sess, count: 0, wins: 0, losses: 0, pnl: 0 };
      sessionMap[sess].count++;
      if (t.result === 'win') sessionMap[sess].wins++;
      else if (t.result === 'loss') sessionMap[sess].losses++;
      sessionMap[sess].pnl += t.netPnl ?? t.pnl ?? 0;
    });
    const sessionPerformance = Object.values(sessionMap)
      .map((s) => ({ ...s, winRate: s.count > 0 ? (s.wins / s.count) * 100 : 0, pnl: parseFloat(s.pnl.toFixed(2)) }))
      .sort((a, b) => b.pnl - a.pnl);

    // Day of Week Performance
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const dayMap = {};
    dayNames.forEach((name, i) => { dayMap[i] = { name, count: 0, wins: 0, pnl: 0 }; });
    closed.forEach((t) => {
      const day = toDate(t.exitDate).getDay();
      dayMap[day].count++;
      if (t.result === 'win') dayMap[day].wins++;
      dayMap[day].pnl += t.netPnl ?? t.pnl ?? 0;
    });
    const dayOfWeekPerformance = Object.values(dayMap)
      .filter((d) => d.count > 0)
      .map((d) => ({ ...d, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0, pnl: parseFloat((isNaN(d.pnl) ? 0 : d.pnl).toFixed(2)) }));

    // Streak History
    const streakHistory = [];
    if (sorted.length > 0) {
      let currentType = null;
      let currentLen = 0;
      let streakStart = null;
      sorted.forEach((t) => {
        const r = t.result;
        if (r === 'breakeven') return;
        if (r === currentType) {
          currentLen++;
        } else {
          if (currentType && currentLen > 0) {
            streakHistory.push({ index: streakHistory.length, type: currentType, length: currentType === 'win' ? currentLen : -currentLen, date: toDate(streakStart).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) });
          }
          currentType = r;
          currentLen = 1;
          streakStart = t.exitDate;
        }
      });
      if (currentType && currentLen > 0) {
        streakHistory.push({ index: streakHistory.length, type: currentType, length: currentType === 'win' ? currentLen : -currentLen, date: toDate(streakStart).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) });
      }
    }

    return {
      currentBalance,
      balanceChangePercent,
      totalPnL,
      totalTrades: closed.length,
      openCount,
      winRate,
      winCount: wins.length,
      lossCount: losses.length,
      expectancy,
      avgRR,
      currentStreak,
      profitFactor,
      pfRating,
      tradingDays,
      tradesPerDay,
      avgDurationHours,
      totalFees,
      dailyPnL,
      bestStrategy,
      strategyPerformance,
      monthlyPerformance,
      sessionPerformance,
      dayOfWeekPerformance,
      streakHistory,
    };
  }, [closed, sorted, openCount, initialBalance]);

  // Step 3: Equity curve + advanced metrics (depends on sorted + balance)
  const advancedStats = useMemo(() => {
    const returns = closed.map((t) => t.netPnl ?? t.pnl ?? 0);
    const sharpeRatio = calculateSharpeRatio(returns);
    const sortinoRatio = clampRatio(calculateSortinoRatio(returns));

    let equity = initialBalance || 0;
    const equityCurve = sorted.map((t) => {
      equity += t.netPnl ?? t.pnl ?? 0;
      return equity;
    });
    // Pass initialBalance as the true starting peak so drawdown from
    // the very first losing trade is captured correctly (fixes initialBalance=0 bug)
    const maxDrawdown = equityCurve.length ? calculateMaxDrawdown(equityCurve, initialBalance || 0) : 0;
    const calmarRatio = clampRatio(calculateCalmarRatio(coreStats.balanceChangePercent, maxDrawdown));

    // Start peak at initialBalance (before first trade) — fixes the case where
    // initialBalance=0 and first trade is a loss: equityCurve[0] would be negative,
    // making peakEquity negative and causing maxDrawdownAbsolute to under-report
    let peakEquity = initialBalance || 0;
    let maxDrawdownAbsolute = 0;
    for (const val of equityCurve) {
      if (val > peakEquity) peakEquity = val;
      const dd = peakEquity - val;
      if (dd > maxDrawdownAbsolute) maxDrawdownAbsolute = dd;
    }
    const recoveryFactor = calculateRecoveryFactor(coreStats.totalPnL, maxDrawdownAbsolute);

    // Start equity from actual balance at period start (not always from initialBalance)
    const periodStart = getPeriodStart(period);
    const prePeriodPnl = periodStart
      ? trades
          .filter((t) => (t.exitPrice > 0) && toDate(t.exitDate || t.entryDate) < periodStart)
          .reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0)
      : 0;

    let eqPeak = (initialBalance || 0) + prePeriodPnl;
    let eqVal = (initialBalance || 0) + prePeriodPnl;
    const equityChartData = sorted.map((t) => {
      const d = toDate(t.exitDate);
      eqVal += t.netPnl ?? t.pnl ?? 0;
      if (eqVal > eqPeak) eqPeak = eqVal;
      const dd = eqPeak > 0 ? ((eqPeak - eqVal) / eqPeak) * 100 : 0;
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { date: label, equity: parseFloat(eqVal.toFixed(2)), drawdown: parseFloat(dd.toFixed(2)) };
    });

    return { sharpeRatio, sortinoRatio, maxDrawdown, calmarRatio, recoveryFactor, equityChartData };
  }, [closed, sorted, initialBalance, trades, period, coreStats.balanceChangePercent, coreStats.totalPnL]);

  // Step 4: Correlation matrix (heavy — isolated, with symmetric optimization)
  const correlationMatrix = useMemo(() => {
    if (closed.length < 5) return { pairs: [], matrix: [] };

    const pairPnlByDate = {};
    closed.forEach((t) => {
      const dateKey = toDate(t.exitDate).toISOString().slice(0, 10);
      const pair = t.pair;
      if (!pairPnlByDate[dateKey]) pairPnlByDate[dateKey] = {};
      pairPnlByDate[dateKey][pair] = (pairPnlByDate[dateKey][pair] || 0) + (t.netPnl ?? t.pnl ?? 0);
    });

    const allPairs = [...new Set(closed.map((t) => t.pair))].filter((p) => {
      const datesWithPair = Object.keys(pairPnlByDate).filter((d) => pairPnlByDate[d][p] !== undefined);
      return datesWithPair.length >= 3;
    });

    if (allPairs.length < 2) return { pairs: allPairs, matrix: [] };

    const allDates = Object.keys(pairPnlByDate).sort();
    const n = allPairs.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(null));

    // Only compute upper triangle, mirror to lower (cuts computation in half)
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const x = [], y = [];
        for (const d of allDates) {
          if (pairPnlByDate[d][allPairs[i]] !== undefined && pairPnlByDate[d][allPairs[j]] !== undefined) {
            x.push(pairPnlByDate[d][allPairs[i]]);
            y.push(pairPnlByDate[d][allPairs[j]]);
          }
        }
        const corr = x.length >= 3 ? parseFloat(pearsonCorrelation(x, y).toFixed(2)) : null;
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }

    return { pairs: allPairs, matrix };
  }, [closed]);

  // Combine all stats (no computation, just merge)
  return useMemo(() => ({
    ...coreStats,
    ...advancedStats,
    correlationMatrix,
  }), [coreStats, advancedStats, correlationMatrix]);
}
