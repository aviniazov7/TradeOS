import { useMemo } from 'react';
import { calculateWinRate, calculateProfitFactor, calculateExpectancy, calculateAvgRR, calculateMaxDrawdown, calculateSharpeRatio, calculateCalmarRatio, calculateCurrentStreak, calculateAvgDuration, calculateSortinoRatio, calculateRecoveryFactor, pearsonCorrelation, clampRatio, isClosedTrade, localDayKey, safePnl, tallyByKey } from '../utils/calculations';
import { getSessionFromDate, SESSION_UNKNOWN } from '../utils/sessions';
import { getPeriodStart, toDate } from '../utils/period';

// safePnl moved to utils/calculations (shared with the ratio helpers) — imported above.

// A closed trade's effective date. Broker-CSV imports (a profit column but no
// exit-date column) and live SL/TP auto-closes can lack `exitDate`; without the
// entryDate fallback, toDate() maps them to 1970-01-01 — which scrambles the
// equity curve order, monthly buckets, day-of-week split and "today" P&L. This
// mirrors the period filter, which already falls back the same way.
export function tradeDate(t) {
  return toDate(t?.exitDate || t?.entryDate);
}

export function useDashboardStats(trades, initialBalance = 0, period = 'all') {
  // Step 1: Filter & sort trades
  const { closed, sorted, openCount, prePeriodPnl } = useMemo(() => {
    const periodStart = getPeriodStart(period);
    const filtered = periodStart
      ? trades.filter((t) => {
          const d = tradeDate(t);
          return d >= periodStart;
        })
      : trades;

    // The shared isClosedTrade predicate keeps this in lockstep with every
    // other screen. 'partial' rows are excluded on purpose: partial-TP
    // auto-closes can write a netPnl computed from the contract-inflated
    // quantity (MEXC vol is in contracts, not coins), which otherwise blows
    // net profit up and craters the win rate; 'open' rows carry a live mark
    // price whose unrealized PnL would swing the numbers day to day.
    const cl = filtered.filter(isClosedTrade);
    // openCount is derived from closed so the two counts always sum to filtered.length
    const oc = filtered.length - cl.length;
    const sr = [...cl].sort((a, b) => tradeDate(a) - tradeDate(b));
    // P&L realized BEFORE the selected period — so a filtered view's balance and
    // drawdown baseline start from the real equity, not from initialBalance
    // (which would drop the whole pre-period P&L). Shared by core + advanced.
    const prePeriodPnl = periodStart
      ? trades.filter((t) => isClosedTrade(t) && tradeDate(t) < periodStart).reduce((s, t) => s + safePnl(t), 0)
      : 0;
    return { closed: cl, sorted: sr, openCount: oc, prePeriodPnl };
  }, [trades, period]);

  // Step 2: Core stats + performance breakdowns
  const coreStats = useMemo(() => {
    const wins = closed.filter((t) => t.result === 'win');
    const losses = closed.filter((t) => t.result === 'loss');

    const totalPnL = closed.reduce((s, t) => s + (safePnl(t)), 0);
    // Balance starts from the period's OPENING equity (initial + pre-period P&L)
    // so a filtered view shows the real balance and a period-relative "% change".
    // period='all' → prePeriodPnl is 0, so the all-time view is unchanged.
    const startBalance = (initialBalance || 0) + prePeriodPnl;
    const currentBalance = startBalance + totalPnL;
    const balanceChangePercent = startBalance > 0 ? (totalPnL / startBalance) * 100 : 0;
    const winRate = calculateWinRate(closed);
    const expectancy = calculateExpectancy(closed);
    const avgRR = calculateAvgRR(closed);
    const currentStreak = calculateCurrentStreak(sorted);
    const profitFactor = calculateProfitFactor(closed);
    const pfRating = profitFactor === Infinity ? 'מעולה' : profitFactor >= 2.5 ? 'גבוה' : profitFactor >= 1.5 ? 'בינוני' : 'נמוך';

    const tradingDays = new Set(
      closed.map((t) => localDayKey(tradeDate(t)))
    ).size;
    const tradesPerDay = tradingDays > 0 ? closed.length / tradingDays : 0;
    const avgDurationMs = calculateAvgDuration(closed);
    const avgDurationHours = avgDurationMs / (1000 * 60 * 60);
    const totalFees = closed.reduce((s, t) => s + (t.fees || 0), 0);

    // Today's PnL
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyPnL = closed
      .filter((t) => tradeDate(t) >= today)
      .reduce((s, t) => s + (safePnl(t)), 0);

    // Strategy Performance
    const strategyPerformance = tallyByKey(closed, (t) => t.strategy || 'ללא אסטרטגיה', safePnl)
      .map((b) => ({ ...b, name: b.key }))
      .sort((a, b) => b.pnl - a.pnl);
    const bestStrategy = strategyPerformance[0]?.name || '–';

    // Monthly Performance
    let cumulativePnl = 0;
    // Keys are formatted YYYY-MM (zero-padded), so a plain string compare gives
    // chronological order without depending on locale-specific collation rules.
    const monthlyPerformance = tallyByKey(sorted, (t) => {
      const d = tradeDate(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }, safePnl)
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((b) => {
        cumulativePnl += b.pnl;
        return { ...b, month: b.key, cumulativePnl };
      });

    // Session Performance — uses shared utility (Israel timezone, single source of truth)
    const sessionPerformance = tallyByKey(
      closed,
      (t) => t.session || getSessionFromDate(t.entryDate, { fallback: SESSION_UNKNOWN }),
      safePnl,
    )
      .map((b) => ({ ...b, name: b.key, pnl: parseFloat(b.pnl.toFixed(2)) }))
      .sort((a, b) => b.pnl - a.pnl);

    // Day of Week Performance
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const dayOfWeekPerformance = tallyByKey(closed, (t) => tradeDate(t).getDay(), safePnl)
      .sort((a, b) => a.key - b.key)
      .map((b) => ({ ...b, name: dayNames[b.key], pnl: parseFloat((isNaN(b.pnl) ? 0 : b.pnl).toFixed(2)) }));

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
          streakStart = t.exitDate || t.entryDate;
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
  }, [closed, sorted, openCount, initialBalance, prePeriodPnl]);

  // Step 3: Equity curve + advanced metrics (depends on sorted + balance)
  const advancedStats = useMemo(() => {
    const returns = closed.map((t) => safePnl(t));
    const sharpeRatio = calculateSharpeRatio(returns);
    const sortinoRatio = clampRatio(calculateSortinoRatio(returns));

    // Balance at the START of the selected period = initialBalance + everything
    // earned before it (shared prePeriodPnl from step 1). Correct peak baseline
    // so drawdown/Calmar/recovery on a FILTERED view match the equity chart.
    const startBalance = (initialBalance || 0) + prePeriodPnl;

    let equity = startBalance;
    const equityCurve = sorted.map((t) => {
      equity += safePnl(t);
      return equity;
    });
    // startBalance is the true starting peak so drawdown from the first losing
    // trade of the period is captured correctly (also fixes initialBalance=0).
    const maxDrawdown = equityCurve.length ? calculateMaxDrawdown(equityCurve, startBalance) : 0;
    const calmarRatio = clampRatio(calculateCalmarRatio(coreStats.balanceChangePercent, maxDrawdown));

    let peakEquity = startBalance;
    let maxDrawdownAbsolute = 0;
    for (const val of equityCurve) {
      if (val > peakEquity) peakEquity = val;
      const dd = peakEquity - val;
      if (dd > maxDrawdownAbsolute) maxDrawdownAbsolute = dd;
    }
    const recoveryFactor = calculateRecoveryFactor(coreStats.totalPnL, maxDrawdownAbsolute);

    // Chart shares the same period-start baseline as the drawdown KPI above.
    let eqPeak = startBalance;
    let eqVal = startBalance;
    const equityChartData = sorted.map((t) => {
      const d = tradeDate(t);
      eqVal += safePnl(t);
      if (eqVal > eqPeak) eqPeak = eqVal;
      const dd = eqPeak > 0 ? ((eqPeak - eqVal) / eqPeak) * 100 : 0;
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { date: label, equity: parseFloat(eqVal.toFixed(2)), drawdown: parseFloat(dd.toFixed(2)) };
    });

    return { sharpeRatio, sortinoRatio, maxDrawdown, calmarRatio, recoveryFactor, equityChartData };
  }, [closed, sorted, initialBalance, prePeriodPnl, coreStats.balanceChangePercent, coreStats.totalPnL]);

  // Step 4: Correlation matrix (heavy — isolated, with symmetric optimization)
  const correlationMatrix = useMemo(() => {
    if (closed.length < 5) return { pairs: [], matrix: [] };

    const pairPnlByDate = {};
    closed.forEach((t) => {
      const dateKey = localDayKey(tradeDate(t));
      const pair = t.pair;
      if (!pairPnlByDate[dateKey]) pairPnlByDate[dateKey] = {};
      pairPnlByDate[dateKey][pair] = (pairPnlByDate[dateKey][pair] || 0) + (safePnl(t));
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
