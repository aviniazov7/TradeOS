// Per-exchange mapping of raw exchange rows → the single trade shape the
// journal imports. Pure (no fetch / env) so every exchange can be unit-tested
// against its documented sample payload (see exchangeNormalize.test.js).
//
// The contract every CLOSED trade must meet — the same one the Bybit path was
// verified against on a real account:
//   • pnlFromExchange is GROSS of trading fees and `fees` is the positive fee,
//     so the app's netPnl = pnlFromExchange − fees equals the realized P&L the
//     exchange itself shows (funding included, like Bybit's closed P&L).
//   • quantity is in COIN units (contract-based venues are converted).
//   • entryDate / exitDate are ISO strings; stopLoss 0 = unknown.
// `session` is added by the caller (sessionFromDate lives in index.js).

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const has = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(parseFloat(v));
const iso = (ms) => (ms > 0 ? new Date(ms).toISOString() : null);
// Trim float-sum noise (0.02236326 + 0.02236284 → 0.0447261, not 0.04472610000000001).
const trim = (n) => (n ? +n.toPrecision(10) : 0);

// "BTC-USDT-SWAP" → "BTCUSDT"
const okxPair = (instId = '') => {
  const parts = instId.split('-');
  return parts.length >= 2 ? (parts[0] + parts[1]).toUpperCase() : instId.toUpperCase();
};

// Risk in $ and the realized R from a known stop — the same numbers the Bybit
// path derives. R is UNSIGNED: the app adds the sign from the P&L when shown.
export function withRisk(t) {
  const slDist = t.stopLoss > 0 ? Math.abs(t.entryPrice - t.stopLoss) : 0;
  return {
    ...t,
    riskAmount: slDist > 0 ? Number((slDist * t.quantity).toPrecision(6)) : 0,
    rrRatio: slDist > 0 && t.exitPrice > 0
      ? Number((Math.abs(t.exitPrice - t.entryPrice) / slDist).toFixed(2))
      : 0,
  };
}

// ── MEXC ─────────────────────────────────────────────────────────────────────
// history_positions row. `realised` is MEXC's realized P&L and is already NET
// of the trading fee (realised = closeProfitLoss − fee, see the documented
// sample) — the app subtracts `fees` again, so the fee is added back here.
// The fee is never taken from `holdFee`: that's FUNDING, signed (positive =
// received), and it is already inside `realised`.
export function mexcTradeFee(p) {
  for (const k of ['fee', 'totalFee', 'fees']) if (has(p[k])) return trim(Math.abs(num(p[k])));
  return 0;
}

// SL / TP per MEXC position, from rows that carry a positionId: filled
// orders (an SL/TP attached when opening) and TP/SL stop orders (set from the
// position panel — the common case). The EARLIEST value wins: that's the
// ORIGINAL stop. A stop later moved to break-even would make the risk ≈ 0 and
// the R absurd (the same rule the Bybit path uses).
// Returns Map(positionId → { sl, tp }).
export function mexcStopsByPosition(rows = []) {
  const best = new Map();
  for (const r of rows) {
    const id = r?.positionId != null ? String(r.positionId) : '';
    if (!id || id === '0') continue;
    const at = parseInt(r.createTime ?? r.updateTime) || Number.MAX_SAFE_INTEGER;
    const cur = best.get(id) || { sl: 0, slAt: Infinity, tp: 0, tpAt: Infinity };
    const sl = num(r.stopLossPrice);
    const tp = num(r.takeProfitPrice);
    if (sl > 0 && at < cur.slAt) { cur.sl = sl; cur.slAt = at; }
    if (tp > 0 && at < cur.tpAt) { cur.tp = tp; cur.tpAt = at; }
    best.set(id, cur);
  }
  const out = new Map();
  for (const [id, v] of best) if (v.sl > 0 || v.tp > 0) out.set(id, { sl: v.sl, tp: v.tp });
  return out;
}

// MEXC order types: 1 limit, 2 post-only maker, 3 IOC, 4 FOK (all priced
// orders → 'limit'), 5 market, 6 market-converted-to-limit → 'market'.
// null when the row has no orderType.
export function mexcOrderKind(orderType) {
  const n = parseInt(orderType);
  if (!Number.isFinite(n)) return null;
  return n === 5 || n === 6 ? 'market' : 'limit';
}

// Entry order type per position: the EARLIEST opening order (side 1 = open
// long, 3 = open short) that carries the positionId.
// Returns Map(positionId → 'limit' | 'market').
export function mexcEntryTypeByPosition(orders = []) {
  const first = new Map();
  for (const o of orders) {
    const side = parseInt(o?.side);
    if (side !== 1 && side !== 3) continue;
    const id = o.positionId != null ? String(o.positionId) : '';
    const kind = mexcOrderKind(o.orderType);
    if (!id || id === '0' || !kind) continue;
    const at = parseInt(o.createTime ?? o.updateTime) || Number.MAX_SAFE_INTEGER;
    const cur = first.get(id);
    if (!cur || at < cur.at) first.set(id, { kind, at });
  }
  return new Map([...first].map(([id, v]) => [id, v.kind]));
}

// ctx: { contractSize, entryDate, exitDate, externalId, sl, tp, orderType } — dates, order type and
// SL/TP come from the caller's order-history matching.
export function normalizeMexcClosed(p, ctx = {}) {
  const fees = mexcTradeFee(p);
  const realised = p.realised ?? p.realisedPnl ?? p.realised_pnl;
  const gross = has(realised)
    ? trim(num(realised) + fees)
    : num(p.closeProfitLoss); // closeProfitLoss is already gross
  const posType = parseInt(p.positionType ?? p.position_type);
  const sym = (p.symbol || '').replace(/_/g, '');
  return withRisk({
    pair: sym,
    direction: posType === 1 ? 'long' : 'short',
    orderType: ctx.orderType === 'limit' ? 'limit' : 'market',
    entryPrice: num(p.openAvgPrice ?? p.open_avg_price),
    exitPrice: num(p.closeAvgPrice ?? p.close_avg_price),
    // MEXC vol is in CONTRACTS — convert to coin units via contractSize.
    quantity: num(p.closeVol || p.close_vol || p.holdVol || p.hold_vol) * (ctx.contractSize || 1),
    leverage: num(p.leverage) || 1,
    pnlFromExchange: gross,
    fees,
    entryDate: ctx.entryDate,
    exitDate: ctx.exitDate,
    stopLoss: ctx.sl > 0 ? ctx.sl : num(p.stopLossPrice || p.stop_loss_price),
    tps: (ctx.tp > 0 ? ctx.tp : num(p.takeProfitPrice || p.take_profit_price)) > 0
      ? [ctx.tp > 0 ? ctx.tp : num(p.takeProfitPrice || p.take_profit_price)]
      : [],
    source: 'mexc',
    externalId: ctx.externalId,
  });
}

// ── OKX ──────────────────────────────────────────────────────────────────────
// positions-history row. Sizes are in CONTRACTS (XRP-USDT-SWAP: 1 contract =
// 100 XRP) → × ctVal for coin units. realizedPnl = pnl + fee + fundingFee +
// liqPenalty (fee/funding negative) is what OKX shows; gross = realizedPnl +
// |fee| so the app's net lands on exactly that figure.
//
// externalId: OKX REUSES a posId for later positions on the same instrument
// (it only expires 30 days after the last full close), so posId alone made a
// second BTC position "update" the first. The position's open time makes it
// unique per position.
export function normalizeOkxClosed(p, ctVal = 1) {
  const pair = okxPair(p.instId);
  const fees = trim(Math.abs(num(p.fee)));
  const gross = has(p.realizedPnl) ? trim(num(p.realizedPnl) + fees) : num(p.pnl);
  const entryMs = parseInt(p.cTime) || 0;
  const exitMs = parseInt(p.uTime) || 0;
  const entryDate = iso(entryMs) || iso(exitMs) || new Date().toISOString();
  const sl = num(p.slTriggerPx || p.slOrdPx);
  const tp = num(p.tpTriggerPx || p.tpOrdPx);
  return withRisk({
    pair,
    direction: p.direction === 'long' ? 'long' : 'short',
    entryPrice: num(p.openAvgPx),
    exitPrice: num(p.closeAvgPx),
    quantity: trim(num(p.closeTotalPos || p.openMaxPos) * (ctVal || 1)),
    leverage: num(p.lever) || 1,
    pnlFromExchange: gross,
    fees,
    entryDate,
    exitDate: iso(exitMs) || entryDate,
    stopLoss: sl,
    tps: tp > 0 ? [tp] : [],
    source: 'okx',
    externalId: p.posId ? `${p.posId}:${entryMs}` : `${pair}_${entryMs}`,
  });
}

// /account/positions row (open). `pos` is in contracts; an attached SL/TP
// lives in closeOrderAlgo[], not on the position itself.
export function normalizeOkxOpen(p, ctVal = 1) {
  const pair = okxPair(p.instId);
  const entryPrice = num(p.avgPx);
  const quantity = trim(Math.abs(num(p.pos)) * (ctVal || 1));
  const algo = Array.isArray(p.closeOrderAlgo) ? p.closeOrderAlgo : [];
  const sl = num(p.slTriggerPx) || num(algo.find((a) => has(a.slTriggerPx))?.slTriggerPx);
  const tp = num(p.tpTriggerPx) || num(algo.find((a) => has(a.tpTriggerPx))?.tpTriggerPx);
  const liq = num(p.liqPx);
  return {
    pair,
    direction: p.posSide === 'short' || num(p.pos) < 0 ? 'short' : 'long',
    entryPrice,
    quantity,
    leverage: num(p.lever) || 1,
    stopLoss: sl,
    positionSize: quantity * entryPrice,
    fees: 0,
    status: 'open',
    source: 'okx',
    externalId: String(p.posId || `${pair}_${p.cTime}`),
    orderType: 'market',
    entryDate: iso(parseInt(p.cTime)) || new Date().toISOString(),
    tps: tp > 0 ? [tp] : [],
    liquidationPrice: liq > 0 ? liq : null,
  };
}

// ── Bitget ───────────────────────────────────────────────────────────────────
// v2 mix history-position row. Field names per the documented sample:
// openAvgPrice / closeAvgPrice / openTotalPos / closeTotalPos / openFee /
// closeFee (negative) / netProfit (= pnl + fees + funding) / ctime / utime.
// (The old code read openPriceAvg / closePriceAvg — names from the OPEN
// positions endpoint — so every Bitget trade imported with price 0.)
export function normalizeBitgetClosed(p) {
  const pair = (p.symbol || '').replace(/_.*/, '').toUpperCase();
  const fees = trim(Math.abs(num(p.openFee)) + Math.abs(num(p.closeFee)))
    || trim(Math.abs(num(p.fee ?? p.totalFee)));
  const gross = has(p.netProfit) ? trim(num(p.netProfit) + fees) : num(p.pnl);
  const entryMs = parseInt(p.ctime ?? p.cTime) || 0;
  const exitMs = parseInt(p.utime ?? p.uTime) || 0;
  const entryDate = iso(entryMs) || iso(exitMs) || new Date().toISOString();
  const sl = num(p.presetStopLossPrice || p.stopLossPrice);
  const tp = num(p.presetStopSurplusPrice || p.takeProfitPrice);
  return withRisk({
    pair,
    direction: p.holdSide === 'long' ? 'long' : 'short',
    entryPrice: num(p.openAvgPrice ?? p.openPriceAvg),
    exitPrice: num(p.closeAvgPrice ?? p.closePriceAvg),
    quantity: num(p.closeTotalPos || p.openTotalPos || p.openSize),
    // Not in the history payload — 1 means "unknown" (the app's default).
    leverage: num(p.leverage) || 1,
    pnlFromExchange: gross,
    fees,
    entryDate,
    exitDate: iso(exitMs) || entryDate,
    stopLoss: sl,
    tps: tp > 0 ? [tp] : [],
    source: 'bitget',
    externalId: p.positionId || `${pair}_${entryMs}`,
  });
}

// ── API-key problems ─────────────────────────────────────────────────────────
// Turns an exchange's auth error into one reason the app can explain:
//   'key_expired' | 'key_invalid' | 'ip_blocked' | 'no_permission' | null
// by documented code first, message as fallback (codes are also parsed out of
// messages like "MEXC 402: Api_key expired"). MEXC keys without a linked IP
// expire after 90 days — the main case this exists for.
const AUTH_CODES = {
  key_expired: { mexc: [402], bybit: [33004] },
  ip_blocked: { mexc: [406], bybit: [10010], okx: [50110], bitget: [40018] },
  no_permission: { bybit: [10005], bitget: [40014] },
  key_invalid: {
    mexc: [401, 602], bybit: [10003, 10004], okx: [50105, 50111, 50113, 50119], bitget: [40006, 40009, 40012],
  },
};
const AUTH_PATTERNS = [
  ['key_expired', /expired/i],
  ['ip_blocked', /white\s?list|unmatched ip|invalid ip|ip.*not allowed/i],
  ['no_permission', /permission/i],
  ['key_invalid', /api.?key|access.?key|invalid sign|sign(ature)? (error|fail|verif)|verify failed|passphrase/i],
];

export function classifyExchangeAuthError(exchange, code, message = '') {
  const msg = String(message || '');
  let n = parseInt(code);
  if (!Number.isFinite(n)) {
    const m = msg.match(/\b(\d{3,5})\b/);
    n = m ? parseInt(m[1]) : NaN;
  }
  if (Number.isFinite(n)) {
    for (const [reason, byExchange] of Object.entries(AUTH_CODES)) {
      if ((byExchange[exchange] || []).includes(n)) return reason;
    }
  }
  for (const [reason, re] of AUTH_PATTERNS) if (re.test(msg)) return reason;
  return null;
}
