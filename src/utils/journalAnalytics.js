import { format } from 'date-fns';
import { isClosedTrade, safePnl, calculatePnL, localDayKey, winRateOf, calculateMaxStreaks, signedTradeR } from './calculations';

// Pure analytics for the journal's analytics tab. Extracted from TradeJournal
// so the (heavy) computation only runs when that tab is open, and so it can be
// unit-tested.

const tradeDate = (t) => {
  const raw = t.exitDate || t.entryDate;
  if (!raw) return null;
  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

// safePnl, not `netPnl ?? pnl`: a numeric-string or NaN P&L from a dirty
// import would otherwise concatenate into a string sum and crash .toFixed.
const netOf = safePnl;

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

  // Bucket by the full local day (yyyy-MM-dd) — keying by 'MM/dd' merged the
  // same calendar day of different years into one bar. Only the LABEL is
  // short; it gains the year when the range spans more than one.
  const dailyMap = new Map();
  sorted.forEach((t) => {
    const d = safeTradeDate(t);
    const key = localDayKey(d);
    const cur = dailyMap.get(key) || { d, pnl: 0 };
    cur.pnl += netOf(t);
    dailyMap.set(key, cur);
  });
  const years = new Set([...dailyMap.keys()].map((k) => k.slice(0, 4)));
  const labelFmt = years.size > 1 ? 'MM/dd/yy' : 'MM/dd';
  const dailyPnL = [...dailyMap.entries()].map(([key, { d, pnl }]) => ({
    key, date: format(d, labelFmt), pnl: parseFloat(pnl.toFixed(2)),
  }));

  const pairMap = {};
  closed.forEach((t) => {
    if (!pairMap[t.pair]) pairMap[t.pair] = { wins: 0, losses: 0, pnl: 0 };
    if (t.result === 'win') pairMap[t.pair].wins++;
    else if (t.result === 'loss') pairMap[t.pair].losses++;
    pairMap[t.pair].pnl += netOf(t);
  });
  const byPair = Object.entries(pairMap).map(([pair, d]) => {
    const total = d.wins + d.losses;
    return { pair, ...d, total, winRate: winRateOf(d.wins, d.losses) };
  }).sort((a, b) => b.pnl - a.pnl);

  const tfMap = {};
  closed.forEach((t) => {
    const tf = t.timeframe || 'N/A';
    if (!tfMap[tf]) tfMap[tf] = { wins: 0, losses: 0, total: 0, pnl: 0 };
    tfMap[tf].total++;
    if (t.result === 'win') tfMap[tf].wins++;
    else if (t.result === 'loss') tfMap[tf].losses++;
    tfMap[tf].pnl += netOf(t);
  });
  const byTimeframe = Object.entries(tfMap).map(([tf, d]) => ({ timeframe: tf, ...d, winRate: winRateOf(d.wins, d.losses) })).sort((a, b) => b.pnl - a.pnl);

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
  const byTag = Object.entries(tagMap).map(([tag, d]) => ({ tag, ...d, winRate: winRateOf(d.wins, d.losses) })).sort((a, b) => b.pnl - a.pnl);

  // Breakevens neither extend nor break a run — same rule as the current streak.
  const { maxWin, maxLoss } = calculateMaxStreaks(sorted);

  const longTrades = closed.filter((t) => t.direction === 'long');
  const shortTrades = closed.filter((t) => t.direction === 'short');
  const longWins = longTrades.filter((t) => t.result === 'win').length;
  const shortWins = shortTrades.filter((t) => t.result === 'win').length;
  const longLosses = longTrades.filter((t) => t.result === 'loss').length;
  const shortLosses = shortTrades.filter((t) => t.result === 'loss').length;
  const longWinRate = winRateOf(longWins, longLosses);
  const shortWinRate = winRateOf(shortWins, shortLosses);
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
    .map(([name, d]) => ({ name, ...d, winRate: winRateOf(d.wins, d.losses) }))
    .sort((a, b) => b.count - a.count);

  return { avgWin, avgLoss, largestWin, largestLoss, pieData, dailyPnL, byPair, byTimeframe, byTag, byStrategy, maxWin, maxLoss, longWinRate, shortWinRate, longPnl, shortPnl, longCount: longTrades.length, shortCount: shortTrades.length, longWins, shortWins };
}

// Signed net R — the same number the trades table, the summary bar and the
// analytics "סיכון/סיכוי" use. See signedTradeR.
const signedR = signedTradeR;

// Headline numbers for the trades tab's summary bar (follows the filters).
export function summarizeTrades(trades) {
  const closed = trades.filter(isClosedTrade);
  const open = trades.length - closed.length;
  const net = closed.reduce((s, t) => s + safePnl(t), 0);
  const wins = closed.filter((t) => t.result === 'win').length;
  const losses = closed.filter((t) => t.result === 'loss').length;
  const rs = closed.map(signedR).filter((r) => r !== null);
  return {
    closed: closed.length,
    open,
    net,
    wins,
    losses,
    // Same definition as every other screen: breakevens are excluded.
    winRate: closed.length ? winRateOf(wins, losses) : null,
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
  };
}

// Live (unrealized) P&L of an open crypto position at `livePrice`. A partially
// closed position counts only the part still open. Gross (before fees).
// null when it can't be computed: closed trade, CME futures (no live feed),
// or no price / size.
export function computeUnrealized(trade, livePrice) {
  if (!(livePrice > 0) || isClosedTrade(trade) || trade.assetClass === 'futures_cme') return null;
  const entry = parseFloat(trade.entryPrice);
  if (!(entry > 0)) return null;
  let qty = parseFloat(trade.quantity);
  if (!(qty > 0)) {
    const ps = parseFloat(trade.positionSize);
    qty = ps > 0 ? ps / entry : 0;
  }
  const closedPct = (trade.exits || []).reduce((s, e) => s + (parseFloat(e.percent) || 0), 0);
  const openQty = qty * Math.max(0, 100 - closedPct) / 100;
  if (!(openQty > 0)) return null;
  const pnl = calculatePnL(trade.direction, entry, livePrice, openQty);
  const lev = parseFloat(trade.leverage) || 1;
  return { pnl, percent: (pnl / (entry * openQty)) * 100 * lev };
}

const entryTime = (t) => {
  const raw = t.entryDate;
  if (!raw) return 0;
  const d = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

// Sort keys for the trades table. Each returns a number/string, or null for
// "no value" (those always sink to the bottom, whatever the direction).
const SORT_VALUES = {
  date: (t) => entryTime(t),
  // Closed trades by realized P&L; open ones by their live P&L when known.
  pnl: (t, live) => (isClosedTrade(t) ? safePnl(t) : live?.[t.id]?.pnl ?? null),
  r: (t) => (isClosedTrade(t) ? signedR(t) : null),
  pair: (t) => (t.pair || '').toUpperCase(),
};

export function sortJournalTrades(trades, { key = 'date', dir = 'desc' } = {}, liveById = {}) {
  const value = SORT_VALUES[key] || SORT_VALUES.date;
  const sign = dir === 'asc' ? 1 : -1;
  return [...trades].sort((a, b) => {
    const va = value(a, liveById);
    const vb = value(b, liveById);
    if (va === null && vb === null) return entryTime(b) - entryTime(a);
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    // Ties fall back to newest first so the order is stable and predictable.
    return cmp !== 0 ? cmp * sign : entryTime(b) - entryTime(a);
  });
}

// R buckets for the distribution chart. Edges are explicit so a clean stop-out
// at exactly -1R lands in "-2R…-1R" (the common case) and breakeven in "0…1R".
export const R_BUCKETS = [
  { label: '≤ -2R', side: 'loss', test: (r) => r <= -2 },
  { label: '-2R…-1R', side: 'loss', test: (r) => r > -2 && r <= -1 },
  { label: '-1R…0', side: 'loss', test: (r) => r > -1 && r < 0 },
  { label: '0…1R', side: 'win', test: (r) => r >= 0 && r < 1 },
  { label: '1R…2R', side: 'win', test: (r) => r >= 1 && r < 2 },
  { label: '2R…3R', side: 'win', test: (r) => r >= 2 && r < 3 },
  { label: '≥ 3R', side: 'win', test: (r) => r >= 3 },
];

// Everything the "R" card needs, from the closed trades of the period.
// Only trades with a stop have an R; the rest are reported separately
// because their risk was never defined.
export function computeRStats(trades) {
  const closed = trades.filter(isClosedTrade);
  const withR = [];
  const noStop = { count: 0, pnl: 0 };
  for (const t of closed) {
    const r = signedR(t);
    if (r === null) { noStop.count++; noStop.pnl += safePnl(t); } else withR.push(r);
  }
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const winsR = withR.filter((r) => r > 0);
  const lossesR = withR.filter((r) => r < 0);
  const buckets = R_BUCKETS.map(({ label, side, test }) => ({
    label, side, count: withR.filter(test).length,
  }));
  return {
    closed: closed.length,
    withStop: withR.length,
    stopRate: closed.length ? (withR.length / closed.length) * 100 : null,
    totalR: sum(withR),
    expectancyR: withR.length ? sum(withR) / withR.length : null,
    avgWinR: winsR.length ? sum(winsR) / winsR.length : null,
    avgLossR: lossesR.length ? sum(lossesR) / lossesR.length : null,
    bestR: withR.length ? Math.max(...withR) : null,
    worstR: withR.length ? Math.min(...withR) : null,
    buckets,
    noStop,
  };
}
