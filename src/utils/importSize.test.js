import { describe, it, expect } from 'vitest';
import { sizeAndQuantity } from './importSize';
import { computeTradeFields } from './calculations';

describe('sizeAndQuantity', () => {
  it('a quantity column is a unit count, not dollars', () => {
    // THE BUG: 0.5 BTC used to become a quantity of 0.5/60000.
    expect(sizeAndQuantity(0.5, 0, 60000)).toEqual({ quantity: 0.5, positionSize: 30000 });
  });

  it('a quantity column wins over a size column when both are mapped', () => {
    expect(sizeAndQuantity(0.5, 999, 60000).quantity).toBe(0.5);
  });

  it('with only a dollar size, units are still derived from the price', () => {
    expect(sizeAndQuantity(0, 30000, 60000)).toEqual({ quantity: 0.5, positionSize: 30000 });
  });

  it('never divides by a missing or zero price', () => {
    expect(sizeAndQuantity(0, 30000, 0)).toEqual({ quantity: 0, positionSize: 30000 });
    expect(sizeAndQuantity(0.5, 0, 0)).toEqual({ quantity: 0.5, positionSize: 0 });
  });

  it('junk in is zero out, not NaN', () => {
    expect(sizeAndQuantity(NaN, NaN, NaN)).toEqual({ quantity: 0, positionSize: 0 });
    expect(sizeAndQuantity(-1, -1, 60000)).toEqual({ quantity: 0, positionSize: 0 });
  });
});

describe('what the user actually saw', () => {
  it('a 0.5 BTC winner is $500, not $0.01', () => {
    const { quantity } = sizeAndQuantity(0.5, 0, 60000);
    const r = computeTradeFields({
      direction: 'long', entryPrice: 60000, exitPrice: 61000,
      quantity, leverage: 1, status: 'closed', fees: 0,
    });
    expect(r.pnl).toBeCloseTo(500);

    // The old behaviour, for the record.
    const old = computeTradeFields({
      direction: 'long', entryPrice: 60000, exitPrice: 61000,
      quantity: 0.5 / 60000, leverage: 1, status: 'closed', fees: 0,
    });
    expect(old.pnl).toBeCloseTo(0.00833, 4);
  });
});
