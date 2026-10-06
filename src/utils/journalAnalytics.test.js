import { describe, it, expect } from 'vitest';
import { filterTradesByPeriod, computeJournalAnalytics } from './journalAnalytics';

const trade = (over) => ({
  pair: 'BTCUSDT', direction: 'long', status: 'closed', exitPrice: 110, entryPrice: 100,
  result: 'win', netPnl: 10, entryDate: '2026-09-01T10:00:00Z', exitDate: '2026-09-01T12:00:00Z',
  ...over,
});

describe('filterTradesByPeriod', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const trades = [
    trade({ id: 'recent', exitDate: '2026-10-03T10:00:00Z' }),
    trade({ id: 'old', exitDate: '2026-01-01T10:00:00Z' }),
    trade({ id: 'nodate', exitDate: null, entryDate: null }),
  ];

  it('returns the same array for "all"', () => {
    expect(filterTradesByPeriod(trades, 'all', now)).toBe(trades);
  });

  it('keeps only trades inside the window and drops undated ones', () => {
    expect(filterTradesByPeriod(trades, 'week', now).map((t) => t.id)).toEqual(['recent']);
    expect(filterTradesByPeriod(trades, 'year', now).map((t) => t.id)).toEqual(['recent', 'old']);
  });

  it('falls back to entryDate when there is no exitDate', () => {
    const open = trade({ id: 'open', exitDate: null, entryDate: '2026-10-04T10:00:00Z' });
    expect(filterTradesByPeriod([open], 'week', now)).toHaveLength(1);
  });
});

describe('computeJournalAnalytics', () => {
  it('returns null when there are no closed trades', () => {
    expect(computeJournalAnalytics([])).toBeNull();
    expect(computeJournalAnalytics([trade({ status: 'open', exitPrice: 0 })])).toBeNull();
  });

  it('computes averages, extremes, streaks and long/short split', () => {
    const a = computeJournalAnalytics([
      trade({ netPnl: 30, exitDate: '2026-09-01T00:00:00Z' }),
      trade({ netPnl: 10, exitDate: '2026-09-02T00:00:00Z' }),
      trade({ result: 'loss', netPnl: -20, direction: 'short', exitDate: '2026-09-03T00:00:00Z' }),
      trade({ result: 'breakeven', netPnl: 0, exitDate: '2026-09-04T00:00:00Z' }),
    ]);
    expect(a.avgWin).toBe(20);
    expect(a.avgLoss).toBe(20);
    expect(a.largestWin).toBe(30);
    expect(a.largestLoss).toBe(-20);
    expect(a.maxWin).toBe(2);
    expect(a.maxLoss).toBe(1);
    expect(a.longCount).toBe(3);
    expect(a.shortCount).toBe(1);
    expect(a.longPnl).toBe(40);
    expect(a.shortWinRate).toBe(0);
    expect(a.pieData).toEqual([
      { name: 'רווח', value: 2 },
      { name: 'הפסד', value: 1 },
      { name: 'אפס', value: 1 },
    ]);
  });

  it('counts broker imports that are closed without an exit price', () => {
    const a = computeJournalAnalytics([trade({ exitPrice: undefined, pnlFromExchange: 5, netPnl: 5 })]);
    expect(a).not.toBeNull();
    expect(a.avgWin).toBe(5);
  });

  it('groups by pair, tag, timeframe and strategy', () => {
    const a = computeJournalAnalytics([
      trade({ pair: 'ETHUSDT', netPnl: 50, tags: ['breakout'], timeframe: '4H', strategy: 'SOW' }),
      trade({ pair: 'BTCUSDT', result: 'loss', netPnl: -10, tags: ['breakout', 'fomo'], strategy: 'SOW' }),
    ]);
    expect(a.byPair.map((p) => p.pair)).toEqual(['ETHUSDT', 'BTCUSDT']);
    expect(a.byTag.find((t) => t.tag === 'breakout')).toMatchObject({ count: 2, wins: 1, pnl: 40, winRate: 50 });
    expect(a.byTimeframe.map((t) => t.timeframe).sort()).toEqual(['4H', 'N/A']);
    expect(a.byStrategy).toEqual([{ name: 'SOW', wins: 1, losses: 1, pnl: 40, count: 2, winRate: 50 }]);
  });
});
