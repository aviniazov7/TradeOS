// Pure CSV-import pipeline for the journal's "ייבוא מ-CSV" modal: parse the
// file, auto-map its columns, and turn every row into either a trade document
// ready for addTradesBulk or a skipped row with a reason. Kept free of React
// and Firebase so the validation that guards the Firestore rules is unit-tested
// (csvImport.test.js) — one invalid row used to reject a whole 499-row batch
// with a misleading "no permission" error.

import { CFD_INSTRUMENTS, DEFAULT_LEVERAGE, FUTURES_CONTRACTS } from './constants';
import { customFromCsvRow } from './customTradeFields';

// Header aliases per field, in PRIORITY order: when a file has two columns
// that both fit a field, the earlier alias wins (e.g. gross P&L over net).
// Matching is done on a normalized form (lowercase, no spaces/punctuation), so
// "Entry Price", "entry_price" and "EntryPrice" all hit 'entryprice'.
export const COLUMN_MAP = {
  // 'contracts' last: Bybit's closed-P&L export names its SYMBOL column
  // "Contracts" (sizes are in "Qty"); any real symbol column wins first.
  pair: ['pair', 'symbol', 'ticker', 'coin', 'market', 'instrument', 'contract', 'זוג', 'סימבול', 'מניה', 'נכס', 'contracts'],
  direction: ['direction', 'side', 'type', 'כיוון'],
  entryPrice: ['entryprice', 'entry', 'openprice', 'priceopen', 'avgentryprice', 'avgopenprice', 'מחיר כניסה', 'כניסה'],
  exitPrice: ['exitprice', 'exit', 'closeprice', 'priceclose', 'avgexitprice', 'avgcloseprice', 'מחיר יציאה', 'סגירה'],
  stopLoss: ['stoploss', 'sl', 's/l', 'stop', 'סטופ לוס', 'סטופ'],
  // Size in UNITS — coins, shares or contracts. Never divided by price.
  quantity: ['qty', 'quantity', 'shares', 'contracts', 'units', 'lots', 'lot', 'volume', 'vol', 'filledqty', 'כמות', 'מניות', 'חוזים', 'יחידות'],
  // Size in DOLLARS (notional). Divided by the entry price to get units.
  positionSize: ['positionsize', 'size', 'sizeusd', 'notional', 'value', 'amount', 'גודל עסקה', 'גודל'],
  leverage: ['leverage', 'lev', 'מינוף'],
  fees: ['fees', 'fee', 'commission', 'commissions', 'עמלות', 'עמלה'],
  // Brokers that report realized profit directly — used verbatim instead of
  // recomputing from price×qty (wrong when contract sizes vary). Treated as
  // GROSS of fees (netPnl = profit − fees), so gross aliases come first.
  profit: ['grosspnl', 'grossp&l', 'grossprofit', 'רווח ברוטו', 'profit', 'pnl', 'p/l', 'p&l', 'netp/l', 'realized', 'realizedpnl', 'closedpnl', 'closedp&l','רווח', 'רווח/הפסד'],
  entryDate: ['entrydate', 'opendate', 'opentime', 'entrytime', 'date', 'time', 'תאריך כניסה', 'תאריך'],
  exitDate: ['exitdate', 'closedate', 'closetime', 'exittime', 'תאריך יציאה', 'תאריך סגירה'],
  strategy: ['strategy', 'setup', 'אסטרטגיה'],
  notes: ['notes', 'note', 'comment', 'comments', 'הערות'],
};

const normHeader = (h) => String(h ?? '')
  .replace(/^\uFEFF/, '')
  .toLowerCase()
  .replace(/\(.*?\)/g, '') // "Size (USD)" → "size"
  .replace(/[\s_\-.$:]/g, '')
  .trim();

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(COLUMN_MAP).map(([field, aliases]) => [field, aliases.map(normHeader)])
);

/** Auto-map file headers to fields. Each header is used for one field only. */
export function autoMapColumns(headers = []) {
  const mapping = {};
  const used = new Set();
  const byNorm = new Map();
  for (const h of headers) {
    const n = normHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }
  for (const [field, aliases] of Object.entries(NORMALIZED_ALIASES)) {
    for (const alias of aliases) {
      const header = byNorm.get(alias);
      if (header != null && !used.has(header)) {
        mapping[field] = header;
        used.add(header);
        break;
      }
    }
  }
  return mapping;
}

/**
 * RFC-4180 CSV parser: quoted cells may contain commas, doubled quotes and
 * newlines; a UTF-8 BOM (our own export writes one) is stripped; the
 * delimiter is sniffed from the header line (`,` `;` or tab — European Excel
 * exports use `;`). Blank lines are dropped.
 */
export function parseCSV(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  const [best, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delim = bestCount > 0 ? best : ',';

  const records = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
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

  const nonBlank = records.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonBlank.length < 2) return { headers: [], rows: [] };
  const headers = nonBlank[0].map((h) => h.trim());
  const rows = nonBlank.slice(1).map((values) => {
    const out = {};
    headers.forEach((h, i) => { out[h] = (values[i] ?? '').trim(); });
    return out;
  });
  return { headers, rows };
}

// Numeric cell → number, surviving thousands separators and a European
// decimal comma. parseFloat("1,234.56") silently returns 1 (truncated at the
// first comma, no NaN), which corrupted quantity and every downstream P&L.
// Accounting negatives "(12.50)" are read as −12.5.
export function parseNumber(val) {
  if (typeof val === 'number') return val;
  let s = String(val ?? '').trim().replace(/[\s$€£₪\u200E\u200F]/g, '');
  if (!s) return NaN;
  let negate = false;
  const paren = s.match(/^\((.*)\)$/);
  if (paren) { s = paren[1]; negate = true; }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Both present — the RIGHTMOST one is the decimal separator.
    s = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.') // 1.234,56 (European)
      : s.replace(/,/g, ''); // 1,234.56 (US)
  } else if (lastComma > -1) {
    // Commas only: groups of exactly 3 digits are thousands (1,234,567);
    // anything else is a European decimal comma (12,5).
    const parts = s.split(',');
    const isThousands = parts.length > 1 &&
      parts.slice(1).every((p) => /^\d{3}$/.test(p)) && /^-?\d{1,3}$/.test(parts[0]);
    s = isThousands ? parts.join('') : parts.join('.');
  }
  const n = parseFloat(s);
  return negate ? -n : n;
}

// new Date(y, m, d) silently rolls out-of-range parts over (month 13 →
// February next year) — reject those instead, so a garbage cell counts as
// unparseable rather than importing with a fabricated date.
function buildDate(y, mo, d, h, mi, s) {
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return dt.getFullYear() === +y && dt.getMonth() === +mo - 1 && dt.getDate() === +d &&
    dt.getHours() === +h && dt.getMinutes() === +mi
    ? dt : null;
}

export function parseDate(val) {
  if (!val) return null;
  const v = String(val).trim();
  // Year-first dates — "2024.01.15 09:30:00", yyyy-MM-dd and yyyy/MM/dd,
  // time optional. new Date() on the dotted form fails in Firefox/Safari,
  // which used to stamp TODAY on every imported trade.
  const iso = v.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const [, y, mo, d, h = 0, mi = 0, s = 0] = iso;
    return buildDate(y, mo, d, h, mi, s);
  }
  // dd/MM/yyyy (TradeOS export) with a guard for US MM/dd/yyyy files: if the
  // second field is >12 it must be the day (MM/dd). Otherwise assume dd/MM.
  // Time optional (", " separator too — toLocaleString output).
  const parts = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}),?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (parts) {
    const [, a, b, year, h = 0, mi = 0, s = 0] = parts;
    const first = parseInt(a, 10);
    const second = parseInt(b, 10);
    const [day, month] = second > 12 && first <= 12 ? [second, first] : [first, second];
    return buildDate(year, month, day, h, mi, s);
  }
  // Epoch timestamps (exchange exports): 10 digits = seconds, 13 = ms.
  if (/^\d{10}$/.test(v)) return new Date(parseInt(v, 10) * 1000);
  if (/^\d{13}$/.test(v)) return new Date(parseInt(v, 10));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function normalizeDirection(val) {
  const lower = String(val || '').toLowerCase().trim();
  if (['long', 'buy', 'לונג', 'קנייה', 'קניה'].includes(lower)) return 'long';
  if (['short', 'sell', 'שורט', 'מכירה'].includes(lower)) return 'short';
  return 'long';
}

const MONTH_CODE_REST = /^(?:[FGHJKMNQUVXZ]\d{1,4}|\d{0,4})$/;

/**
 * CME contract spec for a futures symbol as brokers write it: "ES", "/ES",
 * "ESZ4", "MNQH2025", "CL 12-24" → the FUTURES_CONTRACTS entry, or null.
 * The longest root wins, so "MESZ4" is MES (not ES).
 */
export function futuresSpecFor(raw) {
  const s = String(raw || '').toUpperCase().replace(/^\//, '').replace(/[\s\-./]/g, '');
  if (!s) return null;
  const roots = [...FUTURES_CONTRACTS, ...CFD_INSTRUMENTS].sort((a, b) => b.symbol.length - a.symbol.length);
  for (const c of roots) {
    if (s.startsWith(c.symbol) && MONTH_CODE_REST.test(s.slice(c.symbol.length))) return c;
  }
  return null;
}

export function cleanPair(raw, assetClass = 'crypto') {
  const s = String(raw || '').toUpperCase().trim();
  // Stock tickers keep their dot class / exchange suffix (BRK.B, TEVA.TA).
  if (assetClass === 'stocks') return s.replace(/[^A-Z0-9.]/g, '').slice(0, 30);
  return s.replace(/[^A-Z0-9]/g, '').slice(0, 30);
}

/** Hebrew text per skip reason — shown in the preview and the summary toast. */
export const SKIP_REASON_LABELS = {
  missing_entry: 'חסר מחיר כניסה',
  missing_pair: 'חסר זוג / סימבול',
  invalid_date: 'תאריך כניסה לא תקין',
  missing_size: 'חסר גודל עסקה',
  unknown_contract: 'חוזה עתידי לא מוכר',
  duplicate: 'כבר קיימות ביומן',
};

const toMs = (v) => {
  if (!v) return 0;
  const d = typeof v?.toDate === 'function' ? v.toDate() : v instanceof Date ? v : new Date(v);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
};
const keyNum = (n) => {
  const x = parseFloat(n);
  return Number.isFinite(x) && x !== 0 ? String(+x.toPrecision(8)) : '0';
};

/**
 * Stable identity of an imported trade: source + pair + entry time (to the
 * second) + entry price + size. Re-importing the same file produces the same
 * keys, so already-journaled rows are skipped instead of duplicated. Also
 * computed for documents imported before the key was stored.
 */
export function importKeyOf(t) {
  if (!t) return '';
  const source = t.source || 'manual';
  const pair = String(t.pair || '').toUpperCase();
  const sec = Math.floor(toMs(t.entryDate) / 1000);
  const size = t.assetClass === 'futures_cme' && t.contract?.contracts
    ? t.contract.contracts
    : t.quantity;
  return [source, pair, sec, keyNum(t.entryPrice), keyNum(size)].join('|');
}

/** Every import key already in the journal (stored or derived). */
export function existingImportKeys(trades = []) {
  const keys = new Set();
  for (const t of trades) {
    if (!t) continue;
    if (t.importKey) keys.add(t.importKey);
    keys.add(importKeyOf(t));
  }
  return keys;
}

/** True when the mapping can size a trade: units, $ size, or a P&L column. */
export function mappingHasSize(mapping = {}) {
  return !!(mapping.quantity || mapping.positionSize || mapping.profit);
}

/**
 * Turn parsed CSV rows into trade documents for the given journal asset class.
 *
 * @param {object[]} rows      parsed rows (header → cell)
 * @param {object}   mapping   field → header
 * @param {object}   opts      { assetClass, existingTrades, now, customFields }
 * @returns {{ trades: object[], skipped: {index:number, reason:string}[],
 *             counts: Record<string, number>, estimatedSize: number }}
 *
 * Every returned trade satisfies the Firestore create rule (entryPrice > 0,
 * quantity > 0, stopLoss ≥ 0, fees ≥ 0, pair 1–30 chars, leverage 1–200 or a
 * futures contract block) so a batch can't be rejected by one bad row.
 */
export function buildImportTrades(rows = [], mapping = {}, opts = {}) {
  const assetClass = ['futures_cme', 'stocks'].includes(opts.assetClass) ? opts.assetClass : 'crypto';
  const seen = existingImportKeys(opts.existingTrades);
  const now = opts.now instanceof Date ? opts.now : new Date();
  const trades = [];
  const skipped = [];
  let estimatedSize = 0;

  rows.forEach((row, index) => {
    const get = (field) => {
      const col = mapping[field];
      return col ? String(row[col] ?? '').trim() : '';
    };
    const skip = (reason) => skipped.push({ index, reason });

    const entryPrice = parseNumber(get('entryPrice'));
    if (!(entryPrice > 0) || !Number.isFinite(entryPrice)) return skip('missing_entry');

    const rawPair = get('pair');
    let pair = cleanPair(rawPair, assetClass);
    let spec = null;
    if (assetClass === 'futures_cme') {
      if (!rawPair) return skip('missing_pair');
      spec = futuresSpecFor(rawPair);
      if (!spec) return skip('unknown_contract');
      pair = spec.symbol;
    }
    if (!pair) return skip('missing_pair');

    // A mapped date column whose value we CAN'T parse would silently stamp
    // today on a historical trade — skip it. An unmapped column or an empty
    // cell falls back to now: there's no date to lie about.
    const entryDateRaw = get('entryDate');
    const parsedEntry = parseDate(entryDateRaw);
    if (entryDateRaw && !parsedEntry) return skip('invalid_date');

    const exitPriceNum = parseNumber(get('exitPrice'));
    const exitPrice = exitPriceNum > 0 ? exitPriceNum : 0;
    const profitRaw = get('profit');
    const profitNum = parseNumber(profitRaw);
    const hasProfit = profitRaw !== '' && Number.isFinite(profitNum);

    // Size: units are taken as-is; a $ size is converted to units by the
    // entry price (or to contracts by price × point value for futures).
    const unitsNum = Math.abs(parseNumber(get('quantity')));
    const usdNum = Math.abs(parseNumber(get('positionSize')));
    let quantity = 0;
    if (unitsNum > 0) {
      quantity = unitsNum;
    } else if (usdNum > 0) {
      quantity = spec
        ? (spec.kind === 'cfd'
          ? usdNum / (entryPrice * spec.pointValue)
          : Math.round(usdNum / (entryPrice * spec.pointValue)))
        : usdNum / entryPrice;
    }
    let sizeEstimated = false;
    if (!(quantity > 0) || !Number.isFinite(quantity)) {
      // No size, but the broker reported the realized P&L: the P&L is used
      // verbatim, so a nominal single unit/contract keeps the row valid.
      if (!hasProfit) return skip('missing_size');
      quantity = 1;
      sizeEstimated = true;
    }

    const status = exitPrice > 0 || hasProfit ? 'closed' : 'open';
    const stopNum = parseNumber(get('stopLoss'));
    const stopLoss = stopNum > 0 ? stopNum : 0;
    const feesNum = parseNumber(get('fees'));
    // Rebates arrive as negative fees; the rules require fees ≥ 0.
    const fees = Number.isFinite(feesNum) ? Math.abs(feesNum) : 0;
    const rawLeverage = Math.round(parseNumber(get('leverage'))) || DEFAULT_LEVERAGE;
    const leverage = assetClass === 'crypto' ? Math.min(200, Math.max(1, rawLeverage)) : 1;
    const exitDate = parseDate(get('exitDate'));

    const trade = {
      pair,
      direction: normalizeDirection(get('direction')),
      marketType: assetClass === 'stocks' ? 'spot' : 'futures',
      assetClass,
      strategy: get('strategy'),
      timeframe: '4H',
      entryPrice,
      exitPrice,
      stopLoss,
      originalStopLoss: stopLoss,
      quantity,
      positionSize: spec ? entryPrice * spec.pointValue * quantity : entryPrice * quantity,
      leverage,
      fees,
      ...(spec ? {
        contract: { symbol: spec.symbol, pointValue: spec.pointValue, tickSize: spec.tickSize, contracts: quantity },
      } : {}),
      ...(hasProfit ? { pnlFromExchange: profitNum } : {}),
      ...(sizeEstimated ? { sizeEstimated: true } : {}),
      entryDate: parsedEntry || now,
      // Never default exitDate to now — historical imports would appear as
      // closed today, corrupting the equity curve and today's P&L.
      exitDate: exitDate || null,
      notes: get('notes'),
      status,
      source: 'csv_import',
    };
    const custom = customFromCsvRow(row, opts.customFields);
    if (custom) trade.custom = custom;
    // Only rows with a real entry date can be recognised again on re-import.
    if (parsedEntry) {
      const key = importKeyOf(trade);
      if (seen.has(key)) return skip('duplicate');
      seen.add(key);
      trade.importKey = key;
    }
    if (sizeEstimated) estimatedSize++;
    trades.push(trade);
  });

  const counts = {};
  for (const s of skipped) counts[s.reason] = (counts[s.reason] || 0) + 1;
  return { trades, skipped, counts, estimatedSize };
}

/** "3 חסר מחיר כניסה · 2 כבר קיימות ביומן" */
export function describeSkipped(counts = {}) {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${n} ${SKIP_REASON_LABELS[reason] || reason}`)
    .join(' · ');
}
