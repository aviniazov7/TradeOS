import { describe, it, expect } from 'vitest';
import {
  normalizeClosedPosition, tradingFees, positionDirection, positionQuantity,
} from './mexcPnl';

// The real trade the fee question was settled on: ICPUSDT long, 3,055.4826 USDT
// notional at 2.437, closed at 2.383, MEXC reported realised -68.5272.
// Price-only P&L is -67.7046, so -0.8226 of costs are baked into `realised`.
const REAL = {
  positionType: 1, symbol: 'ICP_USDT',
  openAvgPrice: '2.437', closeAvgPrice: '2.383',
  closeVol: '1253.7885', leverage: '10',
  realised: '-68.5272',
};

describe('positionDirection', () => {
  it('reads positionType 1 as long and anything else as short', () => {
    expect(positionDirection({ positionType: 1 })).toBe('long');
    expect(positionDirection({ positionType: 2 })).toBe('short');
    expect(positionDirection({ position_type: 1 })).toBe('long');
    expect(positionDirection({})).toBe('short');
  });
});

describe('positionQuantity — contracts are not coins', () => {
  it('multiplies volume by the symbol contract size', () => {
    // Reading raw volume inflates quantity, position size and every P&L
    // derived from them by 100x-10,000x.
    expect(positionQuantity({ closeVol: '500' }, 0.0001)).toBeCloseTo(0.05);
    expect(positionQuantity({ holdVol: '500' }, 0.0001)).toBeCloseTo(0.05);
  });
  it('defaults to a contract size of 1 rather than zeroing the position', () => {
    expect(positionQuantity({ closeVol: '10' })).toBe(10);
    expect(positionQuantity({ closeVol: '10' }, 0)).toBe(10);
  });
  it('a record with no volume is zero, not NaN', () => {
    expect(positionQuantity({}, 0.001)).toBe(0);
  });
});

describe('tradingFees', () => {
  it('is 0 for the shape this endpoint actually returns', () => {
    // None of the fee field names appear on a closed-position record, which is
    // why the net figure was already right and why the trade showed "fees $0".
    expect(tradingFees(REAL)).toBe(0);
    expect(tradingFees({})).toBe(0);
    expect(tradingFees(null)).toBe(0);
  });
  it('picks up any of the naming variants, as a magnitude', () => {
    expect(tradingFees({ fee: '0.8226' })).toBeCloseTo(0.8226);
    expect(tradingFees({ closeFee: '-1.5' })).toBeCloseTo(1.5);
    expect(tradingFees({ totalFee: '2' })).toBe(2);
  });

  it('keeps the original || fallthrough, which a numeric zero triggers', () => {
    // `||` and `??` differ here, and this is a refactor: the behaviour the
    // inline code had wins. A numeric zero falls through to the next spelling;
    // the STRING "0" is truthy and stops the chain.
    expect(tradingFees({ fee: 0, fees: '2' })).toBe(2);
    expect(tradingFees({ fee: '0', fees: '2' })).toBe(0);
  });
});

describe('normalizeClosedPosition — the real trade', () => {
  it('reproduces exactly what MEXC displayed', () => {
    const n = normalizeClosedPosition(REAL);
    expect(n.direction).toBe('long');
    expect(n.entryPrice).toBe(2.437);
    expect(n.exitPrice).toBe(2.383);
    expect(n.netPnl).toBeCloseTo(-68.5272, 4);
  });

  it('net stays right whether or not a fee field ever appears', () => {
    // The journal derives net = gross - fees. With no fee field the gross IS
    // the net; with one, the fee is added back first. Both must land on the
    // figure MEXC shows, or the old double-subtraction returns.
    const without = normalizeClosedPosition(REAL);
    const withFee = normalizeClosedPosition({ ...REAL, fee: '0.8226' });
    expect(without.grossPnl - without.fees).toBeCloseTo(-68.5272, 4);
    expect(withFee.grossPnl - withFee.fees).toBeCloseTo(-68.5272, 4);
    // And the gross really is the price-only move once the fee is known.
    expect(withFee.grossPnl).toBeCloseTo(-67.7046, 3);
  });

  it('derives risk and R from the stop, which MEXC imports never carried', () => {
    const n = normalizeClosedPosition(REAL, { openOrder: { sl: 2.385 } });
    expect(n.stopLoss).toBe(2.385);
    expect(n.riskAmount).toBeCloseTo(65.2, 1);   // 0.052 x 1253.7885
    expect(n.rrRatio).toBe(1.04);                 // |2.383-2.437| / 0.052
  });

  it('reports R UNSIGNED — the app adds the sign from pnl at display time', () => {
    // A signed value renders as "--1.04R" and flips the CSV sign.
    const n = normalizeClosedPosition(REAL, { openOrder: { sl: 2.385 } });
    expect(n.rrRatio).toBeGreaterThan(0);
  });
});

describe('normalizeClosedPosition — stop selection', () => {
  it('prefers the matched OPENING order over whatever sits on the position', () => {
    // The position object can hold a stop that was later moved to break-even;
    // the opening order holds the original.
    const n = normalizeClosedPosition(
      { ...REAL, stopLossPrice: '2.436' },
      { openOrder: { sl: 2.385 } },
    );
    expect(n.stopLoss).toBe(2.385);
  });

  it('falls back to the position stop when no opening order matched', () => {
    expect(normalizeClosedPosition({ ...REAL, stopLossPrice: '2.4' }).stopLoss).toBe(2.4);
  });

  it('no stop means no risk and no R — not zero-distance nonsense', () => {
    const n = normalizeClosedPosition(REAL);
    expect(n.stopLoss).toBe(0);
    expect(n.riskAmount).toBe(0);
    expect(n.rrRatio).toBe(0);
  });
});

describe('normalizeClosedPosition — malformed input', () => {
  it('survives an empty record without producing NaN', () => {
    const n = normalizeClosedPosition({});
    expect(n.netPnl).toBe(0);
    expect(n.grossPnl).toBe(0);
    expect(n.quantity).toBe(0);
    expect(n.riskAmount).toBe(0);
    expect(Number.isNaN(n.entryPrice)).toBe(false);
  });
  it('defaults leverage to 1 rather than 0', () => {
    expect(normalizeClosedPosition({}).leverage).toBe(1);
  });
  it('reads the snake_case spellings too', () => {
    const n = normalizeClosedPosition({
      position_type: 1, open_avg_price: '100', close_avg_price: '110',
      close_vol: '2', realised_pnl: '20',
    });
    expect(n.entryPrice).toBe(100);
    expect(n.exitPrice).toBe(110);
    expect(n.quantity).toBe(2);
    expect(n.netPnl).toBe(20);
  });
});
