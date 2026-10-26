import { describe, it, expect } from 'vitest';
import { computeExcursion, canComputeExcursion, candleStepMs, excursionFields, rebaseCandlesToFill, tradeExitPrice } from './excursion';

const H = 3600 * 1000;
const T0 = Date.UTC(2026, 9, 1, 10, 0, 0);
// 1h candles opening T0 .. T0+4h
const candles = [
  { t: T0 - H, o: 95, h: 99, l: 50, c: 98 }, // BEFORE the trade — must be ignored (low 50)
  { t: T0, o: 100, h: 104, l: 98, c: 103 },
  { t: T0 + H, o: 103, h: 112, l: 101, c: 110 },
  { t: T0 + 2 * H, o: 110, h: 111, l: 96, c: 97 },
  { t: T0 + 3 * H, o: 97, h: 108, l: 96.5, c: 107 },
  { t: T0 + 4 * H, o: 107, h: 200, l: 20, c: 150 }, // AFTER the exit — ignored
];

const long = {
  direction: 'long', entryPrice: 100, exitPrice: 108, stopLoss: 95, originalStopLoss: 95,
  quantity: 2, positionSize: 200, entryDate: new Date(T0), exitDate: new Date(T0 + 4 * H), assetClass: 'crypto',
};

describe('computeExcursion — long', () => {
  const ex = computeExcursion(long, candles);

  it('uses only candles inside the trade', () => {
    expect(ex.candles).toBe(4);
    expect(ex.stepMs).toBe(H);
  });

  it('MAE / MFE in price, $ and R (vs the ORIGINAL stop)', () => {
    expect(ex.maePrice).toBe(4); // low 96
    expect(ex.mfePrice).toBe(12); // high 112
    expect(ex.maeUsd).toBe(8); // × 2 coins
    expect(ex.mfeUsd).toBe(24);
    expect(ex.maeR).toBe(0.8); // 4 / |100−95|
    expect(ex.mfeR).toBe(2.4);
    expect(ex.stopTouched).toBe(false);
  });

  it('exit efficiency = captured / MFE', () => {
    expect(ex.capturedPrice).toBe(8);
    expect(ex.capturedUsd).toBe(16);
    expect(ex.efficiency).toBeCloseTo(8 / 12, 3);
  });

  it('a moved stop does not rewrite the risk', () => {
    const moved = computeExcursion({ ...long, stopLoss: 100, originalStopLoss: 95 }, candles);
    expect(moved.maeR).toBe(0.8);
    // legacy trade without originalStopLoss and a stop moved to breakeven → no R
    const noR = computeExcursion({ ...long, stopLoss: 100, originalStopLoss: undefined }, candles);
    expect(noR.maeR).toBeNull();
    expect(noR.mfeR).toBeNull();
    expect(noR.maeUsd).toBe(8);
  });

  it('flags a stop that price actually reached', () => {
    const wick = computeExcursion(long, [{ t: T0, o: 100, h: 101, l: 94, c: 100 }, { t: T0 + 3 * H, o: 100, h: 110, l: 99, c: 108 }], { stepMs: H });
    expect(wick.stopTouched).toBe(true);
    expect(wick.maeR).toBe(1.2);
  });
});

describe('computeExcursion — short & edge cases', () => {
  const short = { ...long, direction: 'short', entryPrice: 100, exitPrice: 97, stopLoss: 106, originalStopLoss: 106 };

  it('mirrors for shorts', () => {
    const ex = computeExcursion(short, candles);
    expect(ex.maePrice).toBe(12); // high 112 (against a short)
    expect(ex.mfePrice).toBe(4); // low 96
    expect(ex.maeR).toBe(2);
    expect(ex.stopTouched).toBe(true);
    expect(ex.capturedPrice).toBe(3);
    expect(ex.efficiency).toBe(0.75);
  });

  it('a loser has negative efficiency; a trade that never went green has none', () => {
    const loser = computeExcursion({ ...long, exitPrice: 97 }, candles);
    expect(loser.capturedPrice).toBe(-3);
    expect(loser.efficiency).toBeLessThan(0);
    const never = computeExcursion({ ...long, exitPrice: 99 }, [{ t: T0, o: 100, h: 100, l: 98, c: 99 }, { t: T0 + 3 * H, o: 99, h: 99.5, l: 98.5, c: 99 }], { stepMs: H });
    expect(never.mfePrice).toBe(0);
    expect(never.efficiency).toBeNull();
  });

  it('never reports less than the fills themselves (feed disagrees)', () => {
    const ex = computeExcursion({ ...long, exitPrice: 120 }, candles);
    expect(ex.mfePrice).toBe(20);
    expect(ex.efficiency).toBe(1);
  });

  it('uses the weighted exit of a multi-TP trade', () => {
    const t = { ...long, exitPrice: 0, exits: [{ price: 104, percent: 50 }, { price: 112, percent: 50 }] };
    expect(tradeExitPrice(t)).toBe(108);
    expect(computeExcursion(t, candles).capturedPrice).toBe(8);
  });

  it('futures: $ = points × point value × contracts', () => {
    const fut = {
      direction: 'long', entryPrice: 5000, exitPrice: 5010, stopLoss: 4990, originalStopLoss: 4990, assetClass: 'futures_cme',
      contract: { pointValue: 50, contracts: 2 }, quantity: 2, positionSize: 5000 * 50 * 2,
      entryDate: new Date(T0), exitDate: new Date(T0 + 2 * H),
    };
    const ex = computeExcursion(fut, [{ t: T0, o: 5000, h: 5015, l: 4994, c: 5008 }, { t: T0 + H, o: 5008, h: 5012, l: 5005, c: 5010 }]);
    expect(ex.maeUsd).toBe(6 * 100);
    expect(ex.mfeUsd).toBe(15 * 100);
    expect(ex.maeR).toBe(0.6);
  });

  it('CFD gold: $ = points × oz per lot × lots', () => {
    const gold = {
      direction: 'short', entryPrice: 4020, exitPrice: 3991.8, stopLoss: 4030, originalStopLoss: 4030,
      assetClass: 'futures_cme',
      contract: { symbol: 'XAUUSD', pointValue: 100, contracts: 0.1 },
      quantity: 0.1, positionSize: 4020 * 100 * 0.1,
      entryDate: new Date(T0), exitDate: new Date(T0 + 2 * H),
    };
    const ex = computeExcursion(gold, [
      { t: T0, o: 4020, h: 4030, l: 4000, c: 4010 },
      { t: T0 + H, o: 4010, h: 4015, l: 3980, c: 3991.8 },
    ]);
    expect(ex.maeUsd).toBe(100);
    expect(ex.mfeUsd).toBe(400);
  });

  it('returns null when it cannot compute', () => {
    expect(computeExcursion(long, [])).toBeNull();
    expect(computeExcursion({ ...long, exitPrice: 0 }, candles)).toBeNull();
    expect(computeExcursion({ ...long, exitDate: null }, candles)).toBeNull();
    expect(computeExcursion(long, [{ t: T0 + 10 * H, o: 1, h: 2, l: 1, c: 1 }], { stepMs: H })).toBeNull();
    expect(canComputeExcursion({ ...long, exitDate: new Date(T0 - H) })).toBe(false);
  });

  it('accepts Firestore-like timestamps and flags coarse candles', () => {
    const ts = (ms) => ({ toDate: () => new Date(ms) });
    const t = { ...long, entryDate: ts(T0), exitDate: ts(T0 + 30 * 60 * 1000) };
    const ex = computeExcursion(t, [{ t: T0, o: 100, h: 104, l: 98, c: 103 }, { t: T0 + H, o: 1, h: 1, l: 1, c: 1 }]);
    expect(ex.candles).toBe(1);
    expect(ex.coarse).toBe(true);
  });
});

describe('helpers', () => {
  it('rebaseCandlesToFill removes a constant futures basis', () => {
    const shifted = rebaseCandlesToFill(
      [{ t: T0, o: 4028, h: 4036, l: 4024, c: 4027 }],
      4019.2, T0, H,
    );
    expect(shifted[0].c).toBeCloseTo(4019.2, 6);
    expect(shifted[0].h - shifted[0].l).toBeCloseTo(12, 6);
  });

  it('candleStepMs uses the smallest gap', () => {
    expect(candleStepMs([{ t: 0 }, { t: 60 }, { t: 120 }, { t: 5000 }])).toBe(60);
    expect(candleStepMs([{ t: 0 }])).toBe(0);
  });
  it('excursionFields', () => {
    const ex = computeExcursion(long, candles);
    expect(excursionFields(ex, 123)).toEqual({ mae: 8, mfe: 24, maeR: 0.8, mfeR: 2.4, excursionAt: 123 });
    expect(excursionFields(null)).toBeNull();
  });
});
