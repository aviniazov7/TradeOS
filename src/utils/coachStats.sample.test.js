import { describe, it, expect } from 'vitest';
import { buildCoachStats } from './coachStats';

describe('buildCoachStats sample', () => {
  const closed = (direction, pnl) => ({
    status: 'closed', direction, pair: 'BTCUSDT', pnl, exitDate: new Date(),
  });

  it('flags fewer than 5 trades and sends Hebrew directions to the model', () => {
    const stats = buildCoachStats([closed('short', -10)], { premium: true });
    expect(stats.sampleTooSmall).toBe(true);
    expect(stats.summary.total).toBe(1);
    expect(stats.byDirection[0].key).toBe('short');
    expect(stats.worstTrades[0].direction).toBe('שורט');
  });

  it('allows conclusions once 5 trades are closed', () => {
    const trades = Array.from({ length: 5 }, () => closed('long', 5));
    const stats = buildCoachStats(trades, { premium: true });
    expect(stats.sampleTooSmall).toBe(false);
    expect(stats.bestTrades[0].direction).toBe('לונג');
  });
});