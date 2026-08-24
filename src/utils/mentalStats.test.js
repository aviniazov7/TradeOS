import { describe, it, expect } from 'vitest';
import { computeMentalStats } from './mentalStats';

// The cross-reference between the mentality journals and the trades closed on
// the same day. Everything the psychology coach says is phrased from these
// numbers, so a mis-keyed day does not produce an error — it produces
// confident, wrong advice.

const trade = (over = {}) => ({
  status: 'closed', result: 'win', netPnl: 100,
  exitDate: '2026-08-03T12:00:00', ...over,
});
const morning = (date, over = {}) => ({ date, emotion: 'calm', readinessLevel: 8, preMarketChecklist: [], ...over });

describe('computeMentalStats — pairing journals with trades', () => {
  it('counts only days that have BOTH a morning journal and closed trades', () => {
    const r = computeMentalStats(
      [trade({ exitDate: '2026-08-03T12:00:00' })],
      [morning('2026-08-03'), morning('2026-08-04')], // 04 has no trades
      []
    );
    expect(r.totalCrossDays).toBe(1);
  });

  it('ignores open trades entirely', () => {
    const r = computeMentalStats(
      [{ status: 'open', entryDate: '2026-08-03T09:00:00' }],
      [morning('2026-08-03')],
      []
    );
    expect(r.totalCrossDays).toBe(0);
  });

  it('falls back to entryDate for a closed trade with no exitDate', () => {
    // CSV imports write exitDate: null. Keying on exitDate alone sent every one
    // of them to 1970-01-01, where no journal could match, so they vanished.
    const r = computeMentalStats(
      [trade({ exitDate: null, entryDate: '2026-08-03T09:00:00' })],
      [morning('2026-08-03')],
      []
    );
    expect(r.totalCrossDays).toBe(1);
    expect(r.baseline.trades).toBe(1);
  });
});

describe('computeMentalStats — the baseline every bucket is measured against', () => {
  it('counts every trade on a journaled day, including days with no emotion recorded', () => {
    // Re-summing the emotion buckets instead would silently drop these.
    const r = computeMentalStats(
      [
        trade({ exitDate: '2026-08-03T12:00:00' }),
        trade({ exitDate: '2026-08-04T12:00:00', result: 'loss', netPnl: -50 }),
      ],
      [morning('2026-08-03'), morning('2026-08-04', { emotion: null })],
      []
    );
    expect(r.baseline.trades).toBe(2);
    expect(r.baseline.winRate).toBe(50);
    expect(r.baseline.totalPnl).toBe(50);
    expect(r.emotionStatsArray.reduce((s, e) => s + e.trades, 0)).toBe(1); // only the emotion day
  });
});

describe('computeMentalStats — emotion buckets', () => {
  it('groups by the morning emotion and reports only emotions actually used', () => {
    const r = computeMentalStats(
      [
        trade({ exitDate: '2026-08-03T12:00:00', result: 'win', netPnl: 100 }),
        trade({ exitDate: '2026-08-04T12:00:00', result: 'loss', netPnl: -200 }),
      ],
      [morning('2026-08-03', { emotion: 'calm' }), morning('2026-08-04', { emotion: 'tired' })],
      []
    );
    const byKey = Object.fromEntries(r.emotionStatsArray.map((e) => [e.key, e]));
    expect(Object.keys(byKey).sort()).toEqual(['calm', 'tired']);
    expect(byKey.calm.winRate).toBe(100);
    expect(byKey.tired.winRate).toBe(0);
    expect(byKey.tired.avgPnl).toBe(-200);
  });

  it('picks the best emotion by win rate, or null when nothing is journaled', () => {
    const r = computeMentalStats(
      [trade({ exitDate: '2026-08-03T12:00:00' }), trade({ exitDate: '2026-08-04T12:00:00', result: 'loss', netPnl: -1 })],
      [morning('2026-08-03', { emotion: 'calm' }), morning('2026-08-04', { emotion: 'tired' })],
      []
    );
    expect(r.bestEmotion.key).toBe('calm');
    expect(computeMentalStats([], [], []).bestEmotion).toBe(null);
  });
});

describe('computeMentalStats — readiness', () => {
  it('buckets readiness low 1-3, mid 4-6, high 7-10', () => {
    const r = computeMentalStats(
      [
        trade({ exitDate: '2026-08-01T12:00:00' }),
        trade({ exitDate: '2026-08-02T12:00:00' }),
        trade({ exitDate: '2026-08-03T12:00:00' }),
      ],
      [
        morning('2026-08-01', { readinessLevel: 2 }),
        morning('2026-08-02', { readinessLevel: 5 }),
        morning('2026-08-03', { readinessLevel: 9 }),
      ],
      []
    );
    const byKey = Object.fromEntries(r.readinessStats.map((g) => [g.key, g.trades]));
    expect(byKey).toEqual({ low: 1, mid: 1, high: 1 });
  });

  it('averages readiness separately on profitable and losing DAYS', () => {
    const r = computeMentalStats(
      [
        trade({ exitDate: '2026-08-01T12:00:00', netPnl: 100 }),
        trade({ exitDate: '2026-08-02T12:00:00', netPnl: -100, result: 'loss' }),
      ],
      [morning('2026-08-01', { readinessLevel: 9 }), morning('2026-08-02', { readinessLevel: 3 })],
      []
    );
    expect(r.avgReadinessProfit).toBe('9.0');
    expect(r.avgReadinessLoss).toBe('3.0');
  });

  it('a breakeven day counts as neither, and no data reads as "-"', () => {
    const r = computeMentalStats(
      [trade({ exitDate: '2026-08-01T12:00:00', netPnl: 0, result: 'breakeven' })],
      [morning('2026-08-01', { readinessLevel: 5 })],
      []
    );
    expect(r.avgReadinessProfit).toBe('-');
    expect(r.avgReadinessLoss).toBe('-');
  });
});

describe('computeMentalStats — checklist and plan adherence', () => {
  it('splits each checklist item into days with it and days without', () => {
    const r = computeMentalStats(
      [
        trade({ exitDate: '2026-08-01T12:00:00', netPnl: 100 }),
        trade({ exitDate: '2026-08-02T12:00:00', netPnl: -100, result: 'loss' }),
      ],
      [
        morning('2026-08-01', { preMarketChecklist: ['news'] }),
        morning('2026-08-02', { preMarketChecklist: [] }),
      ],
      []
    );
    const news = r.checklistStats.find((c) => c.key === 'news');
    expect(news.with.trades).toBe(1);
    expect(news.with.winRate).toBe(100);
    expect(news.without.trades).toBe(1);
    expect(news.without.winRate).toBe(0);
  });

  it('splits on the evening journal\'s followedPlan, ignoring days with no answer', () => {
    const r = computeMentalStats(
      [
        trade({ exitDate: '2026-08-01T12:00:00', netPnl: 100 }),
        trade({ exitDate: '2026-08-02T12:00:00', netPnl: -100, result: 'loss' }),
        trade({ exitDate: '2026-08-03T12:00:00', netPnl: 50 }),
      ],
      [morning('2026-08-01'), morning('2026-08-02'), morning('2026-08-03')],
      [
        { date: '2026-08-01', followedPlan: true },
        { date: '2026-08-02', followedPlan: false },
        { date: '2026-08-03' }, // never answered
      ]
    );
    expect(r.planStats.followed.trades).toBe(1);
    expect(r.planStats.notFollowed.trades).toBe(1);
    expect(r.planStats.followed.totalPnl).toBe(100);
    expect(r.planStats.notFollowed.totalPnl).toBe(-100);
  });
});

describe('computeMentalStats — empty input', () => {
  it('returns a usable zeroed shape rather than throwing', () => {
    for (const args of [[[], [], []], [null, null, null]]) {
      const r = computeMentalStats(...args);
      expect(r.totalCrossDays).toBe(0);
      expect(r.baseline.trades).toBe(0);
      expect(r.emotionStatsArray).toEqual([]);
      expect(r.bestEmotion).toBe(null);
    }
  });
});
