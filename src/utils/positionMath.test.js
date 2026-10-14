import { describe, it, expect } from 'vitest';
import { calculatePosition, stopSideProblem } from './positionMath';

const base = {
  direction: 'long',
  balance: '10000',
  riskType: 'percent',
  riskValue: '1',
  entryPrice: '100',
  stopLoss: '95',
  leverage: '10',
  targetPrice: '110',
};

describe('position calculator stop side', () => {
  it('sizes a long whose stop is below the entry', () => {
    const r = calculatePosition(base);
    expect(r.error).toBeNull();
    // $100 risk, 5 points, notional = 100 * 100 / 5 = 2000
    expect(r.positionSize).toBeCloseTo(2000, 6);
    expect(r.rrRatio).toBeCloseTo(2, 6);
    expect(r.potentialProfit).toBeGreaterThan(0);
  });

  it('rejects a long stop above the entry instead of a positive R', () => {
    const r = calculatePosition({ ...base, stopLoss: '110', targetPrice: '120' });
    expect(r.error).toBe(stopSideProblem('long', 100, 110));
    expect(r.rrRatio).toBeUndefined();
    expect(r.potentialProfit).toBeUndefined();
  });

  it('rejects a short stop below the entry', () => {
    const r = calculatePosition({ ...base, direction: 'short', stopLoss: '90', targetPrice: '80' });
    expect(r.error).toMatch(/שורט/);
    expect(r.positionSize).toBeUndefined();
  });

  it('sizes a short whose stop is above the entry', () => {
    const r = calculatePosition({ ...base, direction: 'short', stopLoss: '105', targetPrice: '90' });
    expect(r.error).toBeNull();
    expect(r.rrRatio).toBeCloseTo(2, 6);
    expect(r.potentialProfit).toBeGreaterThan(0);
  });

  it('does not treat a losing target as reward', () => {
    const r = calculatePosition({ ...base, targetPrice: '90' });
    expect(r.error).toBeNull();
    expect(r.rrRatio).toBeNull();
    expect(r.potentialProfit).toBeLessThan(0);
  });
});
