// Aggregate a trade list into a compact JSON the AI can reason about without
// re-deriving everything from raw fields. Free = current month; Premium = full
// history (and adds previous-month comparison + extended breakdowns).

import { isClosedTrade, winRateOf } from './calculations';

const tradeMs = (t) => {
  const d = t.exitDate || t.entryDate || t.createdAt;
  if (!d) return 0;
  if (typeof d?.toDate === 'function') return d.toDate().getTime();
  if (typeof d === 'number') return d;
  const ms = new Date(d).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};
const pnlOf = (t) => Number(t.netPnl ?? t.pnl ?? 0) || 0;
const isClosed = isClosedTrade; // the ONE shared predicate — keep in lockstep with every screen

function summarize(trades) {
  const total = trades.length;
  if (!total) return null;
  const wins = trades.filter((t) => pnlOf(t) > 0);
  const losses = trades.filter((t) => pnlOf(t) < 0);
  const pnl = trades.reduce((s, t) => s + pnlOf(t), 0);
  // wins / (wins + losses) — breakevens excluded, same as every screen.
  const wr = Math.round(winRateOf(wins.length, losses.length) * 10) / 10;
  const avgWin = wins.length ? wins.reduce((s, t) => s + pnlOf(t), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + pnlOf(t), 0) / losses.length : 0;
  const profitFactor = losses.length && avgLoss < 0
    ? Math.round((Math.abs(wins.reduce((s, t) => s + pnlOf(t), 0) / avgLoss / losses.length)) * 100) / 100
    : null;
  return {
    total,
    pnl: Math.round(pnl * 100) / 100,
    winRate: wr,
    wins: wins.length,
    losses: losses.length,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor,
  };
}

function topGroups(trades, keyFn, take = 5) {
  const m = new Map();
  for (const t of trades) {
    const k = keyFn(t);
    if (!k) continue;
    const cur = m.get(k) || { trades: 0, pnl: 0, wins: 0, losses: 0 };
    cur.trades++;
    cur.pnl += pnlOf(t);
    if (pnlOf(t) > 0) cur.wins++;
    else if (pnlOf(t) < 0) cur.losses++;
    m.set(k, cur);
  }
  return [...m.entries()]
    .sort((a, b) => b[1].trades - a[1].trades)
    .slice(0, take)
    .map(([key, v]) => ({
      key,
      trades: v.trades,
      pnl: Math.round(v.pnl * 100) / 100,
      winRate: Math.round(winRateOf(v.wins, v.losses) * 10) / 10,
    }));
}

// The exact trade set buildCoachStats will summarize. Exported so anything that
// enriches the same payload (the psychology cross-reference) measures the same
// period — a free user must not get month-scoped headline numbers alongside an
// all-time psychology section.
export function coachScopeTrades(allTrades, { premium = false } = {}) {
  const closed = (allTrades || []).filter(isClosed);
  if (premium) return closed;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  return closed.filter((t) => tradeMs(t) >= monthStart);
}

export function buildCoachStats(allTrades, { premium = false } = {}) {
  const closed = (allTrades || []).filter(isClosed);
  if (!closed.length) return { empty: true };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

  const thisMonth = closed.filter((t) => tradeMs(t) >= monthStart);
  const prevMonth = closed.filter((t) => tradeMs(t) >= prevMonthStart && tradeMs(t) < monthStart);

  const scope = premium ? closed : thisMonth;
  if (!scope.length) return { empty: true, reason: premium ? 'no-trades' : 'no-trades-this-month' };

  // Worst / best trades — caps strings tightly so the prompt stays small.
  const sortedByPnl = [...scope].sort((a, b) => pnlOf(b) - pnlOf(a));
  const compactTrade = (t) => ({
    pair: t.pair || t.symbol || '?',
    direction: t.direction || null,
    pnl: Math.round(pnlOf(t) * 100) / 100,
    // rrRatio, not t.rr (which never existed — the coach always got null and
    // couldn't reason about R). Math.abs normalizes legacy signed imports.
    rr: t.rrRatio == null ? null : Math.abs(t.rrRatio),
    strategy: t.strategy || null,
    session: t.session || null,
  });

  const out = {
    scope: premium ? 'all-time' : 'this-month',
    summary: summarize(scope),
    byPair: topGroups(scope, (t) => t.pair || t.symbol, premium ? 8 : 5),
    byDirection: topGroups(scope, (t) => t.direction, 2),
    bestTrades: sortedByPnl.slice(0, 3).map(compactTrade),
    worstTrades: sortedByPnl.slice(-3).reverse().map(compactTrade),
  };

  if (premium) {
    out.bySession = topGroups(scope, (t) => t.session, 5);
    out.byStrategy = topGroups(scope, (t) => t.strategy, 5);
    out.compareToPrevMonth = {
      thisMonth: summarize(thisMonth),
      prevMonth: summarize(prevMonth),
    };
  }

  return out;
}
