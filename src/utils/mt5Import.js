// Vantage has no retail API. Trades come from a MetaTrader 5 history report
// (History → right click → Report → HTML or Excel; CSV is accepted too).
//
// The Positions table is one row per ticket (open time/price and close
// time/price). The Deals table is the fallback when Positions is missing:
// "in" / "out" fills are paired FIFO into round-trips. When both tables
// exist, Positions wins so a deal is not imported twice.
//
// Mapping onto the same shape the exchange sync writes:
//   pair, direction, quantity, entry/exit price and time, fees, pnlFromExchange,
//   status open|closed, source 'Vantage (MT5)', externalId mt5-<ticket>.
// Quantity is the MT5 volume converted to price units (so position size,
// percent and risk match the broker's dollar P&L). `lots` keeps the raw
// volume. Fees are the costs (negative commission / swap); credits stay
// inside the gross P&L, so net = Profit + Commission + Swap.
// Re-upload identity is the position ticket (`externalId`), not the file name.

import { parseDate, parseNumber } from './csvImport';
import { tradeExternalIds } from './tradeIds';

export const VANTAGE_MT5_SOURCE = 'Vantage (MT5)';

export const MT5_IMPORT_ERRORS = {
  empty: 'הקובץ ריק.',
  unrecognized: 'הקובץ לא מזוהה כדוח MetaTrader 5. בטרמינל: History → לחיצה ימנית → Report, ושמור כ-HTML או Excel.',
  noTrades: 'הדוח נקרא, אבל לא נמצאו עסקאות בטבלאות Positions או Deals.',
  readFailed: 'לא הצלחנו לקרוא את הקובץ. נסה דוח HTML, Excel ‏(.xlsx) או CSV.',
};

const EPS = 1e-8;

function fail(code) {
  return { ok: false, code, error: MT5_IMPORT_ERRORS[code] || MT5_IMPORT_ERRORS.unrecognized, trades: [] };
}

function round(n, dp = 8) {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function numOr0(n) {
  return Number.isFinite(n) ? n : 0;
}

export function formatLots(n) {
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(2);
  if (Math.abs(n - Number(s)) < 1e-8) return s;
  return String(Number(n.toFixed(8)));
}

/** "EURUSD.raw" / "XAUUSD+" → "EURUSD" / "XAUUSD". */
export function normalizeMt5Symbol(raw) {
  let s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  const dot = s.indexOf('.');
  if (dot > 0) s = s.slice(0, dot);
  s = s.replace(/[+#!]+$/g, '');
  s = s.replace(/[^A-Z0-9]/g, '');
  return s.slice(0, 30);
}

function normalizeSide(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'buy' || s === 'long' || s === 'קנייה' || s === 'קניה') return 'long';
  if (s === 'sell' || s === 'short' || s === 'מכירה') return 'short';
  return null;
}

function normalizeDealDirection(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/[\s/_-]+/g, '');
  if (s === 'in' || s === 'כניסה' || s === 'entry') return 'in';
  if (s === 'out' || s === 'יציאה' || s === 'exit') return 'out';
  if (s === 'inout' || s === 'outin') return 'inout';
  return null;
}

function cleanTicket(raw) {
  const s = String(raw ?? '').trim().replace(/\.0+$/, '').replace(/\s+/g, '');
  return /^\d{3,20}$/.test(s) ? s : '';
}

function parseVolume(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return NaN;
  const n = parseNumber(s.split('/')[0]);
  return Number.isFinite(n) ? Math.abs(n) : NaN;
}

function excelSerialToDate(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const u = new Date(ms);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
}

export function parseMt5Date(val) {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'number' && val > 20000 && val < 80000) return excelSerialToDate(val);
  const s0 = String(val ?? '').trim();
  if (!s0 || s0 === '0' || /^1970[./-]01[./-]01/.test(s0)) return null;
  if (/^\d{5}(\.\d+)?$/.test(s0)) {
    const n = Number(s0);
    if (n > 20000 && n < 80000) return excelSerialToDate(n);
  }
  const s = s0.replace(/(\d{2}:\d{2}:\d{2})\.\d+$/, '$1');
  const d = parseDate(s);
  return d && !isNaN(d.getTime()) ? d : null;
}

function cellStr(v) {
  if (v == null) return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}.${p(v.getMonth() + 1)}.${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(12)));
  }
  return String(v).replace(/\u00a0/g, ' ').replace(/\u200e|\u200f/g, '').trim();
}

// Contract size (units per 1.00 lot) when the row has no price move to infer
// from. Closed trades prefer Profit / price-move, which matches the broker.
function lotSize(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (/^XAU/.test(s)) return 100;
  if (/^XAG/.test(s)) return 5000;
  if (/^XPT/.test(s) || /^XPD/.test(s)) return 100;
  if (/^[A-Z]{6}$/.test(s)) return 100000;
  if (/^(BTC|ETH)/.test(s)) return 1;
  return null;
}

// Profit / price-move is the position size in price units only when the
// quote currency is the account currency. That holds for XXXUSD (EURUSD,
// XAUUSD). USDJPY's price is in yen, so a USD profit must not be divided by
// it — those pairs use the contract-size table instead. Indices have no
// table, so the broker's own profit is the size.
function quoteIsUsd(symbol) {
  const s = String(symbol || '');
  return s.endsWith('USD') && !s.startsWith('USD');
}

function inferUnits({ symbol, lots, direction, entry, exit, profit }) {
  let inferred = 0;
  if (lots > 0 && entry > 0 && exit > 0 && profit != null && profit !== 0) {
    const move = direction === 'long' ? exit - entry : entry - exit;
    if (move !== 0 && Math.sign(move) === Math.sign(profit)) {
      const units = profit / move;
      const perLot = units / lots;
      if (units > 0 && perLot >= 1e-4 && perLot <= 1e8) inferred = round(units);
    }
  }
  const per = lotSize(symbol);
  if (inferred && (quoteIsUsd(symbol) || !per)) return inferred;
  if (per && lots > 0) return round(lots * per);
  if (inferred) return inferred;
  return lots > 0 ? round(lots) : 0;
}

function feesAndGross(commission, swap, extraFee, profit) {
  let fees = 0;
  let credits = 0;
  for (const n of [commission, swap, extraFee]) {
    if (!Number.isFinite(n) || n === 0) continue;
    if (n < 0) fees -= n;
    else credits += n;
  }
  return {
    fees: round(fees),
    pnlFromExchange: round((Number.isFinite(profit) ? profit : 0) + credits),
  };
}

function riskFields(entry, exit, sl, units) {
  const slDist = sl > 0 ? Math.abs(entry - sl) : 0;
  return {
    riskAmount: slDist > 0 && units > 0 ? round(slDist * units, 6) : 0,
    rrRatio: slDist > 0 && exit > 0 ? round(Math.abs(exit - entry) / slDist, 2) : 0,
  };
}

function buildTrade({
  symbol, direction, lots, units, entryPrice, exitPrice, entryDate, exitDate,
  stopLoss, takeProfit, commission, swap, extraFee, profit, isOpen, ticket,
}) {
  const qty = units > 0 ? units : lots;
  if (!(qty > 0) || !(entryPrice > 0)) return null;
  const money = feesAndGross(commission, swap, extraFee, isOpen ? 0 : (profit ?? 0));
  const sl = stopLoss > 0 ? stopLoss : 0;
  const risk = riskFields(entryPrice, isOpen ? 0 : exitPrice, sl, qty);
  const trade = {
    pair: symbol,
    direction,
    quantity: qty,
    lots,
    entryPrice,
    exitPrice: isOpen ? 0 : exitPrice,
    stopLoss: sl,
    originalStopLoss: sl,
    tps: takeProfit > 0 ? [takeProfit] : [],
    fees: money.fees,
    entryDate: entryDate.toISOString(),
    exitDate: !isOpen && exitDate ? exitDate.toISOString() : null,
    status: isOpen ? 'open' : 'closed',
    _isOpen: !!isOpen,
    source: VANTAGE_MT5_SOURCE,
    externalId: `mt5-${ticket}`,
    ticket: String(ticket),
    leverage: 1,
    orderType: 'market',
    positionSize: round(entryPrice * qty),
    riskAmount: risk.riskAmount,
    rrRatio: risk.rrRatio,
    notes: `${formatLots(lots)} לוט · טיקט ${ticket}`,
  };
  if (!isOpen) trade.pnlFromExchange = money.pnlFromExchange;
  return trade;
}

const normHead = (h) => String(h || '')
  .replace(/\u00a0/g, ' ')
  .toLowerCase()
  .replace(/[\s_./\\-]+/g, '')
  .replace(/[()]/g, '');

const OPEN_TIME = new Set(['time', 'opentime', 'זמן', 'תאריך', 'זמןפתיחה']);
const CLOSE_TIME = new Set(['closetime', 'זמןסגירה', 'תאריךסגירה']);
const POSITION = new Set(['position', 'ticket', 'positionid', 'פוזיציה', 'טיקט']);
const SYMBOL = new Set(['symbol', 'instrument', 'item', 'סימבול', 'סימול', 'נכס']);
const TYPE = new Set(['type', 'side', 'סוג']);
const VOLUME = new Set(['volume', 'lots', 'vol', 'size', 'נפח', 'כמות', 'לוטים']);
const OPEN_PRICE = new Set(['openprice', 'entryprice', 'מחירפתיחה', 'מחירכניסה']);
const CLOSE_PRICE = new Set(['closeprice', 'exitprice', 'מחירסגירה', 'מחיריציאה']);
const MARKET = new Set(['marketprice', 'מחירשוק']);
const SL = new Set(['sl', 'stoploss', 'stoplossprice', 'סטופ', 'סטופלוס']);
const TP = new Set(['tp', 'takeprofit', 'takeprofitprice', 'טייקפרופיט', 'יעד']);
const COMMISSION = new Set(['commission', 'comm', 'עמלה', 'עמלות']);
const FEE = new Set(['fee', 'fees']);
const SWAP = new Set(['swap', 'סוואפ', 'החלף']);
const PROFIT = new Set(['profit', 'pnl', 'רווח', 'רווחהפסד']);
const DEAL = new Set(['deal', 'דיל']);
const DIRECTION = new Set(['direction', 'כיוון']);
const ORDER = new Set(['order', 'פקודה']);

function mapHeaders(headers) {
  const map = {};
  let timeN = 0;
  let priceN = 0;
  headers.forEach((h, i) => {
    const n = normHead(h);
    if (!n) return;
    const take = (key) => { if (map[key] == null) map[key] = i; };
    if (CLOSE_TIME.has(n)) { map.closeTime = i; return; }
    if (OPEN_TIME.has(n)) {
      timeN += 1;
      if (timeN === 1) map.openTime = i;
      else if (map.closeTime == null) map.closeTime = i;
      return;
    }
    if (POSITION.has(n)) return take('position');
    if (DEAL.has(n)) return take('deal');
    if (ORDER.has(n)) return take('order');
    if (DIRECTION.has(n)) return take('direction');
    if (SYMBOL.has(n)) return take('symbol');
    if (TYPE.has(n)) return take('type');
    if (VOLUME.has(n)) return take('volume');
    if (CLOSE_PRICE.has(n)) { map.closePrice = i; return; }
    if (OPEN_PRICE.has(n)) { map.openPrice = i; return; }
    if (MARKET.has(n)) { map.marketPrice = i; return; }
    if (n === 'price' || n === 'מחיר') {
      priceN += 1;
      if (priceN === 1) map.openPrice = i;
      else if (map.closePrice == null) map.closePrice = i;
      return;
    }
    if (SL.has(n)) return take('sl');
    if (TP.has(n)) return take('tp');
    if (COMMISSION.has(n)) return take('commission');
    if (FEE.has(n)) return take('fee');
    if (SWAP.has(n)) return take('swap');
    if (PROFIT.has(n)) return take('profit');
  });
  return map;
}

function isPositionsHeader(map) {
  return map.position != null && map.symbol != null && map.type != null
    && map.volume != null && map.openPrice != null && map.direction == null;
}

function isDealsHeader(map) {
  return map.direction != null && map.symbol != null && map.volume != null
    && map.openPrice != null && map.type != null;
}

function sectionKind(text) {
  const t = String(text || '').trim().toLowerCase().replace(/:$/, '').replace(/\s+/g, ' ');
  if (t === 'positions' || t === 'closed positions' || t === 'פוזיציות') return 'positions';
  if (t === 'open positions' || t === 'פוזיציות פתוחות') return 'openPositions';
  if (t === 'deals' || t === 'עסקאות') return 'deals';
  if (t === 'orders' || t === 'working orders' || t === 'פקודות') return 'orders';
  return null;
}

function sectionTitle(row) {
  const cells = row.map((c) => String(c || '').trim()).filter(Boolean);
  if (cells.length !== 1) return null;
  return sectionKind(cells[0]);
}

function positionFromRow({ row, map, forceOpen }) {
  const get = (k) => (map[k] == null ? '' : row[map[k]] ?? '');
  const symbol = normalizeMt5Symbol(get('symbol'));
  const direction = normalizeSide(get('type'));
  const ticket = cleanTicket(get('position'));
  const lots = parseVolume(get('volume'));
  const entryPrice = parseNumber(get('openPrice'));
  const entryDate = parseMt5Date(get('openTime'));
  if (!symbol || !direction || !ticket || !(lots > 0) || !(entryPrice > 0) || !entryDate) return null;

  const sl = parseNumber(get('sl'));
  const tp = parseNumber(get('tp'));
  const closePrice = parseNumber(get('closePrice'));
  const closeDate = parseMt5Date(get('closeTime'));
  const market = parseNumber(get('marketPrice'));
  const commission = numOr0(parseNumber(get('commission')));
  const swap = numOr0(parseNumber(get('swap')));
  const fee = numOr0(parseNumber(get('fee')));
  const profitCell = String(get('profit') ?? '').trim();
  const profit = profitCell === '' ? null : numOr0(parseNumber(profitCell));
  const isOpen = !!forceOpen || !closeDate || !(closePrice > 0);
  const units = inferUnits({
    symbol, lots, direction, entry: entryPrice,
    exit: isOpen ? (market > 0 ? market : 0) : closePrice,
    profit,
  });
  return buildTrade({
    symbol, direction, lots, units,
    entryPrice,
    exitPrice: closePrice > 0 ? closePrice : 0,
    entryDate,
    exitDate: closeDate,
    stopLoss: sl > 0 ? sl : 0,
    takeProfit: tp > 0 ? tp : 0,
    commission, swap, extraFee: fee,
    profit: profit ?? 0,
    isOpen,
    ticket,
  });
}

function dealsToTrades(items) {
  const normalized = [];
  for (const { row, map } of items) {
    const get = (k) => (map[k] == null ? '' : row[map[k]] ?? '');
    const typeRaw = String(get('type') || '').trim().toLowerCase();
    if (['balance', 'credit', 'correction', 'deposit', 'withdrawal'].includes(typeRaw)) continue;
    const side = normalizeSide(get('type'));
    const how = normalizeDealDirection(get('direction'));
    if (!side || !how) continue;
    const symbol = normalizeMt5Symbol(get('symbol'));
    const lots = parseVolume(get('volume'));
    const price = parseNumber(get('openPrice'));
    const time = parseMt5Date(get('openTime'));
    const ticket = cleanTicket(get('position')) || cleanTicket(get('deal')) || cleanTicket(get('order'));
    if (!symbol || !(lots > 0) || !(price > 0) || !time || !ticket) continue;
    normalized.push({
      side, how, symbol, lots, price, time, ticket,
      commission: numOr0(parseNumber(get('commission'))),
      fee: numOr0(parseNumber(get('fee'))),
      swap: numOr0(parseNumber(get('swap'))),
      profit: numOr0(parseNumber(get('profit'))),
    });
  }
  normalized.sort((a, b) => a.time - b.time || a.ticket.localeCompare(b.ticket));

  const opens = [];
  for (const d of normalized) {
    const want = d.side === 'long' ? 'short' : 'long';
    const canClose = opens.some((o) => o.symbol === d.symbol && o.direction === want && o.remaining > EPS);
    const opening = d.how === 'in' || (d.how === 'inout' && !canClose);
    if (opening) {
      opens.push({
        symbol: d.symbol, direction: d.side, remaining: d.lots, lots: d.lots,
        entryPrice: d.price, entryDate: d.time, ticket: d.ticket,
        commission: d.commission, fee: d.fee, swap: d.swap, profit: d.profit, parts: [],
      });
      continue;
    }
    let left = d.lots;
    const hits = [];
    while (left > EPS) {
      const idx = opens.findIndex((o) => o.symbol === d.symbol && o.direction === want && o.remaining > EPS);
      if (idx < 0) break;
      const take = Math.min(opens[idx].remaining, left);
      opens[idx].remaining -= take;
      left -= take;
      hits.push({ open: opens[idx], take });
    }
    const taken = hits.reduce((s, h) => s + h.take, 0);
    if (!(taken > 0)) continue;
    for (const h of hits) {
      const share = h.take / taken;
      h.open.parts.push({
        volume: h.take, price: d.price, time: d.time,
        commission: d.commission * share, fee: d.fee * share,
        swap: d.swap * share, profit: d.profit * share,
      });
    }
  }

  const trades = [];
  for (const o of opens) {
    const closedVol = o.parts.reduce((s, p) => s + p.volume, 0);
    if (!(closedVol > EPS)) {
      const units = inferUnits({
        symbol: o.symbol, lots: o.lots, direction: o.direction, entry: o.entryPrice, exit: 0, profit: null,
      });
      const t = buildTrade({
        symbol: o.symbol, direction: o.direction, lots: o.lots, units,
        entryPrice: o.entryPrice, exitPrice: 0, entryDate: o.entryDate, exitDate: null,
        stopLoss: 0, takeProfit: 0,
        commission: o.commission, swap: o.swap, extraFee: o.fee, profit: 0,
        isOpen: true, ticket: o.ticket,
      });
      if (t) trades.push(t);
      continue;
    }
    const fully = o.remaining <= EPS;
    const lots = fully ? o.lots : closedVol;
    const exitPrice = o.parts.reduce((s, p) => s + p.price * p.volume, 0) / closedVol;
    const exitDate = o.parts[o.parts.length - 1].time;
    const commission = o.commission + o.parts.reduce((s, p) => s + p.commission, 0);
    const fee = o.fee + o.parts.reduce((s, p) => s + p.fee, 0);
    const swap = o.swap + o.parts.reduce((s, p) => s + p.swap, 0);
    const profit = o.profit + o.parts.reduce((s, p) => s + p.profit, 0);
    const units = inferUnits({
      symbol: o.symbol, lots, direction: o.direction, entry: o.entryPrice, exit: exitPrice, profit,
    });
    const t = buildTrade({
      symbol: o.symbol, direction: o.direction, lots, units,
      entryPrice: o.entryPrice, exitPrice, entryDate: o.entryDate, exitDate,
      stopLoss: 0, takeProfit: 0,
      commission, swap, extraFee: fee, profit,
      isOpen: false, ticket: o.ticket,
    });
    if (t) trades.push(t);
  }
  return trades;
}

function dedupeTrades(trades) {
  const byId = new Map();
  for (const t of trades) {
    const prev = byId.get(t.externalId);
    if (!prev || (prev.status === 'open' && t.status === 'closed')) byId.set(t.externalId, t);
  }
  return [...byId.values()];
}

/** Rows of cells (already strings or raw xlsx values) → import result. */
export function parseMt5Grid(rawRows) {
  const rows = (rawRows || []).map((r) => (Array.isArray(r) ? r.map(cellStr) : []));
  if (!rows.some((r) => r.some(Boolean))) return fail('empty');

  let mode = null;
  let posMap = null;
  let dealMap = null;
  const positionRows = [];
  const dealRows = [];
  let sawPositionHeader = false;
  let sawDealHeader = false;

  for (const row of rows) {
    const title = sectionTitle(row);
    if (title) {
      mode = title;
      posMap = null;
      dealMap = null;
      continue;
    }
    const map = mapHeaders(row);
    if (isDealsHeader(map)) {
      mode = 'deals';
      dealMap = map;
      sawDealHeader = true;
      continue;
    }
    if (isPositionsHeader(map)) {
      mode = mode === 'openPositions' ? 'openPositions' : 'positions';
      posMap = map;
      sawPositionHeader = true;
      continue;
    }
    if ((mode === 'positions' || mode === 'openPositions') && posMap) {
      positionRows.push({ row, map: posMap, forceOpen: mode === 'openPositions' });
    } else if (mode === 'deals' && dealMap) {
      dealRows.push({ row, map: dealMap });
    }
  }

  if (!sawPositionHeader && !sawDealHeader) return fail('unrecognized');

  let trades = [];
  let sourceSection = null;
  if (sawPositionHeader) {
    trades = positionRows.map(positionFromRow).filter(Boolean);
    sourceSection = 'positions';
  }
  if (!trades.length && sawDealHeader) {
    trades = dealsToTrades(dealRows);
    sourceSection = 'deals';
  }
  trades = dedupeTrades(trades);
  if (!trades.length) return fail('noTrades');
  trades.sort((a, b) => String(a.entryDate).localeCompare(String(b.entryDate)));
  return { ok: true, trades, sourceSection };
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// MT5's desktop HTML report inserts cells the terminal's own CSS hides
// (`.hidden { display: none }`), including a colspan spacer between Type and
// Volume on every Positions row and a Cost column on Deals. Counting those
// cells shifts Volume onto the spacer and drops the whole table. Profit is
// colspan="2" on both the header and the row, so colspan stays one cell.
function cellIsHidden(attrs) {
  return /\bhidden\b/i.test(attrs || '');
}

function htmlToGrid(html) {
  const src = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const rows = [];
  const parts = src.split(/<tr\b[^>]*>/i).slice(1);
  for (const part of parts) {
    const body = part.split(/<\/tr>/i)[0];
    const bits = [...body.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)];
    if (!bits.length) continue;
    const cells = [];
    for (const bit of bits) {
      if (cellIsHidden(bit[1])) continue;
      cells.push(decodeEntities(bit[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function csvToGrid(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch] += 1;
  }
  const [best, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delim = bestCount > 0 ? best : ',';
  const records = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); records.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); records.push(row); }
  return records
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
}

function looksLikeHtml(src) {
  return /<tr\b|<table\b/i.test(src || '');
}

// file.text() / readAsText() decode bytes as UTF-8. A UTF-16 report then looks
// like "<\0t\0r\0" and the tag scan misses every row.
function withoutNuls(src) {
  return String(src ?? '').replace(/^\uFEFF/, '').split('\u0000').join('');
}

function toUint8(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input);
}

function isZip(bytes) {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4B
    && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

function isOle(bytes) {
  return bytes.length > 4 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
}

// Browser DOM, used when the regex grid never sees a header (unclosed cells,
// or a report the terminal's own markup confuses the scanner). Hidden cells
// stay out: MT5 marks them class="hidden", and colspan is not expanded.
function htmlToGridDom(html) {
  if (typeof DOMParser === 'undefined') return null;
  let doc;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }
  const rows = [];
  for (const tr of doc.querySelectorAll('tr')) {
    const cells = [];
    for (const cell of tr.children) {
      const tag = cell.tagName;
      if (tag !== 'TD' && tag !== 'TH') continue;
      const attrs = `${cell.getAttribute('class') || ''} ${cell.getAttribute('hidden') != null ? 'hidden' : ''}`;
      if (cellIsHidden(attrs)) continue;
      cells.push(String(cell.textContent || '').replace(/\s+/g, ' ').trim());
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function parseHtml(src) {
  const regexParsed = parseMt5Grid(htmlToGrid(src));
  if (regexParsed.ok || regexParsed.code === 'noTrades') return regexParsed;
  const dom = htmlToGridDom(src);
  if (dom && dom.length) {
    const domParsed = parseMt5Grid(dom);
    if (domParsed.ok || domParsed.code === 'noTrades') return domParsed;
  }
  return regexParsed;
}

/** HTML or CSV text → import result. */
export function parseMt5Text(text) {
  const src = withoutNuls(text).trim();
  if (!src) return fail('empty');
  if (!looksLikeHtml(src)) return parseMt5Grid(csvToGrid(src));
  return parseHtml(src);
}

function decodeUtf16(bytes, encoding) {
  return new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '');
}

/** UTF-16 LE/BE (what the MT5 terminal writes) or UTF-8. */
export function decodeMt5Bytes(input) {
  const bytes = toUint8(input);
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return decodeUtf16(bytes, 'utf-16le');
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return decodeUtf16(bytes, 'utf-16be');
  const utf8 = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  if (utf8.includes('\u0000')) {
    const stripped = withoutNuls(utf8);
    if (looksLikeHtml(stripped)) return stripped;
  }
  if (!looksLikeHtml(utf8) && bytes.length > 16) {
    let zeros = 0;
    const sample = Math.min(bytes.length, 80);
    for (let i = 1; i < sample; i += 2) if (bytes[i] === 0) zeros += 1;
    if (zeros > 20) {
      const utf16 = decodeUtf16(bytes, 'utf-16le');
      if (looksLikeHtml(utf16) || /Positions|Deals/i.test(utf16)) return utf16;
    }
  }
  return utf8;
}

// Every way a browser might hand the same report back: raw UTF-16, UTF-16
// with the BOM dropped, or UTF-8 text that still has a NUL between letters.
function textCandidates(bytes) {
  const out = [];
  const push = (s) => {
    const src = withoutNuls(s).trim();
    if (src && !out.includes(src)) out.push(src);
  };
  try { push(decodeMt5Bytes(bytes)); } catch { /* try the others */ }
  try { push(decodeUtf16(bytes, 'utf-16le')); } catch { /* encoding unsupported */ }
  try { push(new TextDecoder('utf-8').decode(bytes)); } catch { /* ignore */ }
  return out;
}

async function parseSpreadsheet(bytes) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  const grid = [];
  for (const sheet of wb.SheetNames) {
    if (sectionKind(sheet)) grid.push([sheet]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: '', blankrows: false });
    for (const row of rows) grid.push(row);
  }
  return parseMt5Grid(grid);
}

function pickTextResult(bytes) {
  let fallback = null;
  for (const src of textCandidates(bytes)) {
    const parsed = looksLikeHtml(src) ? parseHtml(src) : parseMt5Grid(csvToGrid(src));
    if (parsed.ok) return parsed;
    if (!fallback || (parsed.code === 'noTrades' && fallback.code === 'unrecognized')) fallback = parsed;
  }
  return fallback || fail('unrecognized');
}

/**
 * Bytes from an uploaded report. The file name is ignored: Wine saves the
 * MT5 report with no extension, and the name can contain a slash.
 * HTML (UTF-16 or UTF-8), CSV, and xlsx/xls are told apart by the bytes.
 */
export async function readMt5ArrayBuffer(buffer, name = '') {
  void name;
  let bytes;
  try {
    bytes = toUint8(buffer);
  } catch {
    return fail('readFailed');
  }
  if (!bytes.length) return fail('empty');
  if (!isZip(bytes) && !isOle(bytes)) return pickTextResult(bytes);
  try {
    const parsed = await parseSpreadsheet(bytes);
    if (parsed.ok) return parsed;
    const asText = pickTextResult(bytes);
    if (asText.ok || asText.code === 'noTrades') return asText;
    return parsed.code === 'empty' ? fail('unrecognized') : parsed;
  } catch {
    const asText = pickTextResult(bytes);
    if (asText.ok || asText.code === 'noTrades') return asText;
    return fail('readFailed');
  }
}

/**
 * Split a parsed file against the journal.
 * Same ticket already closed (or still open) → duplicate, skipped.
 * Ticket was open and the file now has it closed → update that trade.
 */
export function partitionMt5Import(trades = [], existing = []) {
  const byId = new Map();
  for (const t of existing) {
    if (!t) continue;
    for (const id of tradeExternalIds(t)) byId.set(String(id), t);
  }
  const fresh = [];
  const updates = [];
  const duplicates = [];
  for (const t of trades) {
    const prev = byId.get(String(t.externalId));
    if (!prev) fresh.push(t);
    else if ((prev.status === 'open' || prev.status === 'partial') && t.status === 'closed') updates.push(t);
    else duplicates.push(t);
  }
  return { fresh, updates, duplicates };
}
