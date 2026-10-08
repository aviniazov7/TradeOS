// Open (resting) orders for the trading terminal — GET /exchange/open-orders.
//
// Read-only: every call below works with a read-only API key, uses the same
// encrypted per-user credentials as /exchange/open-positions (resolved by the
// caller), writes NOTHING to KV and caches nothing (the rows are private).
// Hyperliquid needs no key — its orders are public by wallet address.
//
// Every venue's rows are mapped to ONE shape (the normalizers are pure, so
// each is unit-tested against the venue's documented sample payload):
//   {
//     id, exchange, pair ('BTCUSDT'),
//     side: 'buy' | 'sell',          — the order's real side
//     effect: 'open' | 'close',      — opens/adds vs reduces a position
//     positionSide: 'long' | 'short' | null — the position it opens / closes
//     kind: 'limit' | 'market' | 'stop_loss' | 'take_profit' | 'trailing' | 'trigger',
//     orderType,                     — the venue's own label, for the tooltip
//     price,                         — limit price; 0 = executes at market
//     triggerPrice,                  — 0 = not a conditional order
//     qty, filledQty,                — COIN units (contract venues converted)
//     wholePosition,                 — a TP/SL for the entire position (qty 0)
//     reduceOnly, createdAt (ms), status,
//     attachedTp, attachedSl,        — TP/SL riding on an entry order (0 = none)
//   }

import { classifyExchangeAuthError } from './exchangeNormalize.js';
import { fetchHlOpenOrders, isHlAddress } from './hyperliquid.js';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const trim = (n) => (n ? +n.toPrecision(10) : 0);
const ms = (v) => parseInt(v) || 0;
const okxPair = (instId = '') => {
  const parts = String(instId).split('-');
  return parts.length >= 2 ? (parts[0] + parts[1]).toUpperCase() : String(instId).toUpperCase();
};
const bitgetPair = (s = '') => String(s).replace(/_.*/, '').toUpperCase();
// The position an order opens (buy → long) or closes (buy → short).
const sideToPosition = (side, closing) => {
  const buy = side === 'buy';
  return closing ? (buy ? 'short' : 'long') : (buy ? 'long' : 'short');
};
// Order side that CLOSES a position of this direction.
const closeSideOf = (positionSide) => (positionSide === 'long' ? 'sell' : positionSide === 'short' ? 'buy' : null);

function row(o) {
  return {
    id: String(o.id),
    exchange: o.exchange,
    pair: o.pair,
    side: o.side,
    effect: o.effect,
    positionSide: o.positionSide ?? null,
    kind: o.kind,
    orderType: o.orderType || '',
    price: trim(num(o.price)),
    triggerPrice: trim(num(o.triggerPrice)),
    qty: trim(num(o.qty)),
    filledQty: trim(num(o.filledQty)),
    wholePosition: !!o.wholePosition,
    reduceOnly: !!o.reduceOnly,
    createdAt: ms(o.createdAt),
    status: o.status || 'open',
    attachedTp: trim(num(o.attachedTp)),
    attachedSl: trim(num(o.attachedSl)),
  };
}

// A closing conditional order without an explicit TP/SL label: which one it
// is follows from where it triggers relative to the position — a stop sits
// on the losing side (below a long, above a short).
//   triggersAbove: true = fires when price RISES to the trigger.
const closingKind = (positionSide, triggersAbove) => {
  if (triggersAbove == null || !positionSide) return 'stop_loss';
  const aboveIsProfit = positionSide === 'long';
  return triggersAbove === aboveIsProfit ? 'take_profit' : 'stop_loss';
};

// ── Bybit (v5 /order/realtime, category=linear) ──────────────────────────────
// One call returns active AND conditional orders (orderFilter defaults to all
// kinds for derivatives). Position-level TP/SL (tpslMode Full) are orders
// with stopOrderType TakeProfit/StopLoss and qty 0.
const BYBIT_TP = new Set(['TakeProfit', 'PartialTakeProfit']);
const BYBIT_SL = new Set(['StopLoss', 'PartialStopLoss']);
export function normalizeBybitOrder(o) {
  const side = o.side === 'Buy' ? 'buy' : 'sell';
  const sot = String(o.stopOrderType || '');
  const isTpsl = BYBIT_TP.has(sot) || BYBIT_SL.has(sot);
  const closing = o.reduceOnly === true || o.closeOnTrigger === true || isTpsl
    || String(o.reduceOnly) === 'true' || String(o.closeOnTrigger) === 'true';
  const idx = parseInt(o.positionIdx);
  const positionSide = idx === 1 ? 'long' : idx === 2 ? 'short' : sideToPosition(side, closing);
  const trigger = num(o.triggerPrice);
  let kind;
  if (BYBIT_TP.has(sot)) kind = 'take_profit';
  else if (BYBIT_SL.has(sot)) kind = 'stop_loss';
  else if (sot === 'TrailingStop') kind = 'trailing';
  else if (trigger > 0 || sot === 'Stop' || sot === 'tpslOrder') {
    const dir = parseInt(o.triggerDirection);
    kind = closing ? closingKind(positionSide, dir === 1 ? true : dir === 2 ? false : null) : 'trigger';
  } else kind = o.orderType === 'Market' ? 'market' : 'limit';
  const qty = num(o.qty);
  return row({
    id: o.orderId,
    exchange: 'bybit',
    pair: o.symbol,
    side,
    effect: closing ? 'close' : 'open',
    positionSide,
    kind,
    orderType: sot && sot !== 'UNKNOWN' ? `${o.orderType} · ${sot}` : o.orderType,
    price: o.orderType === 'Market' ? 0 : o.price,
    triggerPrice: trigger,
    qty,
    filledQty: o.cumExecQty,
    wholePosition: closing && !(qty > 0),
    reduceOnly: closing,
    createdAt: o.createdTime,
    status: o.orderStatus,
    attachedTp: closing ? 0 : o.takeProfit,
    attachedSl: closing ? 0 : o.stopLoss,
  });
}

// ── OKX (/trade/orders-pending + /trade/orders-algo-pending, SWAP) ───────────
// Sizes are CONTRACTS → × ctVal. Hedge mode names the position (posSide);
// in net mode a reduce-only order closes the side opposite its own.
const okxClosing = (o) => {
  const hedge = o.posSide === 'long' || o.posSide === 'short';
  if (hedge) return (o.posSide === 'long' && o.side === 'sell') || (o.posSide === 'short' && o.side === 'buy');
  return String(o.reduceOnly) === 'true';
};
const okxPositionSide = (o, closing) => (o.posSide === 'long' || o.posSide === 'short' ? o.posSide : sideToPosition(o.side, closing));

export function normalizeOkxOrder(o, ctVal = 1) {
  const closing = okxClosing(o);
  const algo = Array.isArray(o.attachAlgoOrds) ? o.attachAlgoOrds : [];
  const isMarket = o.ordType === 'market' || o.ordType === 'optimal_limit_ioc';
  return row({
    id: o.ordId,
    exchange: 'okx',
    pair: okxPair(o.instId),
    side: o.side === 'buy' ? 'buy' : 'sell',
    effect: closing ? 'close' : 'open',
    positionSide: okxPositionSide(o, closing),
    kind: isMarket ? 'market' : 'limit',
    orderType: o.ordType,
    price: isMarket ? 0 : o.px,
    triggerPrice: 0,
    qty: num(o.sz) * (ctVal || 1),
    filledQty: num(o.accFillSz) * (ctVal || 1),
    reduceOnly: closing,
    createdAt: o.cTime,
    status: o.state,
    attachedTp: num(o.tpTriggerPx) || num(algo.find((a) => num(a.tpTriggerPx) > 0)?.tpTriggerPx),
    attachedSl: num(o.slTriggerPx) || num(algo.find((a) => num(a.slTriggerPx) > 0)?.slTriggerPx),
  });
}

// One algo order → 1-2 rows (an OCO / conditional carrying both a TP and an
// SL is two price levels on the chart). An *OrdPx of -1 means "at market".
const okxOrdPx = (v) => (String(v) === '-1' ? 0 : num(v));
export function normalizeOkxAlgo(a, ctVal = 1) {
  const closing = a.ordType === 'conditional' || a.ordType === 'oco' || a.ordType === 'move_order_stop' || okxClosing(a);
  const positionSide = (a.posSide === 'long' || a.posSide === 'short') ? a.posSide : sideToPosition(a.side, closing);
  const whole = String(a.closeFraction) === '1' || !(num(a.sz) > 0);
  const base = {
    exchange: 'okx',
    pair: okxPair(a.instId),
    side: a.side === 'buy' ? 'buy' : 'sell',
    effect: closing ? 'close' : 'open',
    positionSide,
    orderType: a.ordType,
    qty: whole && closing ? 0 : num(a.sz) * (ctVal || 1),
    wholePosition: closing && whole,
    reduceOnly: closing,
    createdAt: a.cTime,
    status: a.state,
  };
  if (a.ordType === 'move_order_stop') {
    return [row({ ...base, id: a.algoId, kind: 'trailing', price: 0, triggerPrice: num(a.moveTriggerPx) || num(a.activePx) })];
  }
  if (a.ordType === 'trigger') {
    const trig = num(a.triggerPx);
    const kind = closing ? closingKind(positionSide, null) : 'trigger';
    return [row({ ...base, id: a.algoId, kind, price: okxOrdPx(a.orderPx ?? a.ordPx), triggerPrice: trig })];
  }
  const out = [];
  if (num(a.tpTriggerPx) > 0) out.push(row({ ...base, id: `${a.algoId}:tp`, kind: 'take_profit', price: okxOrdPx(a.tpOrdPx), triggerPrice: a.tpTriggerPx }));
  if (num(a.slTriggerPx) > 0) out.push(row({ ...base, id: `${a.algoId}:sl`, kind: 'stop_loss', price: okxOrdPx(a.slOrdPx), triggerPrice: a.slTriggerPx }));
  return out;
}

// ── Bitget (v2 /mix/order/orders-pending + orders-plan-pending) ──────────────
// Sizes are in coins. Bitget hedge mode quirk: `side` names the POSITION
// (close long = side buy + tradeSide close), so the real order side is
// derived from posSide when the order closes.
export function normalizeBitgetOrder(o) {
  const hedge = o.posSide === 'long' || o.posSide === 'short';
  const closing = /close/i.test(o.tradeSide || '') || String(o.reduceOnly).toUpperCase() === 'YES';
  const positionSide = hedge ? o.posSide : sideToPosition(o.side, closing);
  const side = hedge ? (closing ? closeSideOf(positionSide) : (positionSide === 'long' ? 'buy' : 'sell')) : (o.side === 'buy' ? 'buy' : 'sell');
  const isMarket = o.orderType === 'market';
  return row({
    id: o.orderId,
    exchange: 'bitget',
    pair: bitgetPair(o.symbol),
    side,
    effect: closing ? 'close' : 'open',
    positionSide,
    kind: isMarket ? 'market' : 'limit',
    orderType: o.orderType,
    price: isMarket ? 0 : o.price,
    triggerPrice: 0,
    qty: o.size,
    filledQty: o.baseVolume,
    reduceOnly: closing,
    createdAt: o.cTime,
    status: o.status,
    attachedTp: o.presetStopSurplusPrice,
    attachedSl: o.presetStopLossPrice,
  });
}

const BITGET_PLAN_KIND = {
  profit_plan: 'take_profit', pos_profit: 'take_profit',
  loss_plan: 'stop_loss', pos_loss: 'stop_loss',
  moving_plan: 'trailing', track_plan: 'trailing',
};
export function normalizeBitgetPlan(p) {
  const tpsl = BITGET_PLAN_KIND[p.planType];
  const hedge = p.posSide === 'long' || p.posSide === 'short';
  const hold = p.holdSide === 'long' || p.holdSide === 'short' ? p.holdSide : null;
  const closing = !!tpsl || /close/i.test(p.tradeSide || '') || String(p.reduceOnly).toUpperCase() === 'YES';
  const positionSide = hedge ? p.posSide : hold || sideToPosition(p.side, closing);
  const side = closing ? closeSideOf(positionSide) : (positionSide === 'long' ? 'buy' : 'sell');
  const whole = p.planType === 'pos_profit' || p.planType === 'pos_loss' || !(num(p.size) > 0);
  const isMarket = p.orderType === 'market';
  return row({
    id: p.orderId,
    exchange: 'bitget',
    pair: bitgetPair(p.symbol),
    side,
    effect: closing ? 'close' : 'open',
    positionSide,
    kind: tpsl || (closing ? closingKind(positionSide, null) : 'trigger'),
    orderType: p.planType,
    price: isMarket ? 0 : (num(p.price) || num(p.executePrice)),
    triggerPrice: p.triggerPrice,
    qty: whole && closing ? 0 : p.size,
    wholePosition: closing && whole,
    reduceOnly: closing,
    createdAt: p.cTime,
    status: p.planStatus || p.status,
    attachedTp: tpsl ? 0 : p.stopSurplusTriggerPrice,
    attachedSl: tpsl ? 0 : p.stopLossTriggerPrice,
  });
}

// ── MEXC (contract API) ──────────────────────────────────────────────────────
// side 1 open long · 2 close short · 3 open short · 4 close long. Volume is in
// CONTRACTS → × contractSize. orderType 5/6 = market, the rest are priced.
const MEXC_SIDE = {
  1: { side: 'buy', effect: 'open', positionSide: 'long' },
  2: { side: 'buy', effect: 'close', positionSide: 'short' },
  3: { side: 'sell', effect: 'open', positionSide: 'short' },
  4: { side: 'sell', effect: 'close', positionSide: 'long' },
};
const mexcPair = (s = '') => String(s).replace(/_/g, '');
const mexcMarket = (t) => [5, 6].includes(parseInt(t));

export function normalizeMexcOrder(o, contractSize = 1) {
  const s = MEXC_SIDE[parseInt(o.side)] || { side: 'buy', effect: 'open', positionSide: null };
  const market = mexcMarket(o.orderType);
  return row({
    id: o.orderId,
    exchange: 'mexc',
    pair: mexcPair(o.symbol),
    ...s,
    kind: market ? 'market' : 'limit',
    orderType: String(o.orderType ?? ''),
    price: market ? 0 : o.price,
    triggerPrice: 0,
    qty: num(o.vol) * (contractSize || 1),
    filledQty: num(o.dealVol) * (contractSize || 1),
    reduceOnly: s.effect === 'close',
    createdAt: o.createTime,
    status: String(o.state ?? ''),
    attachedTp: o.takeProfitPrice,
    attachedSl: o.stopLossPrice,
  });
}

// /stoporder/list/orders row: a position's TP/SL pair → up to two rows.
// positionType 1 = long, 2 = short; vol 0/absent = the whole position.
export function normalizeMexcStopOrder(s, contractSize = 1) {
  const pt = parseInt(s.positionType);
  const positionSide = pt === 1 ? 'long' : pt === 2 ? 'short' : null;
  const vol = num(s.vol);
  const base = {
    exchange: 'mexc',
    pair: mexcPair(s.symbol),
    side: closeSideOf(positionSide) || 'sell',
    effect: 'close',
    positionSide,
    orderType: 'stoporder',
    price: 0,
    qty: vol > 0 ? vol * (contractSize || 1) : 0,
    wholePosition: !(vol > 0),
    reduceOnly: true,
    createdAt: s.createTime,
    status: String(s.state ?? ''),
  };
  const out = [];
  if (num(s.takeProfitPrice) > 0) out.push(row({ ...base, id: `${s.id}:tp`, kind: 'take_profit', triggerPrice: s.takeProfitPrice }));
  if (num(s.stopLossPrice) > 0) out.push(row({ ...base, id: `${s.id}:sl`, kind: 'stop_loss', triggerPrice: s.stopLossPrice }));
  return out;
}

// /planorder/list/orders row (trigger order). triggerType 1 = fires at
// price ≥ trigger, 2 = ≤ trigger.
export function normalizeMexcPlanOrder(p, contractSize = 1) {
  const s = MEXC_SIDE[parseInt(p.side)] || { side: 'buy', effect: 'open', positionSide: null };
  const tt = parseInt(p.triggerType);
  const above = tt === 1 ? true : tt === 2 ? false : null;
  const market = mexcMarket(p.orderType);
  return row({
    id: p.id ?? p.orderId,
    exchange: 'mexc',
    pair: mexcPair(p.symbol),
    ...s,
    kind: s.effect === 'close' ? closingKind(s.positionSide, above) : 'trigger',
    orderType: 'planorder',
    price: market ? 0 : p.price,
    triggerPrice: p.triggerPrice,
    qty: num(p.vol) * (contractSize || 1),
    reduceOnly: s.effect === 'close',
    createdAt: p.createTime,
    status: String(p.state ?? ''),
  });
}

/** Newest first, ties broken by id so the list doesn't jump between polls. */
export function sortOrders(list = []) {
  return list.slice().sort((a, b) => (b.createdAt - a.createdAt) || String(a.id).localeCompare(String(b.id)));
}

// ── Signing / network ────────────────────────────────────────────────────────
const enc = new TextEncoder();
async function hmac(secret, msg, out = 'hex') {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  if (out === 'base64') return btoa(String.fromCharCode(...sig));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// An upstream error that keeps the venue's code for classifyExchangeAuthError.
class VenueError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const timeout = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(9000) } : {});

async function getJson(fetchImpl, url, headers) {
  const r = await fetchImpl(url, { headers, ...timeout() });
  return r.json().catch(() => ({}));
}

async function bybitOrders({ apiKey, apiSecret }, fetchImpl) {
  const out = [];
  let cursor = '';
  for (let page = 0; page < 4; page++) {
    const ts = Date.now().toString();
    const recvWindow = '5000';
    const qs = `category=linear&settleCoin=USDT&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const sign = await hmac(apiSecret, ts + apiKey + recvWindow + qs);
    const d = await getJson(fetchImpl, `https://api.bybit.com/v5/order/realtime?${qs}`, {
      'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-SIGN': sign, 'X-BAPI-RECV-WINDOW': recvWindow,
    });
    if (d.retCode !== 0) throw new VenueError(d.retMsg || `Bybit ${d.retCode}`, d.retCode);
    const list = d.result?.list || [];
    out.push(...list.map(normalizeBybitOrder));
    cursor = d.result?.nextPageCursor || '';
    if (!cursor || list.length < 50) break;
  }
  return { orders: out, partial: false };
}

async function okxOrders({ apiKey, apiSecret, passphrase }, fetchImpl, ctMap) {
  const okxGet = async (path) => {
    const ts = new Date().toISOString();
    const sign = await hmac(apiSecret, ts + 'GET' + path, 'base64');
    const d = await getJson(fetchImpl, `https://www.okx.com${path}`, {
      'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-TIMESTAMP': ts, 'OK-ACCESS-PASSPHRASE': passphrase || '', 'Content-Type': 'application/json',
    });
    if (d.code !== '0') throw new VenueError(`OKX ${d.code}: ${d.msg || 'error'}`, d.code);
    return Array.isArray(d.data) ? d.data : [];
  };
  const ct = (instId) => ctMap[instId] || 1;
  const pending = await okxGet('/api/v5/trade/orders-pending?instType=SWAP&limit=100');
  const orders = pending.map((o) => normalizeOkxOrder(o, ct(o.instId)));
  let partial = false;
  // Conditional + OCO share one call; trigger and trailing need their own.
  for (const ordType of ['conditional,oco', 'trigger', 'move_order_stop']) {
    try {
      const algos = await okxGet(`/api/v5/trade/orders-algo-pending?ordType=${ordType}&instType=SWAP&limit=100`);
      for (const a of algos) orders.push(...normalizeOkxAlgo(a, ct(a.instId)));
    } catch { partial = true; }
  }
  return { orders, partial };
}

async function bitgetOrders({ apiKey, apiSecret, passphrase }, fetchImpl) {
  const bitgetGet = async (path) => {
    const ts = String(Date.now());
    const sign = await hmac(apiSecret, ts + 'GET' + path, 'base64');
    const d = await getJson(fetchImpl, `https://api.bitget.com${path}`, {
      'ACCESS-KEY': apiKey, 'ACCESS-SIGN': sign, 'ACCESS-TIMESTAMP': ts, 'ACCESS-PASSPHRASE': passphrase || '', 'Content-Type': 'application/json', locale: 'en-US',
    });
    if (d.code !== '00000') throw new VenueError(`Bitget ${d.code}: ${d.msg || 'error'}`, d.code);
    return d.data?.entrustedList || (Array.isArray(d.data) ? d.data : []);
  };
  const pending = await bitgetGet('/api/v2/mix/order/orders-pending?productType=USDT-FUTURES&limit=100');
  const orders = pending.map(normalizeBitgetOrder);
  let partial = false;
  for (const planType of ['normal_plan', 'profit_loss']) {
    try {
      const plans = await bitgetGet(`/api/v2/mix/order/orders-plan-pending?productType=USDT-FUTURES&planType=${planType}&limit=100`);
      orders.push(...plans.map(normalizeBitgetPlan));
    } catch { partial = true; }
  }
  return { orders, partial };
}

async function mexcOrders({ apiKey, apiSecret }, fetchImpl, csMap) {
  const mexcGet = async (path, params) => {
    const ts = Date.now().toString();
    // MEXC signs apiKey + timestamp + the sorted query string.
    const qs = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    const sign = await hmac(apiSecret, apiKey + ts + qs);
    const d = await getJson(fetchImpl, `https://contract.mexc.com${path}?${qs}`, {
      ApiKey: apiKey, 'Request-Time': ts, Signature: sign, 'Content-Type': 'application/json',
    });
    if (!(d.success === true || d.code === 0)) throw new VenueError(d.message || d.msg || `MEXC ${d.code}`, d.code);
    return Array.isArray(d.data) ? d.data : (d.data?.resultList || d.data?.list || []);
  };
  const cs = (sym) => csMap[mexcPair(sym)] || 1;
  // states=2 = "uncompleted" — the resting orders (ccxt's fetchOpenOrders
  // route for MEXC swaps). The window is capped at ~90 days by MEXC.
  const now = Date.now();
  const open = await mexcGet('/api/v1/private/order/list/history_orders', {
    states: '2', page_num: '1', page_size: '100', start_time: String(now - 89 * 864e5), end_time: String(now),
  });
  const orders = open.filter((o) => [1, 2].includes(parseInt(o.state)) || o.state == null).map((o) => normalizeMexcOrder(o, cs(o.symbol)));
  let partial = false;
  try {
    const stops = await mexcGet('/api/v1/private/stoporder/list/orders', { is_finished: '0', page_num: '1', page_size: '100' });
    for (const s of stops) if (s.state == null || parseInt(s.state) === 1) orders.push(...normalizeMexcStopOrder(s, cs(s.symbol)));
  } catch { partial = true; }
  try {
    const plans = await mexcGet('/api/v1/private/planorder/list/orders', { states: '1', page_num: '1', page_size: '100' });
    for (const p of plans) orders.push(normalizeMexcPlanOrder(p, cs(p.symbol)));
  } catch { partial = true; }
  return { orders, partial };
}

export const OPEN_ORDER_EXCHANGES = ['bybit', 'okx', 'bitget', 'mexc', 'hyperliquid'];

/**
 * The venue's open orders, normalized and sorted. Throws VenueError on the
 * primary call's failure; the optional extra lists (algo / plan / stop
 * orders) only set `partial`.
 * deps: { mexcContractSizes() → map, okxContractValues() → map }
 */
export async function fetchOpenOrders(exchange, creds, deps = {}, fetchImpl = fetch) {
  let res;
  if (exchange === 'bybit') res = await bybitOrders(creds, fetchImpl);
  else if (exchange === 'okx') res = await okxOrders(creds, fetchImpl, (await deps.okxContractValues?.()) || {});
  else if (exchange === 'bitget') res = await bitgetOrders(creds, fetchImpl);
  else if (exchange === 'mexc') res = await mexcOrders(creds, fetchImpl, (await deps.mexcContractSizes?.()) || {});
  else throw new VenueError('Exchange not supported for open orders');
  return { orders: sortOrders(res.orders), partial: res.partial };
}

// ── Route ────────────────────────────────────────────────────────────────────
// GET /exchange/open-orders?exchange=bybit            (stored read-only key)
// GET /exchange/open-orders?exchange=hyperliquid&address=0x…
//   → { ok, orders, count, partial }
// Signed-in users only + its own per-user throttle (edge counter, no KV
// write). deps: { verifyToken(token) → uid, rateLimit(key, sec) → { count },
// resolveCreds(uid, exchange) → creds | null, mexcContractSizes,
// okxContractValues }.
export async function handleOpenOrdersRoute(request, url, cors, deps, fetchImpl = fetch) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  const uid = token ? await deps.verifyToken(token) : null;
  if (!uid) return json({ error: 'unauthorized' }, 401);
  const rl = await deps.rateLimit(`rl:exorders:${uid}`, 60);
  if (rl?.count > 30) return json({ ok: false, error: 'יותר מדי בקשות לבורסה. נסה שוב בעוד רגע.' }, 429);

  const exchange = String(url.searchParams.get('exchange') || '').toLowerCase();
  if (!OPEN_ORDER_EXCHANGES.includes(exchange)) return json({ ok: false, error: 'Exchange not supported for open orders' }, 400);

  try {
    if (exchange === 'hyperliquid') {
      const address = (url.searchParams.get('address') || '').trim();
      if (!isHlAddress(address)) return json({ ok: false, error: 'invalid_address' }, 400);
      const orders = sortOrders(await fetchHlOpenOrders(address.toLowerCase(), fetchImpl));
      return json({ ok: true, orders, count: orders.length, partial: false });
    }
    const creds = await deps.resolveCreds(uid, exchange);
    if (!creds) return json({ ok: false, error: 'reconnect_required' }, 409);
    const { orders, partial } = await fetchOpenOrders(exchange, creds, deps, fetchImpl);
    return json({ ok: true, orders, count: orders.length, partial });
  } catch (e) {
    const message = String(e?.message || e);
    const reason = classifyExchangeAuthError(exchange, e?.code, message);
    return json({ ok: false, error: message, ...(reason ? { reason } : {}) }, reason ? 400 : 502);
  }
}
