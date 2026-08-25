import { describe, it, expect } from 'vitest';
import {
  normalizeClosedPosition, tradingFees, positionDirection, positionQuantity,
} from './mexcPnl';

// The real trade, rebuilt from what the two screenshots actually support.
//
// An earlier version of this fixture divided MEXC's Amount(USDT) by the ENTRY
// price to get a quantity of 1253.7885 — which is 12,537.885 contracts, a size
// MEXC cannot return, and which misses MEXC's own displayed PNL Rate by half a
// percentage point. The size below is the one BOTH journal figures agree on
// (risk $67 and return -21.82%), and it is a whole contract count.
//
// It is used here to pin the mapping, NOT to settle net-versus-gross — see the
// note on normalizeClosedPosition for why the screenshot cannot decide that.
const REAL = {
  positionType: 1, symbol: 'ICP_USDT',
  openAvgPrice: '2.437', closeAvgPrice: '2.383',
  closeVol: '12887', leverage: '10',   // 12,887 contracts x 0.1 ICP = 1288.7
  realised: '-68.5272',
};
const SIZE = { contractSize: 0.1 };

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
  it('reproduces every figure the journal showed for it', () => {
    const n = normalizeClosedPosition(REAL, { ...SIZE, openOrder: { sl: 2.385 } });
    expect(n.direction).toBe('long');
    expect(n.entryPrice).toBe(2.437);
    expect(n.exitPrice).toBe(2.383);
    expect(n.quantity).toBeCloseTo(1288.7, 4);
    expect(n.netPnl).toBeCloseTo(-68.5272, 4);       // journal: -$68.53
    expect(n.riskAmount).toBeCloseTo(67.01, 2);      // journal: $67
    expect(n.rrRatio).toBe(1.04);                    // journal: -1.04R
    // And the app's own return formula lands on the journal's -21.82%.
    const pct = (n.grossPnl / (n.entryPrice * n.quantity)) * 100 * n.leverage;
    expect(pct).toBeCloseTo(-21.82, 2);
  });

  it('net is INVARIANT in the fee — this is what makes the convention safe', () => {
    // The journal derives net = gross - fees, and gross is net + fees, so
    // (net + f) - f = net for every f. Whichever convention MEXC follows, the
    // journal's Net P&L equals the figure MEXC displays. This is the property
    // the old double-subtraction broke.
    for (const fee of [undefined, '0', '0.8226', '5']) {
      const n = normalizeClosedPosition({ ...REAL, fee }, SIZE);
      expect(n.grossPnl - n.fees).toBeCloseTo(-68.5272, 4);
    }
  });

  it('reports R UNSIGNED — the app adds the sign from pnl at display time', () => {
    // A signed value renders as "--1.04R" and flips the CSV sign.
    const n = normalizeClosedPosition(REAL, { ...SIZE, openOrder: { sl: 2.385 } });
    expect(n.rrRatio).toBeGreaterThan(0);
  });
});

describe('normalizeClosedPosition — the take-profit path', () => {
  it('prefers the opening order\'s target over the position\'s', () => {
    const n = normalizeClosedPosition(
      { ...REAL, takeProfitPrice: '2.5' },
      { ...SIZE, openOrder: { tp: 2.6 } },
    );
    expect(n.takeProfit).toBe(2.6);
  });
  it('falls back to the position target, in either spelling', () => {
    expect(normalizeClosedPosition({ ...REAL, takeProfitPrice: '2.5' }, SIZE).takeProfit).toBe(2.5);
    expect(normalizeClosedPosition({ ...REAL, take_profit_price: '2.7' }, SIZE).takeProfit).toBe(2.7);
  });
  it('no target is 0, not undefined', () => {
    expect(normalizeClosedPosition(REAL, SIZE).takeProfit).toBe(0);
  });
});

describe('normalizeClosedPosition — risk is withheld when the size is unknown', () => {
  it('states no dollar risk rather than one wrong by the contract size', () => {
    // mexcContractSizes() returns {} when its fetch fails. Quantity then stays
    // in CONTRACTS, so a dollar figure derived from it is off by up to 10,000x
    // while looking entirely plausible.
    const unknown = normalizeClosedPosition(REAL, { openOrder: { sl: 2.385 } });
    expect(unknown.quantity).toBe(12887);   // contracts, as before
    expect(unknown.riskAmount).toBe(0);     // but no fabricated dollar figure
    expect(unknown.rrRatio).toBe(1.04);     // R is a ratio — size cancels out
  });
});

describe('normalizeClosedPosition — stop selection', () => {
  it('prefers the matched OPENING order over whatever sits on the position', () => {
    // The position object can hold a stop that was later moved to break-even;
    // the opening order holds the original — in the common case. The sync
    // route matches that order on TIME alone, so this is a preference, not a
    // guarantee (see the module note).
    const n = normalizeClosedPosition(
      { ...REAL, stopLossPrice: '2.436' },
      { ...SIZE, openOrder: { sl: 2.385 } },
    );
    expect(n.stopLoss).toBe(2.385);
  });

  it('falls back to the position stop, in either spelling', () => {
    expect(normalizeClosedPosition({ ...REAL, stopLossPrice: '2.4' }, SIZE).stopLoss).toBe(2.4);
    expect(normalizeClosedPosition({ ...REAL, stop_loss_price: '2.41' }, SIZE).stopLoss).toBe(2.41);
  });

  it('no stop means no risk and no R — not zero-distance nonsense', () => {
    const n = normalizeClosedPosition(REAL, SIZE);
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
  it('reads every realised spelling, first truthy wins', () => {
    // Dropping any of these silently zeroes the P&L for whichever API version
    // uses that name.
    expect(normalizeClosedPosition({ realised: '20' }, SIZE).netPnl).toBe(20);
    expect(normalizeClosedPosition({ realisedPnl: '21' }, SIZE).netPnl).toBe(21);
    expect(normalizeClosedPosition({ realise: '22' }, SIZE).netPnl).toBe(22);
    expect(normalizeClosedPosition({ realised_pnl: '23' }, SIZE).netPnl).toBe(23);
  });

  it('reads every volume spelling, including hold_vol', () => {
    for (const [k, v] of [['closeVol', 10], ['close_vol', 11], ['holdVol', 12], ['hold_vol', 13]]) {
      expect(positionQuantity({ [k]: String(v) }, 1)).toBe(v);
    }
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
