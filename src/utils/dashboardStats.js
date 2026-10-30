import {
  calculateWinRate,
  calculateProfitFactor,
  calculateExpectancy,
  calculateAvgRR,
  calculateSharpeRatio,
  calculateCalmarRatio,
  calculateCurrentStreak,
  calculateAvgDuration,
  calculateSortinoRatio,
  calculateRecoveryFactor,
  pearsonCorrelation,
  clampRatio,
  isClosedTrade,
  localDayKey,
  safePnl,
  winRateOf,
  computeDrawdown,
  partialRealizedPnl,
} from './calculations';
import { getSessionFromDate, SESSION_UNKNOWN } from './sessions';
import { getPeriodStart, toDate } from './period';

// A closed trade's effective date. Broker-CSV imports (a profit column but no
// exit-date column) and live SL/TP auto-closes can lack `exitDate`; without the
// entryDate fallback, toDate() maps them to 1970-01-01 — which scrambles the
// equity curve order, monthly buckets, day-of-week split and "today" P&L. This
// mirrors the period filter, which already falls back the same way.
export function tradeDate(t) {
  return toDate(t?.exitDate || t?.entryDate);
}

function parseBound(value, end) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value ?? '').trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (day) {
    const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    if (Number.isNaN(d.getTime())) return null;
    if (end) d.setHours(23, 59, 59, 999);
    return d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The dashboard window. `from` / `to` (used by the public API) replace the
 * named period. A date-only YYYY-MM-DD is a local day, matching the journal.
 * Omitting both leaves the original week/month/year/all behaviour.
 */
export function windowBounds(period = 'all', { now = new Date(), from = null, to = null } = {}) {
  const clock = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const hasRange = from != null || to != null;
  const periodStart = hasRange
    ? (from != null ? parseBound(from, false) : null)
    : getPeriodStart(period, clock);
  const periodEnd = to != null ? parseBound(to, true) : null;
  return { periodStart, periodEnd, now: clock };
}

function inWindow(t, periodStart, periodEnd) {
  const d = tradeDate(t);
  if (periodStart && !(d >= periodStart)) return false;
  if (periodEnd && d > periodEnd) return false;
  return true;
}

/**
 * The same closed-trade slice the dashboard stats are computed from.
 * Shared with the public API so a journal's risk and return use one window.
 */
export function sliceTradesForStats(trades, period = 'all', options = {}) {
  const list = Array.isArray(trades) ? trades : [];
  const { periodStart, periodEnd, now } = windowBounds(period, options);
  const filtered = (!periodStart && !periodEnd)
    ? list
    : list.filter((t) => inWindow(t, periodStart, periodEnd));

  // The shared isClosedTrade predicate keeps this in lockstep with every
  // other screen. 'partial' rows are excluded on purpose: partial-TP
  // auto-closes can write a netPnl computed from the contract-inflated
  // quantity (MEXC vol is in contracts, not coins), which otherwise blows
  // net profit up and craters the win rate; 'open' rows carry a live mark
  // price whose unrealized PnL would swing the numbers day to day.
  const closed = filtered.filter(isClosedTrade);
  const partials = filtered.filter((t) => partialRealizedPnl(t) !== 0);
  const openCount = filtered.length - closed.length;
  const sorted = [...closed].sort((a, b) => tradeDate(a) - tradeDate(b));
  const prePeriodPnl = periodStart
    ? list.filter((t) => isClosedTrade(t) && tradeDate(t) < periodStart).reduce((s, t) => s + safePnl(t), 0)
    : 0;
  const partialRealizedPnL = partials.reduce((s, t) => s + partialRealizedPnl(t), 0);
  return {
    closed, sorted, openCount, prePeriodPnl, partialRealizedPnL,
    partialCount: partials.length, now, periodStart, periodEnd,
  };
}

/**
 * Dashboard numbers for a set of trades. Pure: the hook passes the same
 * arguments it used to close over, and a fixed `now` makes tests stable.
 * `from` / `to` are optional and unused by the app.
 */
export function computeDashboardStats(trades, initialBalance = 0, period = 'all', options = {}) {
  const {
    closed, sorted, openCount, prePeriodPnl, partialRealizedPnL, partialCount, now,
  } = sliceTradesForStats(trades, period, options);

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
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dailyPnL = closed
    .filter((t) => tradeDate(t) >= today)
    .reduce((s, t) => s + (safePnl(t)), 0);

  // Strategy Performance
  const strategyMap = {};
  closed.forEach((t) => {
    const strat = t.strategy || 'ללא אסטרטגיה';
    if (!strategyMap[strat]) strategyMap[strat] = { wins: 0, losses: 0, pnl: 0, count: 0 };
    strategyMap[strat].count++;
    if (t.result === 'win') strategyMap[strat].wins++;
    else if (t.result === 'loss') strategyMap[strat].losses++;
    strategyMap[strat].pnl += safePnl(t);
  });
  const strategyPerformance = Object.entries(strategyMap)
    .map(([name, d]) => ({ name, ...d, winRate: winRateOf(d.wins, d.losses) }))
    .sort((a, b) => b.pnl - a.pnl);
  const bestStrategy = strategyPerformance[0]?.name || '–';

  // Monthly Performance
  const monthlyMap = {};
  sorted.forEach((t) => {
    const d = tradeDate(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap[key]) monthlyMap[key] = { wins: 0, losses: 0, pnl: 0, count: 0 };
    monthlyMap[key].count++;
    if (t.result === 'win') monthlyMap[key].wins++;
    else if (t.result === 'loss') monthlyMap[key].losses++;
    monthlyMap[key].pnl += safePnl(t);
  });
  let cumulativePnl = 0;
  // Keys are formatted YYYY-MM (zero-padded), so a plain string compare gives
  // chronological order without depending on locale-specific collation rules.
  const monthlyPerformance = Object.entries(monthlyMap)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, d]) => {
      cumulativePnl += d.pnl;
      return { month, ...d, winRate: winRateOf(d.wins, d.losses), cumulativePnl };
    });

  // Session Performance — uses shared utility (Israel timezone, single source of truth)
  const sessionMap = {};
  closed.forEach((t) => {
    const sess = t.session || getSessionFromDate(t.entryDate, { fallback: SESSION_UNKNOWN });
    if (!sessionMap[sess]) sessionMap[sess] = { name: sess, count: 0, wins: 0, losses: 0, pnl: 0 };
    sessionMap[sess].count++;
    if (t.result === 'win') sessionMap[sess].wins++;
    else if (t.result === 'loss') sessionMap[sess].losses++;
    sessionMap[sess].pnl += safePnl(t);
  });
  const sessionPerformance = Object.values(sessionMap)
    .map((s) => ({ ...s, winRate: winRateOf(s.wins, s.losses), pnl: parseFloat(s.pnl.toFixed(2)) }))
    .sort((a, b) => b.pnl - a.pnl);

  // Day of Week Performance
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const dayMap = {};
  dayNames.forEach((name, i) => { dayMap[i] = { name, count: 0, wins: 0, losses: 0, pnl: 0 }; });
  closed.forEach((t) => {
    const day = tradeDate(t).getDay();
    dayMap[day].count++;
    if (t.result === 'win') dayMap[day].wins++;
    else if (t.result === 'loss') dayMap[day].losses++;
    dayMap[day].pnl += safePnl(t);
  });
  const dayOfWeekPerformance = Object.values(dayMap)
    .filter((d) => d.count > 0)
    .map((d) => ({ ...d, winRate: winRateOf(d.wins, d.losses), pnl: parseFloat((isNaN(d.pnl) ? 0 : d.pnl).toFixed(2)) }));

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

  const coreStats = {
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
    partialRealizedPnL,
    partialCount,
  };

  const returns = closed.map((t) => safePnl(t));
  const sharpeRatio = calculateSharpeRatio(returns);
  const sortinoRatio = clampRatio(calculateSortinoRatio(returns));

  // Balance at the START of the selected period = initialBalance + everything
  // earned before it. Correct peak baseline so drawdown/Calmar/recovery on a
  // FILTERED view match the equity chart.
  // startBalance is the true starting peak so drawdown from the first losing
  // trade of the period is captured correctly. With NO starting capital the
  // percent is meaningless (it would be measured on cumulative P&L: +10 then
  // −9 = "90%"), so maxDrawdown / calmarRatio are null and the UI shows the
  // dollar drawdown instead. Capital means a real starting balance (or a
  // live wallet) — pre-period P&L on a zero balance is still just P&L.
  const hasCapital = (initialBalance || 0) > 0 && startBalance > 0;
  const { maxDrawdownPct, maxDrawdownAbs: maxDrawdownAbsolute } = computeDrawdown(sorted.map(safePnl), hasCapital ? startBalance : 0);
  const maxDrawdown = maxDrawdownPct;
  const calmarRatio = hasCapital ? clampRatio(calculateCalmarRatio(coreStats.balanceChangePercent, maxDrawdown)) : null;
  const recoveryFactor = calculateRecoveryFactor(coreStats.totalPnL, maxDrawdownAbsolute);

  // Chart shares the same period-start baseline as the drawdown KPI above.
  let eqPeak = startBalance;
  let eqVal = startBalance;
  const equityChartData = sorted.map((t) => {
    const d = tradeDate(t);
    eqVal += safePnl(t);
    if (eqVal > eqPeak) eqPeak = eqVal;
    const dd = hasCapital && eqPeak > 0 ? ((eqPeak - eqVal) / eqPeak) * 100 : 0;
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { date: label, equity: parseFloat(eqVal.toFixed(2)), drawdown: parseFloat(dd.toFixed(2)) };
  });

  const advancedStats = { sharpeRatio, sortinoRatio, maxDrawdown, maxDrawdownAbsolute, calmarRatio, recoveryFactor, equityChartData };

  let correlationMatrix;
  if (closed.length < 5) {
    correlationMatrix = { pairs: [], matrix: [] };
  } else {
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

    if (allPairs.length < 2) {
      correlationMatrix = { pairs: allPairs, matrix: [] };
    } else {
      const allDates = Object.keys(pairPnlByDate).sort();
      const n = allPairs.length;
      const matrix = Array.from({ length: n }, () => Array(n).fill(null));
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
      correlationMatrix = { pairs: allPairs, matrix };
    }
  }

  return { ...coreStats, ...advancedStats, correlationMatrix };
}
