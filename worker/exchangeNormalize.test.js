import { describe, it, expect } from 'vitest';
import {
  withRisk, bybitWalletEquity, classifyExchangeAuthError, mexcCronOpen, mexcCronClosed, buildExits, enrichWithOrders, okxOrderRow, okxStopRow, bitgetOrderRow, bitgetStopRow, mexcExitsByPosition, mexcTradeFee, mexcStopsByPosition, mexcOrderKind, mexcEntryTypeByPosition, normalizeMexcClosed, normalizeOkxClosed, normalizeOkxOpen, normalizeBitgetClosed,
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

describe('MEXC entry order type', () => {
  it('maps MEXC order types to limit / market', () => {
    expect([1, 2, 3, 4].map(mexcOrderKind)).toEqual(['limit', 'limit', 'limit', 'limit']);
    expect(mexcOrderKind('5')).toBe('market');
    expect(mexcOrderKind(6)).toBe('market');
    expect(mexcOrderKind(undefined)).toBeNull();
  });

  it("takes the position's first OPENING order, ignoring closes", () => {
    const m = mexcEntryTypeByPosition([
      { positionId: 1, side: 4, orderType: 5, createTime: 50 },  // close long, market (ignored)
      { positionId: 1, side: 1, orderType: 1, createTime: 10 },  // open long, limit
      { positionId: 1, side: 1, orderType: 5, createTime: 20 },  // later add-on, market
      { positionId: 2, side: 3, orderType: 5, createTime: 30 },  // open short, market
    ]);
    expect(m.get('1')).toBe('limit');
    expect(m.get('2')).toBe('market');
  });

  it('puts the order type on the closed trade (market when unknown)', () => {
    expect(normalizeMexcClosed(MEXC_SAMPLE, { orderType: 'limit' }).orderType).toBe('limit');
    expect(normalizeMexcClosed(MEXC_SAMPLE, {}).orderType).toBe('market');
  });
});

describe('classifyExchangeAuthError', () => {
  it('recognises an expired key by code', () => {
    expect(classifyExchangeAuthError('mexc', 402, 'Api_key expired')).toBe('key_expired');
    expect(classifyExchangeAuthError('bybit', 33004, 'Your api key has expired.')).toBe('key_expired');
  });

  it('reads the code out of a wrapped message', () => {
    expect(classifyExchangeAuthError('mexc', null, 'Error: MEXC 402: Api_key expired')).toBe('key_expired');
    expect(classifyExchangeAuthError('okx', undefined, 'OKX 50111: Invalid OK-ACCESS-KEY')).toBe('key_invalid');
  });

  it('separates invalid keys, IP blocks and missing permissions', () => {
    expect(classifyExchangeAuthError('mexc', 602, 'Verify failed')).toBe('key_invalid');
    expect(classifyExchangeAuthError('bybit', 10010, 'Unmatched IP')).toBe('ip_blocked');
    expect(classifyExchangeAuthError('mexc', 406, 'Accessed IP is not in the whitelist')).toBe('ip_blocked');
    expect(classifyExchangeAuthError('bitget', 40014, 'Incorrect permissions')).toBe('no_permission');
  });

  it('falls back to the message, and returns null for non-auth errors', () => {
    expect(classifyExchangeAuthError('okx', null, 'API key has expired')).toBe('key_expired');
    expect(classifyExchangeAuthError('bybit', 10006, 'Too many visits!')).toBeNull();
    expect(classifyExchangeAuthError('mexc', null, 'fetch failed')).toBeNull();
  });
});

describe('buildExits', () => {
  it('needs at least two closing fills', () => {
    expect(buildExits([{ price: 10, size: 1, time: 1 }])).toBeNull();
  });
  it('orders by time and makes the percents sum to exactly 100', () => {
    const e = buildExits([
      { price: 12, size: 1, time: 3 }, { price: 10, size: 1, time: 1 }, { price: 11, size: 1, time: 2 },
    ]);
    expect(e.map((x) => x.price)).toEqual([10, 11, 12]);
    expect(e.reduce((s, x) => s + x.percent, 0)).toBeCloseTo(100, 8);
  });
});

describe('OKX order rows', () => {
  // The documented closing-order sample: net mode, reduce-only sell.
  const CLOSE = {
    instId: 'LINK-USDT-SWAP', ordType: 'limit', posSide: 'net', reduceOnly: 'true', side: 'sell',
    avgPx: '13.142', accFillSz: '0.1', state: 'filled', fillTime: '1751705807467', cTime: '1751705801423',
    slTriggerPx: '', tpTriggerPx: '', attachAlgoOrds: [],
  };
  it('reads a reduce-only sell in net mode as closing a LONG, in coins', () => {
    expect(okxOrderRow(CLOSE, 1)).toMatchObject({ pair: 'LINKUSDT', direction: 'long', role: 'close', kind: 'limit', price: 13.142, size: 0.1, time: 1751705807467 });
  });
  it('reads an opening market buy with an attached stop', () => {
    const open = okxOrderRow({ ...CLOSE, ordType: 'market', reduceOnly: 'false', side: 'buy', attachAlgoOrds: [{ slTriggerPx: '12.5', tpTriggerPx: '14' }] }, 10);
    expect(open).toMatchObject({ direction: 'long', role: 'open', kind: 'market', sl: 12.5, tp: 14, size: 1 });
  });
  it('uses posSide in hedge mode', () => {
    expect(okxOrderRow({ ...CLOSE, posSide: 'short', side: 'buy', reduceOnly: 'false' })).toMatchObject({ direction: 'short', role: 'close' });
  });
  it('maps a TP/SL algo order to the position it protects', () => {
    expect(okxStopRow({ instId: 'BTC-USDT-SWAP', posSide: 'net', side: 'sell', slTriggerPx: '60000', tpTriggerPx: '', cTime: '5' }))
      .toEqual({ pair: 'BTCUSDT', direction: 'long', sl: 60000, tp: 0, time: 5 });
  });
});

describe('Bitget order rows', () => {
  // The documented orders-history sample (hedge mode).
  const ROW = {
    symbol: 'BTCUSDT', size: '0.002', priceAvg: '37000', status: 'filled', side: 'buy', posSide: 'long',
    tradeSide: 'open', orderType: 'limit', presetStopSurplusPrice: '39000', presetStopLossPrice: '36000',
    reduceOnly: 'NO', baseVolume: '0.002', cTime: '1700727885449', uTime: '1700727944563',
  };
  it('reads an opening limit order with preset SL/TP', () => {
    expect(bitgetOrderRow(ROW)).toMatchObject({ pair: 'BTCUSDT', direction: 'long', role: 'open', kind: 'limit', price: 37000, size: 0.002, sl: 36000, tp: 39000 });
  });
  it('reads a closing order', () => {
    expect(bitgetOrderRow({ ...ROW, side: 'sell', tradeSide: 'close', orderType: 'market' })).toMatchObject({ role: 'close', direction: 'long', kind: 'market' });
  });
  it('maps TP/SL plans by plan type', () => {
    expect(bitgetStopRow({ symbol: 'BTCUSDT', posSide: 'long', planType: 'pos_loss', triggerPrice: '35500', cTime: '9' })).toMatchObject({ direction: 'long', sl: 35500, tp: 0 });
    expect(bitgetStopRow({ symbol: 'BTCUSDT', holdSide: 'short', planType: 'profit_plan', triggerPrice: '30000', cTime: '9' })).toMatchObject({ direction: 'short', sl: 0, tp: 30000 });
  });
});

describe('enrichWithOrders', () => {
  const trade = withRisk({
    pair: 'BTCUSDT', direction: 'long', entryPrice: 100, exitPrice: 0, quantity: 2, stopLoss: 0, tps: [],
    entryDate: new Date(1_000_000).toISOString(), exitDate: new Date(5_000_000).toISOString(),
  });
  const orders = [
    { pair: 'BTCUSDT', direction: 'long', role: 'open', kind: 'limit', price: 100, size: 2, time: 1_000_500, sl: 0, tp: 0 },
    { pair: 'BTCUSDT', direction: 'long', role: 'close', kind: 'limit', price: 110, size: 1, time: 3_000_000, sl: 0, tp: 0 },
    { pair: 'BTCUSDT', direction: 'long', role: 'close', kind: 'market', price: 120, size: 1, time: 4_000_000, sl: 0, tp: 0 },
    { pair: 'BTCUSDT', direction: 'long', role: 'open', kind: 'market', price: 90, size: 1, time: 9_000_000, sl: 0, tp: 0 }, // a later position
    { pair: 'ETHUSDT', direction: 'long', role: 'open', kind: 'market', price: 5, size: 1, time: 1_000_100, sl: 0, tp: 0 },  // other pair
  ];
  const stops = [
    { pair: 'BTCUSDT', direction: 'long', sl: 99, tp: 0, time: 2_000_000 },   // moved to near break-even
    { pair: 'BTCUSDT', direction: 'long', sl: 95, tp: 0, time: 1_200_000 },   // original
  ];
  const t = enrichWithOrders({ ...trade, exitPrice: 115 }, orders, stops);

  it('takes the order type from the opening order of THIS position', () => {
    expect(t.orderType).toBe('limit');
  });
  it('takes the ORIGINAL stop and derives risk/R', () => {
    expect(t).toMatchObject({ stopLoss: 95, riskAmount: 10, rrRatio: 3 });
  });
  it('builds the TP breakdown from the closing fills', () => {
    expect(t.exits).toEqual([{ price: 110, percent: 50 }, { price: 120, percent: 50 }]);
  });
  it('keeps a stop the exchange already reported', () => {
    expect(enrichWithOrders({ ...trade, stopLoss: 97 }, orders, stops).stopLoss).toBe(97);
  });
});

describe('mexcExitsByPosition', () => {
  it('builds exits from a position\'s closing fills, in coins', () => {
    const m = mexcExitsByPosition([
      { positionId: 5, symbol: 'RVN_USDT', side: 4, dealAvgPrice: '0.035', dealVol: '600', updateTime: 2 },
      { positionId: 5, symbol: 'RVN_USDT', side: 4, dealAvgPrice: '0.036', dealVol: '400', updateTime: 3 },
      { positionId: 5, symbol: 'RVN_USDT', side: 1, dealAvgPrice: '0.034', dealVol: '1000', updateTime: 1 }, // the open
      { positionId: 6, symbol: 'RVN_USDT', side: 4, dealAvgPrice: '0.04', dealVol: '1', updateTime: 4 },      // single close
    ], () => 10);
    expect(m.get('5')).toEqual([{ price: 0.035, percent: 60 }, { price: 0.036, percent: 40 }]);
    expect(m.has('6')).toBe(false);
  });
});

describe('MEXC rows for the background alerts', () => {
  it('maps a closed position (net P&L, ROI on margin, close time)', () => {
    const c = mexcCronClosed(MEXC_SAMPLE, 0.1);
    expect(c).toMatchObject({ externalId: '390281084', pair: 'RVNUSDT', direction: 'long', pnl: 0.1829, exitMs: 1711512553000 });
    // margin = 0.03491 × 1141 × 0.1 / 50 ≈ 0.0797 → ROI ≈ 229.6%
    expect(c.roiPct).toBeCloseTo((0.1829 / (0.03491 * 1141 * 0.1 / 50)) * 100, 6);
  });
  it('maps an open position', () => {
    expect(mexcCronOpen({ positionId: 77, symbol: 'BTC_USDT', positionType: 2, holdAvgPrice: '60000', leverage: '20' }))
      .toEqual({ id: '77', pair: 'BTCUSDT', direction: 'short', entryPrice: 60000, leverage: 20 });
  });
});

describe('bybitWalletEquity', () => {
  it('reads a Unified account total', () => {
    expect(bybitWalletEquity([{ accountType: 'UNIFIED', totalEquity: '18070.32797922', coin: [] }])).toBeCloseTo(18070.328, 3);
  });
  it('sums coin USD values on a Classic CONTRACT account (no totals)', () => {
    expect(bybitWalletEquity([{ accountType: 'CONTRACT', totalEquity: '', coin: [
      { coin: 'USDT', equity: '400.5', usdValue: '' },
      { coin: 'BTC', equity: '0.001', usdValue: '60.25' },
    ] }])).toBeCloseTo(460.75, 6);
  });
  it('returns null when the account type has nothing, 0 for an empty wallet', () => {
    expect(bybitWalletEquity([])).toBeNull();
    expect(bybitWalletEquity([{ accountType: 'UNIFIED', totalEquity: '0', coin: [] }])).toBe(0);
  });
});
