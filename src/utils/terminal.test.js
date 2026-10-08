import { describe, it, expect } from 'vitest';
import {
  tvSymbol, tvChartUrl, stopForPosition, takeProfitForPosition, journalTradeForPosition, positionMetrics,
  positionTotals, fmtPx, fmtUsd, fmtPct, fmtR, agoLabel, ordersForPosition, saneLiveMark,
} from './terminal';

const LONG = {
  pair: 'SOLUSDT', direction: 'long', entryPrice: 150, quantity: 10, leverage: 10, stopLoss: 140, tps: [180],
  source: 'bybit', externalId: 'SOLUSDT_0_1', markPrice: 155, unrealizedPnl: 50, margin: 150, liquidationPrice: 136,
};
const SHORT = {
  pair: 'BTCUSDT', direction: 'short', entryPrice: 60000, quantity: 0.1, leverage: 5, stopLoss: 0, tps: [],
  source: 'mexc', externalId: '77', markPrice: null, unrealizedPnl: null, margin: null, liquidationPrice: null,
};
const order = (o) => ({
  exchange: 'mexc', pair: 'BTCUSDT', side: 'buy', effect: 'close', positionSide: 'short', kind: 'stop_loss',
  price: 0, triggerPrice: 0, qty: 0, wholePosition: false, ...o,
});

describe('tvSymbol', () => {
  it('maps each venue to its TradingView perpetual', () => {
    expect(tvSymbol('SOLUSDT', 'bybit')).toBe('BYBIT:SOLUSDT.P');
    expect(tvSymbol('BTCUSDT', 'okx')).toBe('OKX:BTCUSDT.P');
    expect(tvSymbol('ETHUSDT', 'bitget')).toBe('BITGET:ETHUSDT.P');
    expect(tvSymbol('XRPUSDT', 'mexc')).toBe('MEXC:XRPUSDT.P');
    expect(tvSymbol('1000PEPEUSDT', 'hyperliquid')).toBe('BYBIT:1000PEPEUSDT.P');
    expect(tvSymbol('btc-usdt', 'unknown')).toBe('BINANCE:BTCUSDT.P');
  });
  it('leaves non-USDT tickers (HIP-3) for TradingView to resolve', () => {
    expect(tvSymbol('GOLD', 'hyperliquid')).toBe('GOLD');
    expect(tvSymbol('', 'bybit')).toBe('BINANCE:BTCUSDT.P');
  });
});

it('tvChartUrl builds the advanced-chart embed with the interval and theme', () => {
  const url = tvChartUrl({ symbol: 'BYBIT:SOLUSDT.P', interval: '240', theme: 'dark', timezone: 'Asia/Jerusalem' });
  expect(url.startsWith('https://s.tradingview.com/embed-widget/advanced-chart/')).toBe(true);
  const cfg = JSON.parse(decodeURIComponent(url.split('#')[1]));
  expect(cfg).toMatchObject({ symbol: 'BYBIT:SOLUSDT.P', interval: '240', theme: 'dark', timezone: 'Asia/Jerusalem', autosize: true });
  expect(JSON.parse(decodeURIComponent(tvChartUrl({ symbol: 'X', theme: 'light' }).split('#')[1])).theme).toBe('light');
  expect(cfg).toMatchObject({ style: '1', hide_side_toolbar: true, hide_volume: false, backgroundColor: 'rgba(10, 10, 12, 1)' });
});

it('tvChartUrl passes the chart style, pure black and the drawing toolbar', () => {
  const cfgOf = (o) => JSON.parse(decodeURIComponent(tvChartUrl({ symbol: 'X', ...o }).split('#')[1]));
  expect(cfgOf({ style: '0' }).style).toBe('0');
  expect(cfgOf({ style: '9' }).style).toBe('9');
  expect(cfgOf({ style: 'zzz' }).style).toBe('1');
  expect(cfgOf({ black: true }).backgroundColor).toBe('rgba(0, 0, 0, 1)');
  expect(cfgOf({ black: true, theme: 'light' }).backgroundColor).toBe('rgba(255, 255, 255, 1)');
  expect(cfgOf({ drawTools: true }).hide_side_toolbar).toBe(false);
});

describe('stops and targets from orders', () => {
  it("the position's own stop wins", () => {
    expect(stopForPosition(LONG, [order({ exchange: 'bybit', pair: 'SOLUSDT', positionSide: 'long', triggerPrice: 120 })])).toBe(140);
  });
  it('else a whole-position stop order, else the one nearest the price', () => {
    const orders = [
      order({ triggerPrice: 64000 }),
      order({ triggerPrice: 62000 }),
      order({ triggerPrice: 99999, pair: 'ETHUSDT' }), // other pair
      order({ triggerPrice: 50000, positionSide: 'long' }), // other side
    ];
    expect(stopForPosition(SHORT, orders, 61000)).toBe(62000);
    expect(stopForPosition(SHORT, [...orders, order({ triggerPrice: 65000, wholePosition: true })], 61000)).toBe(65000);
    expect(stopForPosition(SHORT, [])).toBe(0);
    expect(ordersForPosition(SHORT, orders)).toHaveLength(2);
  });
  it('take profit: own TP first, then the nearest TP order', () => {
    expect(takeProfitForPosition(LONG, [])).toBe(180);
    expect(takeProfitForPosition(SHORT, [order({ kind: 'take_profit', triggerPrice: 50000 }), order({ kind: 'take_profit', triggerPrice: 55000 })], 60000)).toBe(55000);
  });
});

describe('journalTradeForPosition', () => {
  const trades = [
    { id: 'a', status: 'closed', source: 'bybit', pair: 'SOLUSDT', direction: 'long', externalId: 'SOLUSDT_0_1' },
    { id: 'b', status: 'open', source: 'bybit', pair: 'SOLUSDT', direction: 'long', externalIds: ['SOLUSDT_0_1'], stopLoss: 135 },
    { id: 'c', status: 'open', source: 'mexc', pair: 'BTCUSDT', direction: 'short', stopLoss: 63000 },
  ];
  it('matches by exchange id, then by venue + pair + side', () => {
    expect(journalTradeForPosition(LONG, trades).id).toBe('b');
    expect(journalTradeForPosition(SHORT, trades).id).toBe('c');
    expect(journalTradeForPosition({ ...SHORT, direction: 'long' }, trades)).toBeNull();
  });
});

describe('positionMetrics', () => {
  it('uses the exchange numbers between ticks', () => {
    const m = positionMetrics(LONG);
    expect(m).toMatchObject({ mark: 155, value: 1550, upnl: 50, margin: 150, stop: 140, tp: 180, stopSource: 'position' });
    expect(m.upnlPct).toBeCloseTo(33.333, 2); // on margin (ROE)
    expect(m.movePct).toBeCloseTo(3.333, 2);
    expect(m.riskUsd).toBe(100); // (150 − 140) × 10
    expect(m.rMultiple).toBeCloseTo(0.5, 6);
    expect(m.liqDistancePct).toBeCloseTo((155 - 136) / 155 * 100, 6);
  });

  it('recomputes P&L from a live price', () => {
    const m = positionMetrics(LONG, { liveMark: 160 });
    expect(m.upnl).toBe(100);
    expect(m.rMultiple).toBeCloseTo(1, 6);
  });

  it('R uses the journal’s ORIGINAL stop when the live one was trailed', () => {
    const trailed = { ...LONG, stopLoss: 152 }; // stop now in profit
    const m = positionMetrics(trailed, { journalTrade: { stopLoss: 140 } });
    expect(m.riskUsd).toBe(-20); // locked profit, not risk
    expect(m.initialRiskUsd).toBe(100);
    expect(m.rMultiple).toBeCloseTo(0.5, 6);
    // Without the journal, a stop beyond entry gives no R.
    expect(positionMetrics(trailed).rMultiple).toBeNull();
  });

  it('a venue without mark / margin (MEXC) — derived from a live price and leverage', () => {
    const orders = [order({ triggerPrice: 62000, wholePosition: true })];
    const m = positionMetrics(SHORT, { liveMark: 59000, orders });
    expect(m.upnl).toBeCloseTo(100, 6); // (60000 − 59000) × 0.1
    expect(m.margin).toBe(1200); // 6000 / 5
    expect(m.stop).toBe(62000);
    expect(m.stopSource).toBe('order');
    expect(m.riskUsd).toBeCloseTo(200, 6);
    expect(m.rMultiple).toBeCloseTo(0.5, 6);
    // No price at all → unknown P&L, notional at entry.
    const blind = positionMetrics(SHORT);
    expect(blind.upnl).toBeNull();
    expect(blind.value).toBe(6000);
  });
});

it('saneLiveMark only trusts a public price that agrees with the position', () => {
  expect(saneLiveMark(LONG, 156)).toBe(156); // within 3% of the venue mark 155
  expect(saneLiveMark(LONG, 170)).toBe(0);
  expect(saneLiveMark(SHORT, 59000)).toBe(59000); // no venue mark → vs entry
  expect(saneLiveMark(SHORT, 59)).toBe(0); // a different unit
  expect(saneLiveMark(SHORT, 0)).toBe(0);
});

it('positionTotals sums value, P&L, margin and open risk', () => {
  const rows = [LONG, SHORT].map((p) => ({ p, m: positionMetrics(p, { liveMark: p === SHORT ? 59000 : 0 }) }));
  const t = positionTotals(rows);
  expect(t.value).toBeCloseTo(1550 + 5900, 6);
  expect(t.upnl).toBeCloseTo(150, 6);
  expect(t.margin).toBe(1350);
  expect(t.risk).toBe(100); // the short has no stop
  expect(positionTotals([]).upnl).toBeNull();
});

describe('formatting', () => {
  it('prices, money, percent and R', () => {
    expect(fmtPx(64123.456)).toBe('64,123.46');
    expect(fmtPx(1.23456789)).toBe('1.2346');
    expect(fmtPx(0.000012345)).toBe('0.00001235');
    expect(fmtPx(0)).toBe('—');
    expect(fmtUsd(-12.5, { signed: true })).toBe('‎-$12.50');
    expect(fmtUsd(1234567, { compact: true })).toBe('‎$1.23M');
    expect(fmtUsd(null)).toBe('—');
    expect(fmtPct(3.333)).toBe('‎+3.33%');
    expect(fmtR(-0.5)).toBe('‎-0.50R');
  });
  it('agoLabel', () => {
    expect(agoLabel(1000, 3000)).toBe('עכשיו');
    expect(agoLabel(1000, 13000)).toBe('לפני 12 שנ׳');
    expect(agoLabel(0)).toBe('—');
  });
});
