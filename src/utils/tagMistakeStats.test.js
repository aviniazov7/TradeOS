import { describe, expect, it } from 'vitest';
import { computeMistakeStats, computeTagStats, mistakeLabel, tagLabel } from './tagMistakeStats';

const closed = (over) => ({
  status: 'closed',
  result: 'win',
  direction: 'long',
  entryPrice: 100,
  exitPrice: 120,
  netPnl: 40,
  ...over,
});

describe('computeTagStats', () => {
  it('returns an empty list when there is no data', () => {
    expect(computeTagStats([])).toEqual([]);
    expect(computeTagStats(null)).toEqual([]);
    expect(computeTagStats([closed({ tags: [] }), closed({ tags: null })])).toEqual([]);
  });

  it('counts a repeated tag on one trade once', () => {
    const [row] = computeTagStats([
      closed({ tags: ['fomo', 'fomo', ' fomo '], netPnl: 40 }),
    ]);
    expect(row).toMatchObject({ id: 'fomo', label: 'FOMO', count: 1, wins: 1, pnl: 40, winRate: 100 });
  });

  it('keeps a deleted or unknown tag as its raw id', () => {
    expect(tagLabel('retired_tag')).toBe('retired_tag');
    const [row] = computeTagStats([closed({ tags: ['retired_tag'], netPnl: -15, result: 'loss' })]);
    expect(row).toMatchObject({ id: 'retired_tag', label: 'retired_tag', count: 1, losses: 1, pnl: -15, winRate: 0 });
  });

  it('leaves open trades out', () => {
    expect(computeTagStats([
      closed({ status: 'open', exitPrice: 0, tags: ['scalp'], netPnl: 80 }),
      closed({ status: 'partial', tags: ['scalp'], netPnl: 80 }),
      { pair: 'BTCUSDT', tags: ['scalp'], netPnl: 80 },
    ])).toEqual([]);
  });

  it('counts one trade in each of its tags and does not split the profit', () => {
    const stats = computeTagStats([
      closed({ tags: ['breakout', 'planned'], netPnl: 40, result: 'win' }),
      closed({ tags: ['breakout'], netPnl: -10, result: 'loss' }),
    ]);
    expect(stats.find((row) => row.id === 'breakout')).toMatchObject({
      label: 'פריצה', count: 2, wins: 1, losses: 1, pnl: 30, winRate: 50,
    });
    expect(stats.find((row) => row.id === 'planned')).toMatchObject({
      label: 'מתוכננת', count: 1, wins: 1, pnl: 40, winRate: 100,
    });
  });
});

describe('computeMistakeStats', () => {
  it('returns an empty list when there is no data', () => {
    expect(computeMistakeStats([])).toEqual([]);
    expect(computeMistakeStats(undefined)).toEqual([]);
  });

  it('ignores a non-array mistakes field', () => {
    expect(computeMistakeStats([
      closed({ mistakes: 'fomo_entry', netPnl: -20, result: 'loss' }),
      closed({ mistakes: { key: 'moved_sl' }, netPnl: -20, result: 'loss' }),
      closed({ mistakes: null }),
    ])).toEqual([]);
  });

  it('leaves open trades out and labels an unknown id as itself', () => {
    expect(mistakeLabel('gone_mistake')).toBe('gone_mistake');
    const stats = computeMistakeStats([
      closed({ status: 'open', exitPrice: 0, mistakes: ['early_exit'], netPnl: -50, result: 'loss' }),
      closed({ mistakes: ['gone_mistake'], netPnl: -8, result: 'loss' }),
    ]);
    expect(stats).toEqual([
      { id: 'gone_mistake', label: 'gone_mistake', count: 1, wins: 0, losses: 1, winRate: 0, pnl: -8 },
    ]);
  });

  it('counts one trade in each mistake with the full profit', () => {
    const stats = computeMistakeStats([
      closed({ mistakes: ['early_exit', 'early_exit', 'moved_sl'], netPnl: -12, result: 'loss' }),
      closed({ mistakes: ['early_exit'], netPnl: 5, result: 'win' }),
    ]);
    expect(stats.find((row) => row.id === 'early_exit')).toMatchObject({
      label: 'יציאה מוקדמת', count: 2, wins: 1, losses: 1, pnl: -7, winRate: 50,
    });
    expect(stats.find((row) => row.id === 'moved_sl')).toMatchObject({
      label: 'הזזת סטופ לוס', count: 1, pnl: -12,
    });
  });
});
