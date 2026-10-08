// Hyperliquid (perp DEX) sync. Everything here is PUBLIC on-chain data keyed
// by a wallet address — no API key, no secret, nothing stored server-side
// (zero KV reads/writes). The client keeps the address in its own Firestore
// settings doc and passes it on each call.
//
// Hyperliquid has no position id and no position history: only fills. Each
// fill carries `startPosition` (the signed position size BEFORE the fill), so
// round-trip trades are rebuilt by walking a coin's fills in time order: a
// trade opens when the position leaves 0 and closes when it returns to 0 (a
// fill that flips the side closes one trade and opens the next).
//
// Output rows follow the exchangeNormalize.js contract (see the header there):
//   • pnlFromExchange is GROSS of trading fees and `fees` is the positive fee,
//     so netPnl = pnlFromExchange − fees is the realized P&L, funding included
//     (like Bybit's closed P&L). Funding is ALSO reported on its own field.
//   • quantity in coin units, ISO dates, stopLoss 0 = unknown.
// externalId = `hl-<coin>-<tid of the opening fill>`: stable across re-syncs
// and shared by the OPEN row (/hl/positions) and the later CLOSED row of the
// same position, so the import upserts it instead of adding a second trade.
// (No ':' in the id — exchangeReconcile treats the part before ':' as a
// position-id root, which would make every Hyperliquid id match every other.)

import { buildExits, enrichWithOrders, withRisk } from './exchangeNormalize.js';

export const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const trim = (n) => (n ? +n.toPrecision(10) : 0);
const iso = (ms) => (ms > 0 ? new Date(ms).toISOString() : null);
// Size tolerance: Hyperliquid sizes are decimal strings, sums carry float noise.
const flat = (x) => Math.abs(x) < 1e-9;

export const isHlAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ''));

// Spot fills ("PURR/USDC", "@107") and their Buy/Sell dirs are not positions.
export const isPerpFill = (f) => {
  const coin = String(f?.coin || '');
  return !!coin && !coin.startsWith('@') && !coin.includes('/');
};

// Journal pair for a Hyperliquid coin. Perps are USDC-margined, but the app
// keys icons/prices/analytics on "<COIN>USDT" (every other venue's format),
// so the same convention keeps a BTC trade grouped with BTC trades elsewhere.
// kPEPE (1,000 PEPE per unit) → 1000PEPEUSDT, Bybit's name for the same unit.
// HIP-3 builder perps ("xyz:GOLD", stocks/commodities) keep the bare ticker.
export function hlPair(coin = '') {
  const c = String(coin);
  if (c.includes(':')) return c.split(':').pop().toUpperCase();
  const m = c.match(/^k([A-Z0-9]+)$/);
  if (m) return `1000${m[1]}USDT`;
  return `${c.toUpperCase()}USDT`;
}

const idCoin = (coin) => String(coin).replace(/[^A-Za-z0-9]/g, '_');
export const hlTradeId = (coin, tid) => `hl-${idCoin(coin)}-${tid}`;

// historicalOrders / frontendOpenOrders rows → the stop shape enrichWithOrders
// reads: { pair, direction, sl, tp, time }. A trigger order closes the
// position, so a SELL stop protects a long. Attached children of an entry
// order (TP/SL set on the order ticket) count too.
export function hlStopRows(rows = []) {
  const out = [];
  const add = (o, time) => {
    if (!o?.isTrigger || !isPerpFill(o)) return;
    const px = num(o.triggerPx);
    if (!(px > 0)) return;
    const type = String(o.orderType || '');
    const isStop = /stop/i.test(type);
    const isTp = /take profit/i.test(type);
    if (!isStop && !isTp) return;
    out.push({
      pair: hlPair(o.coin),
      direction: o.side === 'A' ? 'long' : 'short',
      sl: isStop ? px : 0,
      tp: isTp ? px : 0,
      time: parseInt(time ?? o.timestamp) || 0,
    });
  };
  for (const r of rows) {
    const o = r?.order || r;
    add(o, o?.timestamp);
    for (const c of o?.children || []) add(c, o.timestamp);
  }
  return out;
}

// One fill split into its closing and opening parts (a flip fill does both).
function part(f, size, total) {
  const ratio = total > 0 ? size / total : 0;
  return {
    px: num(f.px), sz: size, time: f.time, oid: f.oid, tid: f.tid,
    crossed: f.crossed === true, fee: num(f.fee) * ratio,
  };
}

function vwap(parts) {
  const sz = parts.reduce((s, p) => s + p.sz, 0);
  return sz > 0 ? parts.reduce((s, p) => s + p.px * p.sz, 0) / sz : 0;
}

const sizeKey = (x) => (Math.round(x * 1e8) / 1e8).toFixed(8);

/**
 * One coin's fills in execution order. Time alone isn't enough: one order that
 * sweeps the book produces many fills with the SAME millisecond and random
 * tids, so inside a same-ms group the order is rebuilt from the position
 * chain — each fill starts where the previous one ended.
 */
export function orderCoinFills(list = []) {
  const sorted = list.slice().sort((a, b) => a.time - b.time);
  const out = [];
  let cur = null; // running position after the last placed fill
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j < sorted.length && sorted[j].time === sorted[i].time) j++;
    let group = sorted.slice(i, j);
    i = j;
    if (group.length === 1) {
      out.push(group[0]);
      cur = num(group[0].startPosition) + (group[0].side === 'B' ? num(group[0].sz) : -num(group[0].sz));
      continue;
    }
    const endOf = (f) => num(f.startPosition) + (f.side === 'B' ? num(f.sz) : -num(f.sz));
    while (group.length) {
      let idx = cur == null ? -1 : group.findIndex((f) => sizeKey(num(f.startPosition)) === sizeKey(cur));
      if (idx < 0) {
        // Chain head: a fill no other fill of the group ends at.
        const ends = new Set(group.map((f) => sizeKey(endOf(f))));
        idx = group.findIndex((f) => !ends.has(sizeKey(num(f.startPosition))));
        if (idx < 0) idx = 0;
      }
      const [f] = group.splice(idx, 1);
      out.push(f);
      cur = endOf(f);
    }
  }
  return out;
}

/**
 * Rebuild round-trip trades from Hyperliquid fills (any order, any coins).
 *
 * @param fills    userFills / userFillsByTime rows
 * @param funding  userFunding rows ({ time, delta: { coin, usdc } }) — usdc is
 *                 the signed cash flow (positive = received)
 * @param stops    hlStopRows() output, for the ORIGINAL stop / TP
 * @returns { closed: [trade], open: Map(coin → { externalId, entryDate,
 *            direction, orderType }) } — closed trades newest-exit first;
 *            `open` is the still-running trip per coin (for /hl/positions).
 *
 * A coin whose first fill starts mid-position (it opened before the fetched
 * window) has an unknown entry, so that trip is skipped until the position is
 * flat again. Same when the walk loses sync with startPosition (a fill outside
 * the window): the trip is dropped rather than imported with wrong numbers.
 */
export function aggregateHlFills(fills = [], { funding = [], stops = [] } = {}) {
  const byCoin = new Map();
  for (const f of fills) {
    if (!isPerpFill(f)) continue;
    if (!byCoin.has(f.coin)) byCoin.set(f.coin, []);
    byCoin.get(f.coin).push(f);
  }
  const rows = [];
  for (const list of byCoin.values()) rows.push(...orderCoinFills(list));

  const fundingByCoin = new Map();
  for (const ev of funding) {
    const d = ev?.delta;
    if (!d || d.type !== 'funding' || !d.coin) continue;
    if (!fundingByCoin.has(d.coin)) fundingByCoin.set(d.coin, []);
    fundingByCoin.get(d.coin).push({ time: ev.time, usdc: num(d.usdc) });
  }

  const closed = [];
  const trips = new Map(); // coin → open trip
  const pos = new Map(); // coin → position size our walk expects (null = unknown)

  const openTrip = (coin, direction, p, firstTid) => ({
    coin, direction, opens: [p], closes: [], closedPnl: 0, fees: p.fee, firstTid,
  });

  const finish = (t) => {
    const qty = t.closes.reduce((s, p) => s + p.sz, 0);
    const entryMs = t.opens[0].time;
    const exitMs = t.closes[t.closes.length - 1].time;
    const fundingSum = (fundingByCoin.get(t.coin) || [])
      .filter((ev) => ev.time > entryMs && ev.time <= exitMs)
      .reduce((s, ev) => s + ev.usdc, 0);
    const feeSum = t.fees;
    const gross = t.closedPnl + fundingSum;
    // A net maker REBATE (negative fee) can't go in `fees` (the app takes
    // |fees|), so it is folded into the gross instead — net stays exact.
    const fees = feeSum >= 0 ? trim(feeSum) : 0;
    const pnlFromExchange = trim(feeSum >= 0 ? gross : gross - feeSum);
    // One exit slice per closing ORDER (an order filled in many pieces is one
    // take-profit, not many).
    const byOrder = new Map();
    for (const p of t.closes) {
      const k = String(p.oid ?? p.tid);
      const cur = byOrder.get(k) || { pxsz: 0, size: 0, time: p.time };
      cur.pxsz += p.px * p.sz; cur.size += p.sz; cur.time = Math.min(cur.time, p.time);
      byOrder.set(k, cur);
    }
    const exits = buildExits([...byOrder.values()].map((o) => ({ price: +(o.pxsz / o.size).toPrecision(10), size: o.size, time: o.time })));
    const externalId = hlTradeId(t.coin, t.firstTid);
    const trade = {
      pair: hlPair(t.coin),
      direction: t.direction,
      orderType: t.opens[0].crossed ? 'market' : 'limit',
      entryPrice: +vwap(t.opens).toPrecision(10),
      exitPrice: +vwap(t.closes).toPrecision(10),
      quantity: trim(qty),
      // Fills don't carry leverage; 1 = unknown (the app's default).
      leverage: 1,
      pnlFromExchange,
      fees,
      funding: trim(fundingSum),
      entryDate: iso(entryMs),
      exitDate: iso(exitMs),
      stopLoss: 0,
      tps: [],
      source: 'hyperliquid',
      externalId,
      positionId: externalId,
      ...(exits ? { exits } : {}),
    };
    closed.push(stops.length ? enrichWithOrders(trade, [], stops) : withRisk(trade));
  };

  for (const f of rows) {
    const coin = f.coin;
    const sz = num(f.sz);
    if (!(sz > 0)) continue;
    const start = num(f.startPosition);
    const signed = f.side === 'B' ? sz : -sz;
    const end = start + signed;
    let trip = trips.get(coin) || null;

    // Lost sync (missing fill) → the running trip's numbers can't be trusted.
    const expected = pos.get(coin);
    if (trip && (expected == null || Math.abs(expected - start) > Math.max(1e-9, Math.abs(start) * 1e-6))) {
      trips.delete(coin);
      trip = null;
    }
    pos.set(coin, end);

    if (!trip) {
      if (flat(start)) {
        // Fresh position.
        if (!flat(end)) trips.set(coin, openTrip(coin, signed > 0 ? 'long' : 'short', part(f, sz, sz), f.tid));
      } else if (!flat(end) && Math.sign(end) !== Math.sign(start)) {
        // Unknown-origin position flipped: only the new side is a known trip.
        const openSz = Math.abs(end);
        trips.set(coin, openTrip(coin, end > 0 ? 'long' : 'short', part(f, openSz, sz), f.tid));
      }
      continue;
    }

    const adding = Math.sign(signed) === Math.sign(start);
    if (adding) {
      const p = part(f, sz, sz);
      trip.opens.push(p);
      trip.fees += p.fee;
      continue;
    }

    // Reducing (and possibly flipping).
    const closeSz = Math.min(sz, Math.abs(start));
    const c = part(f, closeSz, sz);
    trip.closes.push(c);
    trip.fees += c.fee;
    trip.closedPnl += num(f.closedPnl);
    if (flat(end) || Math.sign(end) !== Math.sign(start)) {
      finish(trip);
      trips.delete(coin);
      const openSz = sz - closeSz;
      if (!flat(end) && openSz > 1e-12) {
        trips.set(coin, openTrip(coin, end > 0 ? 'long' : 'short', part(f, openSz, sz), f.tid));
      }
    }
  }

  closed.sort((a, b) => Date.parse(b.exitDate) - Date.parse(a.exitDate));
  const open = new Map();
  for (const [coin, t] of trips) {
    open.set(coin, {
      externalId: hlTradeId(coin, t.firstTid),
      entryDate: iso(t.opens[0].time),
      direction: t.direction,
      orderType: t.opens[0].crossed ? 'market' : 'limit',
    });
  }
  return { closed, open };
}

/**
 * clearinghouseState assetPositions[] row → the app's open-position row (the
 * same shape the other venues' /exchange/open-positions return).
 * `trip` is aggregateHlFills().open.get(coin) — it supplies the id shared with
 * the future closed row and the real entry time. `stops` (hlStopRows of the
 * open orders) supplies the current SL/TP.
 */
export function normalizeHlOpen(ap, trip = null, stops = []) {
  const p = ap?.position || ap || {};
  const szi = num(p.szi);
  const direction = szi < 0 ? 'short' : 'long';
  const pair = hlPair(p.coin);
  const entryPrice = num(p.entryPx);
  const quantity = trim(Math.abs(szi));
  const mine = stops.filter((s) => s.pair === pair && s.direction === direction).sort((a, b) => a.time - b.time);
  const sl = mine.find((s) => s.sl > 0)?.sl || 0;
  const tp = mine.find((s) => s.tp > 0)?.tp || 0;
  const liq = num(p.liquidationPx);
  return {
    pair,
    direction,
    entryPrice,
    quantity,
    leverage: num(p.leverage?.value) || 1,
    stopLoss: sl,
    positionSize: trim(quantity * entryPrice),
    fees: 0,
    status: 'open',
    source: 'hyperliquid',
    // No trip → the position opened before the fetched fills; the closed row
    // will then be matched by pair + direction + entry price (exchangeReconcile).
    externalId: trip?.direction === direction ? trip.externalId : `hl-${idCoin(p.coin)}-open`,
    orderType: trip?.orderType || 'market',
    entryDate: (trip?.direction === direction && trip.entryDate) || new Date().toISOString(),
    tps: tp > 0 ? [tp] : [],
    liquidationPrice: liq > 0 ? liq : null,
    unrealizedPnl: num(p.unrealizedPnl),
    // Terminal fields (see exchangeNormalize.js). positionValue is size × mark.
    markPrice: quantity > 0 && num(p.positionValue) > 0 ? +(num(p.positionValue) / quantity).toPrecision(10) : null,
    marginMode: p.leverage?.type === 'isolated' ? 'isolated' : (p.leverage?.type === 'cross' ? 'cross' : null),
    margin: num(p.marginUsed) > 0 ? num(p.marginUsed) : null,
    realizedPnl: null,
    feesPaid: null,
    // cumFunding counts what the account PAID; the app's sign is + = received.
    funding: p.cumFunding?.sinceOpen != null ? -num(p.cumFunding.sinceOpen) : null,
  };
}

/**
 * frontendOpenOrders rows → the terminal's open-order shape (the same one
 * worker/openOrders.js emits for the key-based venues):
 *   { id, exchange, pair, side: 'buy'|'sell', effect: 'open'|'close',
 *     positionSide: 'long'|'short', kind, orderType, price, triggerPrice,
 *     qty, filledQty, wholePosition, reduceOnly, createdAt, status }
 * A position TP/SL (isPositionTpsl) has size 0 = the whole position. TP/SL
 * attached to a resting entry order (children) are listed too, after it.
 */
export function normalizeHlOpenOrders(rows = []) {
  const out = [];
  const add = (o, parentId = null) => {
    if (!o || !isPerpFill(o)) return;
    const type = String(o.orderType || (o.isTrigger ? 'Trigger' : 'Limit'));
    const buy = o.side === 'B';
    const closing = o.reduceOnly === true || o.isPositionTpsl === true || parentId != null;
    const isTp = /take profit/i.test(type);
    const isStop = /stop/i.test(type);
    const kind = isTp ? 'take_profit'
      : isStop ? (closing ? 'stop_loss' : 'trigger')
        : o.isTrigger ? 'trigger'
          : /market/i.test(type) ? 'market' : 'limit';
    const sz = num(o.sz);
    const orig = num(o.origSz);
    const kids = Array.isArray(o.children) ? o.children : [];
    const childPx = (re) => num(kids.find((c) => re.test(String(c?.orderType || '')))?.triggerPx);
    out.push({
      id: `hl-${o.oid}`,
      exchange: 'hyperliquid',
      pair: hlPair(o.coin),
      side: buy ? 'buy' : 'sell',
      effect: closing ? 'close' : 'open',
      positionSide: closing ? (buy ? 'short' : 'long') : (buy ? 'long' : 'short'),
      kind,
      orderType: type,
      // A *Market trigger's limitPx is only the slippage cap, not a price.
      price: /market/i.test(type) ? 0 : num(o.limitPx),
      triggerPrice: o.isTrigger ? num(o.triggerPx) : 0,
      qty: sz,
      filledQty: orig > sz ? trim(orig - sz) : 0,
      wholePosition: o.isPositionTpsl === true || (closing && !(sz > 0)),
      reduceOnly: closing,
      createdAt: parseInt(o.timestamp) || 0,
      status: 'open',
      attachedTp: closing ? 0 : childPx(/take profit/i),
      attachedSl: closing ? 0 : childPx(/stop/i),
      ...(parentId ? { parentId } : {}),
    });
  };
  for (const r of rows) {
    const o = r?.order || r;
    add(o);
    for (const c of o?.children || []) add(c, `hl-${o.oid}`);
  }
  return out;
}

// ── Network ──────────────────────────────────────────────────────────────────

/** The address's resting orders (perps), in the terminal's order shape. */
export async function fetchHlOpenOrders(user, fetchImpl = fetch) {
  const rows = await hlInfo({ type: 'frontendOpenOrders', user }, fetchImpl);
  return normalizeHlOpenOrders(Array.isArray(rows) ? rows : []);
}

async function hlInfo(body, fetchImpl = fetch) {
  const r = await fetchImpl(HL_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Hyperliquid ${r.status}`);
  return r.json();
}

// Fills newest-capped: userFills (latest 2,000) without a window; with one,
// userFillsByTime pages forward (2,000 per page, ascending). Hyperliquid only
// serves the 10,000 most recent fills, so 5 pages is the real ceiling.
export async function fetchHlFills(user, sinceMs = 0, fetchImpl = fetch) {
  if (!(sinceMs > 0)) {
    const rows = await hlInfo({ type: 'userFills', user }, fetchImpl);
    return Array.isArray(rows) ? rows : [];
  }
  const seen = new Set();
  const out = [];
  let start = sinceMs;
  for (let page = 0; page < 5; page++) {
    const rows = await hlInfo({ type: 'userFillsByTime', user, startTime: start }, fetchImpl);
    if (!Array.isArray(rows) || !rows.length) break;
    let added = 0;
    for (const f of rows) {
      const k = `${f.tid}|${f.oid}|${f.hash}`;
      if (seen.has(k)) continue;
      seen.add(k); out.push(f); added++;
    }
    if (rows.length < 2000 || !added) break;
    // Re-ask from the last fill's ms (not +1) so a burst of same-ms fills split
    // across the page boundary isn't lost; duplicates are dropped above.
    start = rows[rows.length - 1].time;
  }
  return out;
}

// Funding payments since startMs (≤ 500 per page, ascending).
export async function fetchHlFunding(user, startMs, fetchImpl = fetch) {
  const out = [];
  let start = startMs;
  for (let page = 0; page < 10; page++) {
    const rows = await hlInfo({ type: 'userFunding', user, startTime: start }, fetchImpl);
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows);
    if (rows.length < 500) break;
    start = rows[rows.length - 1].time + 1;
  }
  return out;
}

// ── Routes ───────────────────────────────────────────────────────────────────
// GET /hl/trades?address=0x…&since=<ms>&limit=<n>  → { ok, trades }
// GET /hl/positions?address=0x…                      → { ok, positions, accountValue }
// Signed-in users only (Firebase token) + the per-user exchange throttle, so
// the routes can't be used as an open proxy. deps: { verifyToken(token) → uid,
// rateLimit(key, sec) → { count }, sessionFromDate(iso) }.
export async function handleHyperliquidRoute(request, url, cors, deps, fetchImpl = fetch) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  const path = url.pathname;
  if (path !== '/hl/trades' && path !== '/hl/positions') return json({ error: 'not found' }, 404);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  const uid = token ? await deps.verifyToken(token) : null;
  if (!uid) return json({ error: 'unauthorized' }, 401);
  const rl = await deps.rateLimit(`rl:exch:${uid}`, 60);
  if (rl?.count > 30) return json({ error: 'יותר מדי בקשות לבורסה. נסה שוב בעוד רגע.' }, 429);

  const address = (url.searchParams.get('address') || '').trim();
  if (!isHlAddress(address)) return json({ error: 'invalid_address', message: 'כתובת ארנק לא תקינה (0x + 40 תווים)' }, 400);
  const user = address.toLowerCase();
  const withSession = (t) => ({ ...t, session: deps.sessionFromDate ? deps.sessionFromDate(t.entryDate) : null });

  try {
    if (path === '/hl/positions') {
      const [state, fills, openOrders] = await Promise.all([
        hlInfo({ type: 'clearinghouseState', user }, fetchImpl),
        fetchHlFills(user, 0, fetchImpl).catch(() => []),
        hlInfo({ type: 'frontendOpenOrders', user }, fetchImpl).catch(() => []),
      ]);
      const { open } = aggregateHlFills(fills);
      const stops = hlStopRows(Array.isArray(openOrders) ? openOrders : []);
      const positions = (state?.assetPositions || [])
        .filter((ap) => !flat(num(ap?.position?.szi)))
        .map((ap) => withSession(normalizeHlOpen(ap, open.get(ap.position.coin), stops)));
      const accountValue = num(state?.marginSummary?.accountValue);
      // The open orders were fetched anyway (for SL/TP) — the terminal shows
      // them too, so it needs no second call for Hyperliquid.
      const orders = normalizeHlOpenOrders(Array.isArray(openOrders) ? openOrders : []);
      return json({ ok: true, positions, count: positions.length, accountValue, orders });
    }

    const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const fills = await fetchHlFills(user, since, fetchImpl);
    if (!fills.length) return json({ ok: true, trades: [] });
    const firstMs = fills.reduce((m, f) => Math.min(m, f.time || Infinity), Infinity);
    // Funding + order history are best-effort: without them a trade still
    // imports, just without funding / the original stop.
    const [funding, orders] = await Promise.all([
      fetchHlFunding(user, firstMs, fetchImpl).catch(() => []),
      hlInfo({ type: 'historicalOrders', user }, fetchImpl).catch(() => []),
    ]);
    const { closed } = aggregateHlFills(fills, { funding, stops: hlStopRows(Array.isArray(orders) ? orders : []) });
    let trades = closed;
    if (since > 0) trades = trades.filter((t) => Date.parse(t.entryDate) >= since);
    trades = trades.slice(0, since > 0 ? 1500 : limit).map(withSession);
    return json({ ok: true, trades });
  } catch (e) {
    return json({ error: `Hyperliquid: ${e?.message || e}` }, 502);
  }
}
