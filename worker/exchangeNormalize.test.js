import { describe, it, expect } from 'vitest';
import {
  withRisk, mexcTradeFee, mexcStopsByPosition, normalizeMexcClosed, normalizeOkxClosed, normalizeOkxOpen, normalizeBitgetClosed,
} from './exchangeNormalize';

// Sample rows are the exchanges' own documented example responses (as quoted
// in ccxt's sources), so these tests pin our field names to the real API.

// Every closed trade must carry the same fields the Bybit sync returns (minus
// orderType, which only Bybit's order history exposes, and session, which the
// caller adds).
const CLOSED_FIELDS = [
  'pair', 'direction', 'entryPrice', 'exitPrice', 'quantity', 'leverage',
  'pnlFromExchange', 'fees', 'entryDate', 'exitDate', 'stopLoss', 'riskAmount',
  'rrRatio', 'tps', 'source', 'externalId',
];
const net = (t) => +(t.pnlFromExchange - t.fees).toFixed(8);

const MEXC_SAMPLE = {
  positionId: '390281084', symbol: 'RVN_USDT', positionType: '1', openType: '2', state: '3',
  holdVol: '0', frozenVol: '0', closeVol: '1141', holdAvgPrice: '0.03491', openAvgPrice: '0.03491',
  closeAvgPrice: '0.03494', liquidatePrice: '0.03433', oim: '0', im: '0', holdFee: '0',
  realised: '0.1829', leverage: '50', createTime: '1711512408000', updateTime: '1711512553000',
  profitRatio: '0.0227', closeProfitLoss: '0.3423', fee: '0.1593977', positionShowStatus: 'CLOSED',
};

const OKX_SAMPLE = {
  cTime: '1708735940395', ccy: 'USDT', closeAvgPx: '0.6330444444444444', closeTotalPos: '27',
  direction: 'long', fee: '-1.69566', fundingFee: '-11.870404179341788', instId: 'XRP-USDT-SWAP',
  instType: 'SWAP', lever: '3.0', liqPenalty: '0', mgnMode: 'cross', openAvgPx: '0.623',
  openMaxPos: '15', pnl: '27.11999999999988', pnlRatio: '0.0241732402722634',
  posId: '681423155054862336', realizedPnl: '13.553935820658092', type: '2', uTime: '1711088748170',
};

const BITGET_SAMPLE = {
  symbol: 'BTCUSDT', marginCoin: 'USDT', holdSide: 'long', openAvgPrice: '37272.1',
  closeAvgPrice: '37271.4', marginMode: 'crossed', openTotalPos: '0.001', closeTotalPos: '0.001',
  pnl: '-0.0007', netProfit: '-0.0454261', totalFunding: '0', openFee: '-0.02236326',
  closeFee: '-0.02236284', utime: '1700720700400', ctime: '1700720651684',
};

describe('withRisk', () => {
  it('derives $ risk and an unsigned R from the stop, like the Bybit path', () => {
    const t = withRisk({ entryPrice: 100, exitPrice: 90, stopLoss: 95, quantity: 2 });
    expect(t.riskAmount).toBe(10);
    expect(t.rrRatio).toBe(2);
  });
  it('leaves risk/R at 0 without a stop', () => {
    expect(withRisk({ entryPrice: 100, exitPrice: 110, stopLoss: 0, quantity: 1 })).toMatchObject({ riskAmount: 0, rrRatio: 0 });
  });
});

describe('MEXC closed position', () => {
  const t = normalizeMexcClosed(MEXC_SAMPLE, {
    contractSize: 0.1, entryDate: '2024-03-27T04:06:48.000Z', exitDate: '2024-03-27T04:09:13.000Z', externalId: 'RVNUSDT_1711512408000',
  });

  it('has every field the Bybit sync has', () => {
    for (const f of CLOSED_FIELDS) expect(t).toHaveProperty(f);
  });

  it("nets to MEXC's own realized P&L (fee not subtracted twice)", () => {
    expect(t.fees).toBeCloseTo(0.1593977, 7);
    // MEXC rounds `realised` to 4 dp, so gross matches closeProfitLoss to 4 dp.
    expect(t.pnlFromExchange).toBeCloseTo(0.3423, 4); // = closeProfitLoss (gross)
    expect(net(t)).toBeCloseTo(0.1829, 7);            // = realised, exactly
  });

  it('maps prices, side, leverage and converts contracts to coins', () => {
    expect(t).toMatchObject({ pair: 'RVNUSDT', direction: 'long', entryPrice: 0.03491, exitPrice: 0.03494, leverage: 50, source: 'mexc' });
    expect(t.quantity).toBeCloseTo(114.1, 6);
  });

  it('never treats funding (holdFee) as a trading fee', () => {
    expect(mexcTradeFee({ holdFee: '2.5' })).toBe(0);
    expect(mexcTradeFee({ fee: '0', holdFee: '2.5' })).toBe(0);
    expect(mexcTradeFee({ totalFee: '-0.4' })).toBe(0.4);
  });

  it('falls back to closeProfitLoss when realised is missing', () => {
    const r = normalizeMexcClosed({ ...MEXC_SAMPLE, realised: undefined }, {});
    expect(r.pnlFromExchange).toBeCloseTo(0.3423, 7);
  });
});

describe('OKX closed position', () => {
  const t = normalizeOkxClosed(OKX_SAMPLE, 100); // XRP-USDT-SWAP: ctVal = 100 XRP

  it('has every field the Bybit sync has', () => {
    for (const f of CLOSED_FIELDS) expect(t).toHaveProperty(f);
  });

  it('converts contracts to coins (27 contracts × 100 = 2,700 XRP)', () => {
    expect(t.quantity).toBe(2700);
    // Sanity: the price move × coin size reproduces OKX's own gross pnl.
    expect((t.exitPrice - t.entryPrice) * t.quantity).toBeCloseTo(27.12, 2);
  });

  it("nets to OKX's realizedPnl (fees and funding included)", () => {
    expect(t.fees).toBeCloseTo(1.69566, 6);
    expect(net(t)).toBeCloseTo(13.553935820658092, 6);
  });

  it('maps side, prices, leverage and dates', () => {
    expect(t).toMatchObject({ pair: 'XRPUSDT', direction: 'long', entryPrice: 0.623, leverage: 3, source: 'okx' });
    expect(t.entryDate).toBe(new Date(1708735940395).toISOString());
    expect(t.exitDate).toBe(new Date(1711088748170).toISOString());
  });

  it('gives each position its own id even when OKX reuses the posId', () => {
    const later = normalizeOkxClosed({ ...OKX_SAMPLE, cTime: '1712000000000', uTime: '1712100000000' }, 100);
    expect(later.externalId).not.toBe(t.externalId);
  });
});

describe('OKX open position', () => {
  const row = {
    instId: 'BTC-USDT-SWAP', posSide: 'net', pos: '-3', avgPx: '60000', lever: '10', liqPx: '66000',
    cTime: '1700000000000', posId: '1',
    closeOrderAlgo: [{ algoId: 'a', slTriggerPx: '62000', tpTriggerPx: '55000' }],
  };
  const p = normalizeOkxOpen(row, 0.01); // BTC-USDT-SWAP: ctVal = 0.01 BTC

  it('converts contracts to coins and reads the side from a negative net position', () => {
    expect(p.quantity).toBe(0.03);
    expect(p.direction).toBe('short');
    expect(p.positionSize).toBe(1800);
  });

  it('reads the attached SL/TP from closeOrderAlgo', () => {
    expect(p.stopLoss).toBe(62000);
    expect(p.tps).toEqual([55000]);
    expect(p.liquidationPrice).toBe(66000);
  });
});

describe('Bitget closed position', () => {
  const t = normalizeBitgetClosed(BITGET_SAMPLE);

  it('has every field the Bybit sync has', () => {
    for (const f of CLOSED_FIELDS) expect(t).toHaveProperty(f);
  });

  it('reads the real price fields (previously imported as 0)', () => {
    expect(t.entryPrice).toBe(37272.1);
    expect(t.exitPrice).toBe(37271.4);
    expect(t.quantity).toBe(0.001);
  });

  it("sums open+close fees and nets to Bitget's netProfit", () => {
    expect(t.fees).toBeCloseTo(0.0447261, 7);
    expect(t.pnlFromExchange).toBeCloseTo(-0.0007, 7); // = pnl (gross)
    expect(net(t)).toBeCloseTo(-0.0454261, 7);         // = netProfit
  });

  it('maps side and dates, keeps the legacy id format', () => {
    expect(t).toMatchObject({ pair: 'BTCUSDT', direction: 'long', source: 'bitget', externalId: 'BTCUSDT_1700720651684' });
    expect(t.entryDate).toBe(new Date(1700720651684).toISOString());
    expect(t.exitDate).toBe(new Date(1700720700400).toISOString());
  });
});

describe('MEXC stop loss / take profit per position', () => {
  it('takes the ORIGINAL (earliest) stop, even if it was later moved', () => {
    const m = mexcStopsByPosition([
      { positionId: 7, stopLossPrice: '0.3490', createTime: 2000 }, // moved to break-even
      { positionId: 7, stopLossPrice: '0.3400', createTime: 1000 }, // original
      { positionId: 7, takeProfitPrice: '0.3700', createTime: 1500 },
    ]);
    expect(m.get('7')).toEqual({ sl: 0.34, tp: 0.37 });
  });

  it('combines an SL from a stop order with a TP from the opening order', () => {
    const m = mexcStopsByPosition([
      { positionId: '9', stopLossPrice: '0', takeProfitPrice: '120', createTime: 10 }, // filled open order
      { positionId: '9', stopLossPrice: '95', takeProfitPrice: '0', createTime: 20 },  // TP/SL stop order
    ]);
    expect(m.get('9')).toEqual({ sl: 95, tp: 120 });
  });

  it('ignores rows without a position or without prices', () => {
    const m = mexcStopsByPosition([{ stopLossPrice: '1' }, { positionId: 0, stopLossPrice: '1' }, { positionId: 3 }]);
    expect(m.size).toBe(0);
  });

  it('feeds risk and R into the closed trade', () => {
    const t = normalizeMexcClosed(
      { ...MEXC_SAMPLE, openAvgPrice: '100', closeAvgPrice: '110', closeVol: '10' },
      { contractSize: 1, sl: 95, tp: 120, entryDate: 'a', exitDate: 'b', externalId: 'x' },
    );
    expect(t).toMatchObject({ stopLoss: 95, tps: [120], riskAmount: 50, rrRatio: 2 });
  });
});
