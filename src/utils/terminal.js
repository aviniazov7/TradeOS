// Pure helpers for the trading terminal (/terminal): TradingView symbol
// mapping, per-position live metrics (P&L, risk to stop, R in trade) and the
// panel totals. No React, no network — unit-tested in terminal.test.js.
import { LRM } from './formatters';
import { tradeExternalIds } from './tradeIds';

// Exchanges whose positions/orders the Worker can read (see exchangeConfig canSync).
export const TERMINAL_EXCHANGES = ['bybit', 'mexc', 'okx', 'bitget', 'hyperliquid'];

export const EXCHANGE_LABELS = {
  bybit: 'Bybit', mexc: 'MEXC', okx: 'OKX', bitget: 'Bitget', hyperliquid: 'Hyperliquid', binance: 'Binance',
};

// ── Charts ───────────────────────────────────────────────────────────────────
// Chart timeframes (TradingView interval codes), shortest first.
export const TIMEFRAMES = [
  { id: '1m', label: '1m', interval: '1' },
  { id: '5m', label: '5m', interval: '5' },
  { id: '15m', label: '15m', interval: '15' },
  { id: '30m', label: '30m', interval: '30' },
  { id: '1H', label: '1H', interval: '60' },
  { id: '4H', label: '4H', interval: '240' },
  { id: 'D', label: 'D', interval: 'D' },
  { id: 'W', label: 'W', interval: 'W' },
  { id: 'M', label: 'M', interval: 'M' },
];

export const tfById = (id) => TIMEFRAMES.find((t) => t.id === id) || TIMEFRAMES.find((t) => t.id === '4H');

// The widget's `style` codes: 0 bars (OHLC), 1 candles, 2 line, 9 hollow candles.
export const CHART_STYLES = [
  { id: '1', label: 'נרות' },
  { id: '0', label: 'ברים (OHLC)' },
  { id: '9', label: 'נרות חלולים' },
  { id: '2', label: 'קו' },
];
const STYLE_IDS = new Set(CHART_STYLES.map((s) => s.id));

// TradingView's perpetual listing per venue is "<PREFIX>:<PAIR>.P". Hyperliquid
// isn't on TradingView: its pairs already use Bybit's naming (BTCUSDT,
// 1000PEPEUSDT), so Bybit's chart is the closest match.
const TV_PREFIX = { bybit: 'BYBIT', okx: 'OKX', bitget: 'BITGET', mexc: 'MEXC', binance: 'BINANCE', hyperliquid: 'BYBIT' };

export function tvSymbol(pair, exchange) {
  const p = String(pair || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p) return 'BINANCE:BTCUSDT.P';
  // Not a USDT/USDC perp (a Hyperliquid HIP-3 market like GOLD / TSLA):
  // let TradingView resolve the bare ticker.
  if (!/(USDT|USDC)$/.test(p)) return p;
  return `${TV_PREFIX[exchange] || 'BINANCE'}:${p}.P`;
}

// The free Advanced Chart widget as a plain iframe — the same
// s.tradingview.com/embed-widget origin the coin-analysis page embeds, so no
// script tag and no CSP change are needed.
//   style      a CHART_STYLES id ('1' candles by default)
//   black      dark theme on pure black instead of the app's near-black panel
//   drawTools  show the left drawing toolbar (hidden by default)
export function tvChartUrl({ symbol, interval = 'D', theme = 'dark', timezone, style = '1', black = false, drawTools = false } = {}) {
  const dark = theme !== 'light';
  const config = {
    autosize: true,
    symbol,
    interval,
    timezone: timezone || 'Etc/UTC',
    theme: dark ? 'dark' : 'light',
    style: STYLE_IDS.has(String(style)) ? String(style) : '1',
    locale: 'en',
    allow_symbol_change: true,
    hide_side_toolbar: !drawTools,
    hide_volume: false,
    save_image: false,
    calendar: false,
    withdateranges: false,
    backgroundColor: dark ? (black ? 'rgba(0, 0, 0, 1)' : 'rgba(10, 10, 12, 1)') : 'rgba(255, 255, 255, 1)',
    gridColor: dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.06)',
    support_host: 'https://www.tradingview.com',
  };
  return `https://s.tradingview.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(JSON.stringify(config))}`;
}

// ── Orders ───────────────────────────────────────────────────────────────────
export const ORDER_KIND_LABELS = {
  limit: 'לימיט',
  market: 'מרקט',
  stop_loss: 'סטופ לוס',
  take_profit: 'טייק פרופיט',
  trailing: 'טריילינג',
  trigger: 'טריגר',
};

const samePosition = (o, p) => o.exchange === p.source && o.pair === p.pair && (!o.positionSide || o.positionSide === p.direction);

/** Resting orders that belong to a position (same venue + pair + side). */
export function ordersForPosition(position, orders = []) {
  return orders.filter((o) => o.effect === 'close' && samePosition(o, position));
}

/**
 * The stop that protects a position: its own SL when the venue reports one,
 * else a stop-loss order for it — a whole-position stop first, otherwise the
 * one nearest the price (the first to fire). 0 = no stop.
 */
export function stopForPosition(position, orders = [], mark = 0) {
  if (position.stopLoss > 0) return position.stopLoss;
  const stops = ordersForPosition(position, orders).filter((o) => o.kind === 'stop_loss' && o.triggerPrice > 0);
  if (!stops.length) return 0;
  const whole = stops.find((o) => o.wholePosition);
  if (whole) return whole.triggerPrice;
  const ref = mark > 0 ? mark : position.entryPrice;
  return stops.slice().sort((a, b) => Math.abs(a.triggerPrice - ref) - Math.abs(b.triggerPrice - ref))[0].triggerPrice;
}

/** First take-profit level: the position's own TP, else the nearest TP order. */
export function takeProfitForPosition(position, orders = [], mark = 0) {
  const own = (position.tps || []).map(Number).find((v) => v > 0);
  if (own) return own;
  const tps = ordersForPosition(position, orders).filter((o) => o.kind === 'take_profit' && o.triggerPrice > 0);
  if (!tps.length) return 0;
  const ref = mark > 0 ? mark : position.entryPrice;
  return tps.slice().sort((a, b) => Math.abs(a.triggerPrice - ref) - Math.abs(b.triggerPrice - ref))[0].triggerPrice;
}

// ── Journal link ─────────────────────────────────────────────────────────────
/**
 * The journal's open trade for a live position: by exchange id first, then by
 * venue + pair + direction (a manually logged trade has no id). Its stop is
 * the ORIGINAL one — the R-in-trade denominator — since the live stop may
 * have been trailed since.
 */
export function journalTradeForPosition(position, openTrades = []) {
  const open = openTrades.filter((t) => t && t.status === 'open');
  const byId = position.externalId
    ? open.find((t) => tradeExternalIds(t).includes(position.externalId))
    : null;
  if (byId) return byId;
  return open.find((t) => String(t.source || '').toLowerCase() === position.source
    && String(t.pair || '').toUpperCase() === position.pair && t.direction === position.direction) || null;
}

// ── Position metrics ─────────────────────────────────────────────────────────
const fin = (v) => (Number.isFinite(v) ? v : null);

/**
 * A public (Bybit) mark for the pair is only trusted when it agrees with the
 * position: within 3% of the venue's own mark, or — without one (MEXC) —
 * within 50% of the entry. Guards against a same-named market quoted in a
 * different unit. Returns the price or 0.
 */
export function saneLiveMark(position, live) {
  const lm = Number(live) || 0;
  if (!(lm > 0)) return 0;
  const venueMark = Number(position?.markPrice) || 0;
  if (venueMark > 0) return Math.abs(lm / venueMark - 1) <= 0.03 ? lm : 0;
  const entry = Number(position?.entryPrice) || 0;
  if (entry > 0) return Math.abs(lm / entry - 1) <= 0.5 ? lm : 0;
  return lm;
}

/**
 * Live numbers for one position.
 *   liveMark    a fresher price than the last poll (public ticker), optional
 *   orders      the venue's open orders (for an SL/TP set as an order)
 *   journalTrade the matching open journal trade (original stop), optional
 * → { mark, value, upnl, upnlPct (on margin), movePct, margin, stop, tp,
 *     riskUsd (loss from entry to the stop; ≤ 0 = stop at/beyond entry),
 *     initialStop, initialRiskUsd, rMultiple, liqDistancePct, stopSource }
 */
export function positionMetrics(position, { liveMark = 0, orders = [], journalTrade = null } = {}) {
  const p = position;
  const dir = p.direction === 'short' ? -1 : 1;
  const qty = Number(p.quantity) || 0;
  const entry = Number(p.entryPrice) || 0;
  const mark = liveMark > 0 ? liveMark : (p.markPrice > 0 ? p.markPrice : 0);

  let upnl = null;
  if (liveMark > 0 && entry > 0 && qty > 0) upnl = (liveMark - entry) * qty * dir;
  else if (p.unrealizedPnl != null && Number.isFinite(Number(p.unrealizedPnl))) upnl = Number(p.unrealizedPnl);
  else if (mark > 0 && entry > 0) upnl = (mark - entry) * qty * dir;

  const value = (mark > 0 ? mark : entry) * qty;
  const lev = Number(p.leverage) > 0 ? Number(p.leverage) : 1;
  const margin = p.margin > 0 ? Number(p.margin) : (entry * qty) / lev;
  const upnlPct = upnl != null && margin > 0 ? (upnl / margin) * 100 : null;
  const movePct = mark > 0 && entry > 0 ? ((mark - entry) / entry) * 100 * dir : null;

  const ownStop = p.stopLoss > 0;
  const stop = stopForPosition(p, orders, mark);
  const tp = takeProfitForPosition(p, orders, mark);
  const riskUsd = stop > 0 && entry > 0 ? (entry - stop) * qty * dir : null;

  const jStop = Number(journalTrade?.stopLoss) || 0;
  const jStopValid = jStop > 0 && (dir === 1 ? jStop < entry : jStop > entry);
  const initialStop = jStopValid ? jStop : stop;
  const initialRiskUsd = initialStop > 0 && entry > 0 ? (entry - initialStop) * qty * dir : null;
  const rMultiple = upnl != null && initialRiskUsd > 0 ? upnl / initialRiskUsd : null;

  const liq = Number(p.liquidationPrice) || 0;
  const liqDistancePct = liq > 0 && mark > 0 ? (Math.abs(mark - liq) / mark) * 100 : null;

  return {
    mark: mark || null,
    value,
    upnl: fin(upnl),
    upnlPct: fin(upnlPct),
    movePct: fin(movePct),
    margin,
    stop,
    tp,
    stopSource: ownStop ? 'position' : stop > 0 ? 'order' : null,
    riskUsd: fin(riskUsd),
    initialStop,
    initialRiskUsd: fin(initialRiskUsd),
    rMultiple: fin(rMultiple),
    liqDistancePct: fin(liqDistancePct),
  };
}

/** Panel totals: notional, unrealized, margin, open risk (Σ positive risk). */
export function positionTotals(rows = []) {
  let value = 0; let upnl = 0; let margin = 0; let risk = 0; let anyUpnl = false;
  for (const { m } of rows) {
    value += m.value || 0;
    margin += m.margin || 0;
    if (m.upnl != null) { upnl += m.upnl; anyUpnl = true; }
    if (m.riskUsd > 0) risk += m.riskUsd;
  }
  return { value, upnl: anyUpnl ? upnl : null, margin, risk, upnlPct: anyUpnl && margin > 0 ? (upnl / margin) * 100 : null };
}

// ── Formatting ───────────────────────────────────────────────────────────────
/** Sign → the P&L color token class. */
export const pnlTone = (v) => (v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-secondary');

/** Price with magnitude-aware precision, no $ (exchange-style). */
export function fmtPx(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '—';
  const abs = Math.abs(n);
  const d = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 8;
  return n.toLocaleString('en-US', { minimumFractionDigits: abs >= 1000 ? 1 : 2, maximumFractionDigits: d });
}

/** Coin quantity: up to 6 significant decimals, grouped. */
export function fmtQty(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '—';
  const abs = Math.abs(n);
  const d = abs >= 1000 ? 0 : abs >= 1 ? 3 : 6;
  return n.toLocaleString('en-US', { maximumFractionDigits: d });
}

/** $ amount; signed: true adds +/− (with the LRM so RTL keeps the sign in front). */
export function fmtUsd(v, { signed = false, compact = false } = {}) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  let body;
  if (compact && abs >= 1e6) body = `${(abs / 1e6).toFixed(2)}M`;
  else if (compact && abs >= 1e5) body = `${(abs / 1e3).toFixed(1)}K`;
  else body = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = signed ? (n > 0 ? '+' : n < 0 ? '-' : '') : (n < 0 ? '-' : '');
  return `${LRM}${sign}$${body}`;
}

export function fmtPct(v, digits = 2) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '—';
  return `${LRM}${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(digits)}%`;
}

export function fmtR(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '—';
  return `${LRM}${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(2)}R`;
}

/** "לפני 12 שנ׳" / "לפני 3 דק׳" for the last-updated stamp. */
export function agoLabel(ts, now = Date.now()) {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'עכשיו';
  if (s < 60) return `לפני ${s} שנ׳`;
  const m = Math.round(s / 60);
  if (m < 60) return `לפני ${m} דק׳`;
  return `לפני ${Math.round(m / 60)} שע׳`;
}
