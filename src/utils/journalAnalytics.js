import { format } from 'date-fns';
import { isClosedTrade } from './calculations';

// Pure analytics for the journal's analytics tab. Extracted from TradeJournal
// so the (heavy) computation only runs when that tab is open, and so it can be
// unit-tested.

const tradeDate = (t) => {
  const raw = t.exitDate || t.entryDate;
  if (!raw) return null;
  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const netOf = (t) => t.netPnl ?? t.pnl ?? 0;

// Period-filtered trades — same window logic as useDashboardStats so the
// analytics match the selected period.
export function filterTradesByPeriod(trades, period, now = new Date()) {
  if (period === 'all') return trades;
  const start = new Date(now);
  if (period === 'week')  { start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0); }
  if (period === 'month') { start.setMonth(start.getMonth() - 1); start.setHours(0, 0, 0, 0); }
  if (period === 'year')  { start.setFullYear(start.getFullYear() - 1); start.setHours(0, 0, 0, 0); }
  return trades.filter((t) => {
    const d = tradeDate(t);
    return d ? d >= start : false;
  });
}

// Returns null when the set has no closed trades (the tab shows an empty state).
export function computeJournalAnalytics(periodTrades) {
  const closed = periodTrades.filter(isClosedTrade);
  if (!closed.length) return null;

  const wins = closed.filter((t) => t.result === 'win');
  const losses = closed.filter((t) => t.result === 'loss');
  const avgWin = wins.length ? wins.reduce((s, t) => s + netOf(t), 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + netOf(t), 0) / losses.length) : 0;
  const largestWin = wins.length ? Math.max(...wins.map(netOf)) : 0;
  const largestLoss = losses.length ? Math.min(...losses.map(netOf)) : 0;

  const safeTradeDate = (t) => tradeDate(t) || new Date(0);
  const sorted = [...closed].sort((a, b) => safeTradeDate(a) - safeTradeDate(b));

  const be = closed.filter((t) => t.result === 'breakeven').length;
  const pieData = [
    { name: 'רווח', value: wins.length },
    { name: 'הפסד', value: losses.length },
    { name: 'אפס', value: be },
  ].filter((d) => d.value > 0);

  const dailyMap = {};
  sorted.forEach((t) => {
    const key = format(safeTradeDate(t), 'MM/dd');
    if (!dailyMap[key]) dailyMap[key] = 0;
    dailyMap[key] += netOf(t);
  });
  const dailyPnL = Object.entries(dailyMap).map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(2)) }));

  const pairMap = {};
  closed.forEach((t) => {
    if (!pairMap[t.pair]) pairMap[t.pair] = { wins: 0, losses: 0, pnl: 0 };
    if (t.result === 'win') pairMap[t.pair].wins++;
    else if (t.result === 'loss') pairMap[t.pair].losses++;
    pairMap[t.pair].pnl += netOf(t);
  });
  const byPair = Object.entries(pairMap).map(([pair, d]) => {
    const total = d.wins + d.losses;
    return { pair, ...d, total, winRate: total > 0 ? (d.wins / total) * 100 : 0 };
  }).sort((a, b) => b.pnl - a.pnl);

  const tfMap = {};
  closed.forEach((t) => {
    const tf = t.timeframe || 'N/A';
    if (!tfMap[tf]) tfMap[tf] = { wins: 0, total: 0, pnl: 0 };
    tfMap[tf].total++;
    if (t.result === 'win') tfMap[tf].wins++;
    tfMap[tf].pnl += netOf(t);
  });
  const byTimeframe = Object.entries(tfMap).map(([tf, d]) => ({ timeframe: tf, ...d, winRate: ((d.wins / d.total) * 100) })).sort((a, b) => b.pnl - a.pnl);

  const tagMap = {};
  closed.forEach((t) => {
    const tags = Array.isArray(t.tags) ? t.tags : [];
    tags.forEach((tag) => {
      if (!tagMap[tag]) tagMap[tag] = { wins: 0, losses: 0, pnl: 0, count: 0 };
      tagMap[tag].count++;
      if (t.result === 'win') tagMap[tag].wins++;
      else if (t.result === 'loss') tagMap[tag].losses++;
      tagMap[tag].pnl += netOf(t);
    });
  });
  const byTag = Object.entries(tagMap).map(([tag, d]) => ({ tag, ...d, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0 })).sort((a, b) => b.pnl - a.pnl);

  let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
  sorted.forEach((t) => {
    if (t.result === 'win') { curWin++; curLoss = 0; maxWin = Math.max(maxWin, curWin); }
    else if (t.result === 'loss') { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss); }
    else { curWin = 0; curLoss = 0; }
  });

  const longTrades = closed.filter((t) => t.direction === 'long');
  const shortTrades = closed.filter((t) => t.direction === 'short');
  const longWins = longTrades.filter((t) => t.result === 'win').length;
  const shortWins = shortTrades.filter((t) => t.result === 'win').length;
  const longWinRate = longTrades.length ? (longWins / longTrades.length) * 100 : 0;
  const shortWinRate = shortTrades.length ? (shortWins / shortTrades.length) * 100 : 0;
  const longPnl = longTrades.reduce((s, t) => s + netOf(t), 0);
  const shortPnl = shortTrades.reduce((s, t) => s + netOf(t), 0);

  // By strategy — sorted by trade count
  const stratMap = {};
  closed.forEach((t) => {
    if (!t.strategy) return;
    if (!stratMap[t.strategy]) stratMap[t.strategy] = { wins: 0, losses: 0, pnl: 0, count: 0 };
    stratMap[t.strategy].count++;
    if (t.result === 'win') stratMap[t.strategy].wins++;
    else if (t.result === 'loss') stratMap[t.strategy].losses++;
    stratMap[t.strategy].pnl += netOf(t);
  });
  const byStrategy = Object.entries(stratMap)
    .map(([name, d]) => ({ name, ...d, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);

  return { avgWin, avgLoss, largestWin, largestLoss, pieData, dailyPnL, byPair, byTimeframe, byTag, byStrategy, maxWin, maxLoss, longWinRate, shortWinRate, longPnl, shortPnl, longCount: longTrades.length, shortCount: shortTrades.length, longWins, shortWins };
}
