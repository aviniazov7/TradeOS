import { describe, expect, it } from 'vitest';
import {
  formatWeekRange,
  isInTradeWeek,
  listTradeWeeks,
  startOfTradeWeek,
  summarizeWeek,
} from './weeklySummary';

const NOW = new Date(2026, 9, 20, 15, 0, 0); // Tuesday 20 Oct 2026 → week of Sun 18 Oct

const closed = (over) => ({
  id: over.id,
  status: 'closed',
  result: 'win',
  direction: 'long',
  pair: 'BTCUSDT',
  entryPrice: 100,
  stopLoss: 90,
  originalStopLoss: 90,
  positionSize: 100,
  quantity: 1,
  netPnl: 20,
  exitPrice: 120,
  exitDate: new Date(2026, 9, 19, 12),
  entryDate: new Date(2026, 9, 19, 9),
  ...over,
});

describe('trade weeks', () => {
  it('starts the week on Sunday', () => {
    const start = startOfTradeWeek(NOW);
    expect(start.getDay()).toBe(0);
    expect(start.getDate()).toBe(18);
    expect(formatWeekRange(start, NOW)).toBe('18–24 באוקטובר');
  });

  it('labels a week that crosses a month and a year', () => {
    const start = new Date(2025, 11, 28); // Sunday
    expect(formatWeekRange(start, NOW)).toBe('28 בדצמבר – 3 בינואר 2026');
  });

  it('puts a Saturday close in the week and a next Sunday close in the next one', () => {
    const week = startOfTradeWeek(NOW);
    expect(isInTradeWeek(closed({ exitDate: new Date(2026, 9, 24, 23, 30) }), week)).toBe(true);
    expect(isInTradeWeek(closed({ exitDate: new Date(2026, 9, 25, 0, 5) }), week)).toBe(false);
    expect(isInTradeWeek(closed({ exitDate: null, entryDate: null }), week)).toBe(false);
  });

  it('lists the current week and weeks that have trades, newest first', () => {
    const weeks = listTradeWeeks([
      closed({ exitDate: new Date(2026, 9, 10, 12) }),
      closed({ exitDate: null, entryDate: null }),
    ], NOW);
    expect(weeks.map((d) => d.getDate())).toEqual([18, 4]);
  });
});

describe('summarizeWeek', () => {
  const week = startOfTradeWeek(NOW);

  it('summarizes closed trades with net R, and ignores other weeks', () => {
    const summary = summarizeWeek([
      closed({ id: 'a', pair: 'BTCUSDT', setups: ['LPS'], netPnl: 20, result: 'win' }),
      closed({ id: 'b', pair: 'ETHUSDT', setups: ['LPS'], netPnl: -10, result: 'loss' }),
      closed({ id: 'old', exitDate: new Date(2026, 8, 1), netPnl: 500, result: 'win' }),
      { id: 'open', status: 'open', exitPrice: 0, pair: 'SOLUSDT', entryDate: new Date(2026, 9, 20, 10), setups: ['Spring'] },
      closed({ id: 'plain', setups: undefined, netPnl: 20, result: 'win', pair: 'XRPUSDT' }),
    ], week);

    expect(summary.closed).toBe(3);
    expect(summary.open).toBe(1);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(1);
    expect(summary.winRate).toBeCloseTo(66.666, 2);
    expect(summary.pnl).toBe(30);
    expect(summary.totalNetR).toBeCloseTo(3); // +2, -1, +2
    expect(summary.avgNetR).toBeCloseTo(1);
    expect(summary.best).toMatchObject({ id: 'a', pair: 'BTCUSDT', pnl: 20, netR: 2 });
    expect(summary.worst).toMatchObject({ id: 'b', pair: 'ETHUSDT', pnl: -10, netR: -1 });
    expect(summary.topSetup).toMatchObject({ name: 'LPS', count: 2, winRate: 50 });
    expect(summary.topSetup.avgNetR).toBeCloseTo(0.5);
    expect(summary.untagged).toBe(1);
    expect(summary.adherence).toBeNull();
  });

  it('is empty but valid for a week with no trades and for trades that have no tags', () => {
    const summary = summarizeWeek([
      closed({ exitDate: new Date(2026, 8, 2), setups: undefined }),
    ], week);
    expect(summary.closed).toBe(0);
    expect(summary.open).toBe(0);
    expect(summary.winRate).toBeNull();
    expect(summary.totalNetR).toBeNull();
    expect(summary.avgNetR).toBeNull();
    expect(summary.pnl).toBe(0);
    expect(summary.best).toBeNull();
    expect(summary.worst).toBeNull();
    expect(summary.topSetup).toBeNull();
    expect(summary.adherence).toBeNull();
  });

  it('adds rule-adherence notes only when a checklist score exists', () => {
    const summary = summarizeWeek([
      closed({
        pair: 'BTCUSDT',
        checklistAdherence: 50,
        checklist: [{ item: 'אישור Spring', done: false }, { item: 'סטופ הוגדר', done: true }],
        notes: 'יצאתי לפני היעד',
      }),
      closed({
        pair: 'ETHUSDT',
        checklistAdherence: 100,
        checklist: [{ item: 'סטופ הוגדר', done: true }],
        notes: '',
      }),
      closed({ pair: 'SOLUSDT', notes: 'הערה בלי תוכנית' }),
    ], week);
    expect(summary.adherence.samples).toBe(2);
    expect(summary.adherence.avg).toBe(75);
    expect(summary.adherence.followed).toBe(1);
    expect(summary.adherence.missed).toBe(1);
    expect(summary.adherence.notes).toEqual([
      {
        pair: 'BTCUSDT',
        adherence: 50,
        missed: ['אישור Spring'],
        note: 'יצאתי לפני היעד',
      },
    ]);
  });
});
