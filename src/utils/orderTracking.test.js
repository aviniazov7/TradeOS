import { describe, it, expect } from 'vitest';
import {
  isLimitTriggered,
  isMarketActive,
  isStopHit,
  reachedTakeProfits,
  livePnl,
  buildCloseUpdate,
} from './orderTracking';

// This is the logic that permanently writes a trade's final netPnl from a live
// price. It ran untested inside a dashboard component until it was extracted.

const long = (over = {}) => ({
  direction: 'long', entryPrice: 100, stopLoss: 95, positionSize: 1000,
  orderType: 'market', status: 'open', tps: [], exits: [], ...over,
});
const short = (over = {}) => long({ direction: 'short', stopLoss: 105, ...over });

describe('isLimitTriggered', () => {
  it('a long limit fills when price trades DOWN to entry', () => {
    const t = long({ orderType: 'limit' });
    expect(isLimitTriggered(t, 101)).toBe(false);
    expect(isLimitTriggered(t, 100)).toBe(true);
    expect(isLimitTriggered(t, 99)).toBe(true);
  });
  it('a short limit fills when price trades UP to entry', () => {
    const t = short({ orderType: 'limit' });
    expect(isLimitTriggered(t, 99)).toBe(false);
    expect(isLimitTriggered(t, 100)).toBe(true);
    expect(isLimitTriggered(t, 101)).toBe(true);
  });
  it('stays triggered once flagged, and a market order is never pending', () => {
    expect(isLimitTriggered(long({ orderType: 'limit', limitTriggered: true }), 999)).toBe(true);
    expect(isLimitTriggered(long(), 999)).toBe(false);
  });
  it('no price and no entry are not a fill', () => {
    expect(isLimitTriggered(long({ orderType: 'limit' }), null)).toBe(false);
    expect(isLimitTriggered(long({ orderType: 'limit', entryPrice: 0 }), 50)).toBe(false);
  });
});

describe('isStopHit', () => {
  it('fires when price trades through the stop, either direction', () => {
    expect(isStopHit(long(), 95)).toBe(true);
    expect(isStopHit(long(), 95.01)).toBe(false);
    expect(isStopHit(short(), 105)).toBe(true);
    expect(isStopHit(short(), 104.99)).toBe(false);
  });
  it('an UNFILLED limit order has no exposure, so its stop cannot fire', () => {
    // Price is far below both entry and stop, but the order never filled.
    const pending = long({ orderType: 'limit', entryPrice: 100, stopLoss: 95 });
    expect(isMarketActive(pending, 200)).toBe(false);
    expect(isStopHit(pending, 200)).toBe(false);
    // Once price reaches entry the order fills and the stop is live again.
    expect(isStopHit(pending, 90)).toBe(true);
  });
  it('never fires on a closed trade, a missing stop, or no price', () => {
    expect(isStopHit(long({ status: 'closed' }), 1)).toBe(false);
    expect(isStopHit(long({ stopLoss: 0 }), 1)).toBe(false);
    expect(isStopHit(long(), null)).toBe(false);
  });
});

describe('reachedTakeProfits', () => {
  it('reports only newly reached levels', () => {
    const t = long({ tps: [110, 120] });
    expect(reachedTakeProfits(t, 105)).toEqual([]);
    expect(reachedTakeProfits(t, 110)).toEqual([{ index: 0, isLast: false }]);
    expect(reachedTakeProfits(t, 125)).toEqual([
      { index: 0, isLast: false }, { index: 1, isLast: true },
    ]);
  });
  it('skips levels already recorded in tpReached', () => {
    const t = long({ tps: [110, 120] });
    expect(reachedTakeProfits(t, 125, [0])).toEqual([{ index: 1, isLast: true }]);
    expect(reachedTakeProfits(t, 125, [0, 1])).toEqual([]);
  });
  it('numbers planned targets AFTER already-executed exits', () => {
    // TP1 was taken as a partial, so the remaining target is index 1, not 0 —
    // getting this wrong would re-fire on a target already banked.
    const t = long({ exits: [{ price: 110, percent: 50 }], tps: [120] });
    expect(reachedTakeProfits(t, 125)).toEqual([{ index: 1, isLast: true }]);
  });
  it('mirrors for shorts', () => {
    const t = short({ tps: [90, 80] });
    expect(reachedTakeProfits(t, 95)).toEqual([]);
    expect(reachedTakeProfits(t, 80)).toEqual([
      { index: 0, isLast: false }, { index: 1, isLast: true },
    ]);
  });
  it('an unfilled limit reaches nothing', () => {
    expect(reachedTakeProfits(long({ orderType: 'limit', tps: [110] }), 130)).toEqual([]);
  });
});

describe('livePnl', () => {
  it('computes from the stored notional, both directions', () => {
    expect(livePnl(long(), 110)).toBeCloseTo(100);   // 10 units @ +10
    expect(livePnl(short(), 90)).toBeCloseTo(100);
    expect(livePnl(long(), 90)).toBeCloseTo(-100);
  });
  it('returns null rather than a wrong number when inputs are missing', () => {
    expect(livePnl(long(), null)).toBe(null);
    expect(livePnl(long({ positionSize: 0 }), 110)).toBe(null);
  });
});

describe('buildCloseUpdate', () => {
  it('a clean full close records exitPrice and no exits array', () => {
    const u = buildCloseUpdate(long({ quantity: 10 }), 110, 'TS');
    expect(u.status).toBe('closed');
    expect(u.exitPrice).toBe(110);
    expect(u.exitDate).toBe('TS');
    expect(u.pnl).toBeCloseTo(100);
    expect(u.result).toBe('win');
    expect(u.exits).toBeUndefined();
  });

  it('completes partial exits with the remaining size at the close price', () => {
    const t = long({ quantity: 10, exits: [{ price: 120, percent: 50 }] });
    const u = buildCloseUpdate(t, 95, 'TS');
    expect(u.exits).toEqual([
      { price: 120, percent: 50 },
      { price: 95, percent: 50 },
    ]);
    // 5 units @ +20 = 100, 5 units @ -5 = -25
    expect(u.pnl).toBeCloseTo(75);
  });

  it('a stop that still lands in net profit after earlier TPs is a WIN, not a loss', () => {
    // The whole reason partial exits are completed rather than discarded.
    const t = long({ quantity: 10, exits: [{ price: 130, percent: 80 }] });
    const u = buildCloseUpdate(t, 95, 'TS');
    expect(u.pnl).toBeGreaterThan(0);
    expect(u.result).toBe('win');
  });

  it('subtracts fees, so a thin gross win can still close as a loss', () => {
    const u = buildCloseUpdate(long({ quantity: 10, fees: 50 }), 101, 'TS');
    expect(u.pnl).toBeCloseTo(10);
    expect(u.netPnl).toBeCloseTo(-40);
    expect(u.result).toBe('loss');
  });

  it('derives quantity from the notional when the trade has none', () => {
    const u = buildCloseUpdate(long({ quantity: undefined, positionSize: 1000 }), 110, 'TS');
    expect(u.pnl).toBeCloseTo(100); // 1000/100 = 10 units
  });

  it('omits exitDate entirely when none is supplied', () => {
    expect('exitDate' in buildCloseUpdate(long({ quantity: 1 }), 110)).toBe(false);
  });
});
