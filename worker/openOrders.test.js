import { describe, it, expect } from 'vitest';
import {
  normalizeBybitOrder, normalizeOkxOrder, normalizeOkxAlgo, normalizeBitgetOrder, normalizeBitgetPlan,
  normalizeMexcOrder, normalizeMexcStopOrder, normalizeMexcPlanOrder, sortOrders, handleOpenOrdersRoute,
} from './openOrders';
import { normalizeHlOpenOrders } from './hyperliquid';
import fx from './hyperliquid.fixture.json';

// Sample rows follow each venue's documented example response for the
// endpoint (Bybit v5 /order/realtime, OKX /trade/orders-pending +
// /trade/orders-algo-pending, Bitget v2 orders-pending / orders-plan-pending,
// MEXC contract order / stoporder / planorder lists) so the field names are
// pinned to the real API.

const SHAPE = [
  'id', 'exchange', 'pair', 'side', 'effect', 'positionSide', 'kind', 'orderType', 'price', 'triggerPrice',
  'qty', 'filledQty', 'wholePosition', 'reduceOnly', 'createdAt', 'status', 'attachedTp', 'attachedSl',
];
const hasShape = (o) => { for (const k of SHAPE) expect(o).toHaveProperty(k); };

// ── Bybit ────────────────────────────────────────────────────────────────────
const BYBIT_LIMIT = {
  orderId: 'fd4300ae-7847-404e-b947-b46980a4d140', orderLinkId: 'test-000005', symbol: 'ETHUSDT', price: '1600.00',
  qty: '0.10', side: 'Buy', isLeverage: '', positionIdx: 0, orderStatus: 'New', cancelType: 'UNKNOWN',
  rejectReason: 'EC_NoError', avgPrice: '0', leavesQty: '0.10', leavesValue: '160', cumExecQty: '0.00',
  cumExecValue: '0', cumExecFee: '0', timeInForce: 'GTC', orderType: 'Limit', stopOrderType: 'UNKNOWN', orderIv: '',
  triggerPrice: '0.00', takeProfit: '2500.00', stopLoss: '1500.00', tpTriggerBy: 'LastPrice', slTriggerBy: 'LastPrice',
  triggerDirection: 0, triggerBy: 'UNKNOWN', lastPriceOnCreated: '', reduceOnly: false, closeOnTrigger: false,
  smpType: 'None', smpGroup: 0, smpOrderId: '', tpslMode: 'Full', tpLimitPrice: '', slLimitPrice: '', placeType: '',
  createdTime: '1684738540559', updatedTime: '1684738540561',
};

describe('Bybit /v5/order/realtime', () => {
  it('a resting limit entry with an attached TP/SL', () => {
    const o = normalizeBybitOrder(BYBIT_LIMIT);
    hasShape(o);
    expect(o).toMatchObject({
      id: BYBIT_LIMIT.orderId, exchange: 'bybit', pair: 'ETHUSDT', side: 'buy', effect: 'open', positionSide: 'long',
      kind: 'limit', price: 1600, triggerPrice: 0, qty: 0.1, filledQty: 0, reduceOnly: false, wholePosition: false,
      createdAt: 1684738540559, status: 'New', attachedTp: 2500, attachedSl: 1500, orderType: 'Limit',
    });
  });

  it('a position stop loss (tpslMode Full) covers the whole position', () => {
    const o = normalizeBybitOrder({
      ...BYBIT_LIMIT, orderId: 'sl1', side: 'Sell', orderType: 'Market', price: '0', qty: '0', stopOrderType: 'StopLoss',
      triggerPrice: '1500', triggerDirection: 2, reduceOnly: true, closeOnTrigger: true, orderStatus: 'Untriggered',
      takeProfit: '0', stopLoss: '0',
    });
    expect(o).toMatchObject({
      side: 'sell', effect: 'close', positionSide: 'long', kind: 'stop_loss', price: 0, triggerPrice: 1500,
      qty: 0, wholePosition: true, reduceOnly: true, attachedTp: 0, attachedSl: 0,
    });
  });

  it('take profit, trailing and a plain conditional (stop entry vs closing stop)', () => {
    expect(normalizeBybitOrder({ ...BYBIT_LIMIT, side: 'Sell', stopOrderType: 'PartialTakeProfit', qty: '0.05', reduceOnly: true, triggerPrice: '2000' }))
      .toMatchObject({ kind: 'take_profit', qty: 0.05, wholePosition: false, positionSide: 'long' });
    expect(normalizeBybitOrder({ ...BYBIT_LIMIT, side: 'Sell', stopOrderType: 'TrailingStop', reduceOnly: true, triggerPrice: '1700' }).kind).toBe('trailing');
    // Stop-market ENTRY above price (breakout buy).
    expect(normalizeBybitOrder({ ...BYBIT_LIMIT, orderType: 'Market', stopOrderType: 'Stop', triggerPrice: '1700', triggerDirection: 1 }))
      .toMatchObject({ kind: 'trigger', effect: 'open', price: 0, triggerPrice: 1700 });
    // Reduce-only conditional below a long = a stop; above it = a take profit.
    expect(normalizeBybitOrder({ ...BYBIT_LIMIT, side: 'Sell', stopOrderType: 'Stop', triggerPrice: '1500', triggerDirection: 2, reduceOnly: true }).kind).toBe('stop_loss');
    expect(normalizeBybitOrder({ ...BYBIT_LIMIT, side: 'Sell', stopOrderType: 'Stop', triggerPrice: '1900', triggerDirection: 1, reduceOnly: true }).kind).toBe('take_profit');
  });

  it('hedge mode: positionIdx names the position', () => {
    expect(normalizeBybitOrder({ ...BYBIT_LIMIT, side: 'Buy', positionIdx: 2, reduceOnly: true }).positionSide).toBe('short');
    expect(normalizeBybitOrder({ ...BYBIT_LIMIT, side: 'Sell', positionIdx: 1, reduceOnly: true }).positionSide).toBe('long');
  });
});

// ── OKX ──────────────────────────────────────────────────────────────────────
const OKX_PENDING = {
  accFillSz: '0', attachAlgoOrds: [{ attachAlgoId: '1', tpTriggerPx: '70000', tpOrdPx: '-1', slTriggerPx: '55000', slOrdPx: '-1' }],
  avgPx: '', cTime: '1724733617998', category: 'normal', fee: '0', feeCcy: 'USDT', instId: 'BTC-USDT-SWAP',
  instType: 'SWAP', lever: '10', ordId: '1752588852617379840', ordType: 'limit', posSide: 'net', px: '58000',
  reduceOnly: 'false', side: 'buy', slTriggerPx: '', state: 'live', sz: '3', tdMode: 'cross', tpTriggerPx: '',
  uTime: '1724733617998',
};
const OKX_ALGO = {
  activePx: '', actualSide: 'sell', algoId: '681096944655273984', attachAlgoOrds: [], cTime: '1708658165774',
  callbackRatio: '', closeFraction: '1', instId: 'BTC-USDT-SWAP', instType: 'SWAP', lever: '10', moveTriggerPx: '',
  ordPx: '', ordType: 'oco', posSide: 'net', reduceOnly: 'true', side: 'sell', slOrdPx: '-1', slTriggerPx: '57000',
  state: 'live', sz: '', tdMode: 'cross', tpOrdPx: '-1', tpTriggerPx: '68000', triggerPx: '', uTime: '1708658165774',
};

describe('OKX pending orders', () => {
  it('a limit order: contracts → coins, attached TP/SL', () => {
    const o = normalizeOkxOrder(OKX_PENDING, 0.01);
    hasShape(o);
    expect(o).toMatchObject({
      exchange: 'okx', pair: 'BTCUSDT', side: 'buy', effect: 'open', positionSide: 'long', kind: 'limit',
      price: 58000, qty: 0.03, reduceOnly: false, createdAt: 1724733617998, attachedTp: 70000, attachedSl: 55000,
    });
  });

  it('hedge mode: a sell on the long side closes the long', () => {
    expect(normalizeOkxOrder({ ...OKX_PENDING, posSide: 'long', side: 'sell', attachAlgoOrds: [] }, 0.01))
      .toMatchObject({ effect: 'close', positionSide: 'long', reduceOnly: true });
    expect(normalizeOkxOrder({ ...OKX_PENDING, ordType: 'market' }, 0.01)).toMatchObject({ kind: 'market', price: 0 });
  });

  it('an OCO algo is two rows: TP and SL for the whole position', () => {
    const rows = normalizeOkxAlgo(OKX_ALGO, 0.01);
    expect(rows).toHaveLength(2);
    rows.forEach(hasShape);
    expect(rows[0]).toMatchObject({ id: '681096944655273984:tp', kind: 'take_profit', triggerPrice: 68000, price: 0, wholePosition: true, positionSide: 'long', side: 'sell', effect: 'close' });
    expect(rows[1]).toMatchObject({ id: '681096944655273984:sl', kind: 'stop_loss', triggerPrice: 57000, wholePosition: true });
  });

  it('trigger and trailing algos', () => {
    const trig = normalizeOkxAlgo({ ...OKX_ALGO, ordType: 'trigger', reduceOnly: 'false', side: 'buy', triggerPx: '66000', ordPx: '-1', sz: '2', closeFraction: '', tpTriggerPx: '', slTriggerPx: '' }, 0.01);
    expect(trig).toHaveLength(1);
    expect(trig[0]).toMatchObject({ kind: 'trigger', effect: 'open', positionSide: 'long', triggerPrice: 66000, price: 0, qty: 0.02 });
    const trail = normalizeOkxAlgo({ ...OKX_ALGO, ordType: 'move_order_stop', moveTriggerPx: '64000', callbackRatio: '0.05', tpTriggerPx: '', slTriggerPx: '' }, 0.01);
    expect(trail[0]).toMatchObject({ kind: 'trailing', triggerPrice: 64000, effect: 'close' });
  });
});

// ── Bitget ───────────────────────────────────────────────────────────────────
const BITGET_PENDING = {
  symbol: 'ETHUSDT', size: '100', orderId: '123', clientOid: '12321', baseVolume: '12.1', fee: '', price: '1900',
  priceAvg: '1903', status: 'partially_filled', side: 'buy', force: 'gtc', totalProfits: '0', posSide: 'long',
  marginCoin: 'usdt', quoteVolume: '22001.21', leverage: '20', marginMode: 'cross', enterPointSource: 'api',
  tradeSide: 'open', posMode: 'hedge_mode', orderType: 'limit', orderSource: 'normal', presetStopSurplusPrice: '2100',
  presetStopLossPrice: '1800', reduceOnly: 'NO', cTime: '1627293504612', uTime: '1627293505612',
};
const BITGET_PLAN = {
  planType: 'normal_plan', symbol: 'ETHUSDT', size: '2', orderId: '1', clientOid: '1', price: '2000', executePrice: '',
  callbackRatio: '', triggerPrice: '1900', triggerType: 'mark_price', planStatus: 'live', side: 'buy', posSide: 'long',
  marginCoin: 'USDT', marginMode: 'crossed', enterPointSource: 'API', tradeSide: 'open', posMode: 'hedge_mode',
  orderType: 'limit', stopSurplusTriggerPrice: '2200', stopSurplusExecutePrice: '', stopLossTriggerPrice: '1800',
  stopLossExecutePrice: '', cTime: '1627300098776', uTime: '1627300098776',
};

describe('Bitget v2 pending orders', () => {
  it('a partially filled limit entry', () => {
    const o = normalizeBitgetOrder(BITGET_PENDING);
    hasShape(o);
    expect(o).toMatchObject({
      exchange: 'bitget', pair: 'ETHUSDT', side: 'buy', effect: 'open', positionSide: 'long', kind: 'limit', price: 1900,
      qty: 100, filledQty: 12.1, attachedTp: 2100, attachedSl: 1800, createdAt: 1627293504612, status: 'partially_filled',
    });
  });

  it('hedge mode close: side names the position, the real side is the opposite', () => {
    expect(normalizeBitgetOrder({ ...BITGET_PENDING, tradeSide: 'close' }))
      .toMatchObject({ side: 'sell', effect: 'close', positionSide: 'long', reduceOnly: true });
    // One-way mode.
    expect(normalizeBitgetOrder({ ...BITGET_PENDING, posSide: 'net', side: 'sell', tradeSide: 'sell_single', reduceOnly: 'YES' }))
      .toMatchObject({ side: 'sell', effect: 'close', positionSide: 'long' });
  });

  it('plan orders: trigger entry and position TP/SL', () => {
    expect(normalizeBitgetPlan(BITGET_PLAN)).toMatchObject({
      kind: 'trigger', effect: 'open', positionSide: 'long', side: 'buy', price: 2000, triggerPrice: 1900, qty: 2,
      attachedTp: 2200, attachedSl: 1800,
    });
    expect(normalizeBitgetPlan({ ...BITGET_PLAN, planType: 'loss_plan', tradeSide: 'close', size: '0.5', triggerPrice: '1700', orderType: 'market' }))
      .toMatchObject({ kind: 'stop_loss', effect: 'close', side: 'sell', price: 0, triggerPrice: 1700, qty: 0.5, wholePosition: false });
    expect(normalizeBitgetPlan({ ...BITGET_PLAN, planType: 'pos_profit', size: '', triggerPrice: '2400' }))
      .toMatchObject({ kind: 'take_profit', wholePosition: true, qty: 0 });
  });
});

// ── MEXC ─────────────────────────────────────────────────────────────────────
const MEXC_ORDER = {
  orderId: '102015012431820288', symbol: 'ETH_USDT', positionId: 1394650, price: 1500, vol: 10, leverage: 20, side: 1,
  category: 1, orderType: 1, dealAvgPrice: 0, dealVol: 2, orderMargin: 0.0075, takerFee: 0, makerFee: 0, profit: 0,
  feeCurrency: 'USDT', openType: 1, state: 2, externalOid: '_m_x', errorCode: 0, usedMargin: 0,
  createTime: 1609991045000, updateTime: 1609991045000, stopLossPrice: 1400, takeProfitPrice: 1700,
};

describe('MEXC contract orders', () => {
  it('an open-long limit order: contracts → coins', () => {
    const o = normalizeMexcOrder(MEXC_ORDER, 0.01);
    hasShape(o);
    expect(o).toMatchObject({
      exchange: 'mexc', pair: 'ETHUSDT', side: 'buy', effect: 'open', positionSide: 'long', kind: 'limit', price: 1500,
      qty: 0.1, filledQty: 0.02, attachedTp: 1700, attachedSl: 1400, createdAt: 1609991045000,
    });
    expect(normalizeMexcOrder({ ...MEXC_ORDER, side: 4, orderType: 5 }, 0.01))
      .toMatchObject({ side: 'sell', effect: 'close', positionSide: 'long', kind: 'market', price: 0, reduceOnly: true });
  });

  it('a stop order with SL only is one whole-position stop', () => {
    const rows = normalizeMexcStopOrder({
      id: 1, orderId: '0', symbol: 'EOS_USDT', positionId: 1, stopLossPrice: 5, takeProfitPrice: 0, state: 1,
      triggerSide: 0, positionType: 1, vol: 0, realityVol: 0, isFinished: 0, createTime: 1609992674000, updateTime: 1609992674000,
    }, 1);
    expect(rows).toHaveLength(1);
    hasShape(rows[0]);
    expect(rows[0]).toMatchObject({ id: '1:sl', kind: 'stop_loss', triggerPrice: 5, side: 'sell', positionSide: 'long', wholePosition: true, qty: 0 });
  });

  it('a close-long plan order triggering below is a stop', () => {
    const p = normalizeMexcPlanOrder({
      id: '1234', symbol: 'EOS_USDT', leverage: 20, side: 4, triggerPrice: 1.2, price: 1.1, vol: 5, openType: 1,
      triggerType: 2, state: 1, executeCycle: 87600, trend: 1, orderType: 1, createTime: 1609992674000,
    }, 1);
    expect(p).toMatchObject({ id: '1234', kind: 'stop_loss', triggerPrice: 1.2, price: 1.1, qty: 5, effect: 'close' });
    expect(normalizeMexcPlanOrder({ id: '9', symbol: 'EOS_USDT', side: 1, triggerPrice: 1.5, price: 0, vol: 5, triggerType: 1, orderType: 5 }, 1))
      .toMatchObject({ kind: 'trigger', effect: 'open', price: 0 });
  });
});

// ── Hyperliquid (real frontendOpenOrders) ────────────────────────────────────
describe('Hyperliquid frontendOpenOrders', () => {
  it('a position TP (size 0) is a whole-position take profit', () => {
    const rows = normalizeHlOpenOrders(fx.filOpen.openOrders);
    expect(rows).toHaveLength(1);
    hasShape(rows[0]);
    expect(rows[0]).toMatchObject({
      id: 'hl-568065211220', exchange: 'hyperliquid', pair: 'FILUSDT', side: 'sell', effect: 'close', positionSide: 'long',
      kind: 'take_profit', triggerPrice: 2, price: 2, wholePosition: true, reduceOnly: true, createdAt: 1791410633901,
    });
  });

  it('a resting limit entry and its attached stop', () => {
    const rows = normalizeHlOpenOrders([{
      coin: 'BTC', side: 'B', limitPx: '60000.0', sz: '0.01', oid: 7, timestamp: 1, triggerCondition: 'N/A',
      isTrigger: false, triggerPx: '0.0', isPositionTpsl: false, reduceOnly: false, orderType: 'Limit', origSz: '0.02',
      children: [{ coin: 'BTC', side: 'A', limitPx: '55000', sz: '0.01', oid: 8, timestamp: 1, isTrigger: true, triggerPx: '55000', orderType: 'Stop Market', reduceOnly: true, children: [] }],
    }]);
    rows.forEach(hasShape);
    expect(rows[0]).toMatchObject({ kind: 'limit', effect: 'open', positionSide: 'long', price: 60000, qty: 0.01, filledQty: 0.01, attachedSl: 55000, attachedTp: 0 });
    expect(rows[1]).toMatchObject({ kind: 'stop_loss', effect: 'close', price: 0, triggerPrice: 55000, parentId: 'hl-7' });
  });
});

it('sortOrders: newest first, stable by id', () => {
  const s = sortOrders([{ id: 'b', createdAt: 1 }, { id: 'a', createdAt: 1 }, { id: 'c', createdAt: 5 }]);
  expect(s.map((o) => o.id)).toEqual(['c', 'a', 'b']);
});

// ── Route ────────────────────────────────────────────────────────────────────
describe('handleOpenOrdersRoute', () => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const req = (path, token = 'good') => {
    const url = new URL(`https://w.example${path}`);
    return [new Request(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }), url];
  };
  const deps = (over = {}) => ({
    verifyToken: async (t) => (t === 'good' ? 'uid1' : null),
    rateLimit: async () => ({ count: 1 }),
    resolveCreds: async () => ({ apiKey: 'k', apiSecret: 's' }),
    ...over,
  });
  const bybitFetch = (body) => async (u) => {
    expect(String(u)).toContain('https://api.bybit.com/v5/order/realtime?category=linear&settleCoin=USDT');
    return new Response(JSON.stringify(body));
  };

  it('401 without a token, 400 for an unsupported venue, 429 over the throttle', async () => {
    expect((await handleOpenOrdersRoute(...req('/exchange/open-orders?exchange=bybit', null), cors, deps())).status).toBe(401);
    expect((await handleOpenOrdersRoute(...req('/exchange/open-orders?exchange=binance'), cors, deps())).status).toBe(400);
    expect((await handleOpenOrdersRoute(...req('/exchange/open-orders?exchange=bybit'), cors, deps({ rateLimit: async () => ({ count: 31 }) }))).status).toBe(429);
  });

  it('409 when the key is not stored', async () => {
    const res = await handleOpenOrdersRoute(...req('/exchange/open-orders?exchange=bybit'), cors, deps({ resolveCreds: async () => null }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: 'reconnect_required' });
  });

  it('returns normalized Bybit orders, never cached', async () => {
    const res = await handleOpenOrdersRoute(...req('/exchange/open-orders?exchange=bybit'), cors, deps(),
      bybitFetch({ retCode: 0, result: { list: [BYBIT_LIMIT], nextPageCursor: '' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, count: 1, partial: false });
    expect(data.orders[0]).toMatchObject({ exchange: 'bybit', kind: 'limit', price: 1600 });
  });

  it('an API-key problem comes back with its reason', async () => {
    const res = await handleOpenOrdersRoute(...req('/exchange/open-orders?exchange=bybit'), cors, deps(),
      bybitFetch({ retCode: 10003, retMsg: 'API key is invalid.' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'key_invalid' });
  });

  it('Hyperliquid needs an address, not a key', async () => {
    const hlFetch = async (_u, init) => {
      expect(JSON.parse(init.body).type).toBe('frontendOpenOrders');
      return new Response(JSON.stringify(fx.filOpen.openOrders));
    };
    const noCreds = deps({ resolveCreds: async () => { throw new Error('must not be called'); } });
    expect((await handleOpenOrdersRoute(...req('/exchange/open-orders?exchange=hyperliquid&address=0xnope'), cors, noCreds, hlFetch)).status).toBe(400);
    const res = await handleOpenOrdersRoute(...req(`/exchange/open-orders?exchange=hyperliquid&address=${fx.ethShort.user}`), cors, noCreds, hlFetch);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, count: 1 });
    expect(data.orders[0].kind).toBe('take_profit');
  });
});
