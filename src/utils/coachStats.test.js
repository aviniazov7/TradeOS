import { describe, it, expect } from 'vitest';
import { buildCoachStats, coachScopeTrades } from './coachStats';

// The payload the AI analyst reasons over. The model never derives a statistic
// — it only phrases what this file computed — so an error here becomes an
// authoritative-sounding sentence about the user's trading.

const iso = (d) => new Date(d).toISOString();
const thisMonth = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 15, 12); };
const lastMonth = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() - 1, 15, 12); };
const longAgo = () => { const n = new Date(); return new Date(n.getFullYear() - 2, n.getMonth(), 15, 12); };

const t = (over = {}) => ({
  status: 'closed', pair: 'BTCUSDT', direction: 'long',
  netPnl: 100, rrRatio: 2, strategy: 'breakout', session: 'London',
  exitDate: iso(thisMonth()), ...over,
});

describe('coachScopeTrades — free sees this month, premium sees everything', () => {
  it('a free user is scoped to the current month', () => {
    const trades = [t(), t({ exitDate: iso(lastMonth()) }), t({ exitDate: iso(longAgo()) })];
    expect(coachScopeTrades(trades).length).toBe(1);
    expect(coachScopeTrades(trades, { premium: true }).length).toBe(3);
  });

  it('open trades are never in scope', () => {
    expect(coachScopeTrades([{ status: 'open', entryDate: iso(thisMonth()) }], { premium: true })).toEqual([]);
  });

  it('handles a missing list', () => {
    expect(coachScopeTrades(null)).toEqual([]);
  });
});

describe('buildCoachStats — summary arithmetic', () => {
  it('counts wins and losses by P&L SIGN and rounds the money', () => {
    const s = buildCoachStats([
      t({ netPnl: 100.005 }), t({ netPnl: 50 }), t({ netPnl: -30 }),
    ]).summary;
    expect(s.total).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBe(66.7);
    expect(s.pnl).toBeCloseTo(120.01, 2);
  });

  it('a breakeven counts in the total but is kept OUT of the win rate', () => {
    // Win rate is over DECIDED trades, matching calculateWinRate — the app's
    // single definition. Dividing by the full total made the analyst quote a
    // lower number than the dashboard showed for exactly the same trades.
    const s = buildCoachStats([t({ netPnl: 100 }), t({ netPnl: 0 })]).summary;
    expect(s.total).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(0);
    expect(s.winRate).toBe(100);
  });

  it('agrees with the dashboard when breakevens are present', () => {
    // 2 wins, 1 loss, 1 breakeven → 66.7 decided-only, not 50 over the total.
    const s = buildCoachStats([
      t({ netPnl: 10 }), t({ netPnl: 20 }), t({ netPnl: -5 }), t({ netPnl: 0 }),
    ]).summary;
    expect(s.winRate).toBe(66.7);
  });

  it('profit factor is gross win over gross loss, and null when nothing lost', () => {
    const s = buildCoachStats([
      t({ netPnl: 200 }), t({ netPnl: 100 }), t({ netPnl: -100 }), t({ netPnl: -50 }),
    ]).summary;
    expect(s.profitFactor).toBeCloseTo(2, 2); // 300 / 150
    expect(buildCoachStats([t({ netPnl: 100 })]).summary.profitFactor).toBe(null);
  });

  it('prefers netPnl over pnl, and treats a missing figure as zero', () => {
    const s = buildCoachStats([
      t({ netPnl: undefined, pnl: 75 }), t({ netPnl: undefined, pnl: undefined }),
    ]).summary;
    expect(s.pnl).toBe(75);
    expect(s.wins).toBe(1);
  });
});

describe('buildCoachStats — scope and comparison', () => {
  it('a free user gets this month only, labelled as such', () => {
    const out = buildCoachStats([t(), t({ exitDate: iso(lastMonth()) })]);
    expect(out.scope).toBe('this-month');
    expect(out.summary.total).toBe(1);
    expect(out.compareToPrevMonth).toBeUndefined();
  });

  it('a premium user gets all-time plus a month-over-month comparison', () => {
    const out = buildCoachStats(
      [t({ netPnl: 100 }), t({ exitDate: iso(lastMonth()), netPnl: -20 })],
      { premium: true }
    );
    expect(out.scope).toBe('all-time');
    expect(out.summary.total).toBe(2);
    expect(out.compareToPrevMonth.thisMonth.total).toBe(1);
    expect(out.compareToPrevMonth.prevMonth.pnl).toBe(-20);
  });

  it('premium-only breakdowns stay out of the free payload', () => {
    const free = buildCoachStats([t()]);
    expect(free.bySession).toBeUndefined();
    expect(free.byStrategy).toBeUndefined();
    expect(buildCoachStats([t()], { premium: true }).bySession[0].key).toBe('London');
  });

  it('says WHY it is empty, so the UI can tell the two cases apart', () => {
    expect(buildCoachStats([])).toEqual({ empty: true });
    // Has history, but nothing this month, and the user is not premium.
    const out = buildCoachStats([t({ exitDate: iso(longAgo()) })]);
    expect(out).toEqual({ empty: true, reason: 'no-trades-this-month' });
  });
});

describe('buildCoachStats — groupings and highlighted trades', () => {
  it('ranks groups by trade count and reports each ones win rate', () => {
    const out = buildCoachStats([
      t({ pair: 'BTCUSDT', netPnl: 10 }), t({ pair: 'BTCUSDT', netPnl: -5 }),
      t({ pair: 'ETHUSDT', netPnl: 20 }),
    ]);
    expect(out.byPair[0].key).toBe('BTCUSDT');
    expect(out.byPair[0].trades).toBe(2);
    expect(out.byPair[0].winRate).toBe(50);
  });

  it('skips rows with no value for the grouping key instead of bucketing them as undefined', () => {
    const out = buildCoachStats([t({ strategy: null }), t({ strategy: 'breakout' })], { premium: true });
    expect(out.byStrategy).toHaveLength(1);
    expect(out.byStrategy[0].key).toBe('breakout');
  });

  it('best and worst are the extremes, worst ordered most painful first', () => {
    const out = buildCoachStats([
      t({ netPnl: 500 }), t({ netPnl: 5 }), t({ netPnl: -50 }), t({ netPnl: -500 }),
    ]);
    expect(out.bestTrades[0].pnl).toBe(500);
    expect(out.worstTrades[0].pnl).toBe(-500);
  });

  it('carries R as an UNSIGNED number from rrRatio', () => {
    // t.rr never existed, so the coach always received null and could not
    // reason about R at all; legacy imports also stored it signed.
    const out = buildCoachStats([t({ rrRatio: -3 })]);
    expect(out.bestTrades[0].rr).toBe(3);
    expect(buildCoachStats([t({ rrRatio: null })]).bestTrades[0].rr).toBe(null);
  });

  it('falls back to symbol when a trade has no pair', () => {
    const out = buildCoachStats([t({ pair: null, symbol: 'SOLUSDT' })]);
    expect(out.bestTrades[0].pair).toBe('SOLUSDT');
    expect(out.byPair[0].key).toBe('SOLUSDT');
  });
});
