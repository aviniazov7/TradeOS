// Signed numbers inside Hebrew (RTL) UI.
//
// The bidi algorithm treats "-" "+" "$" as neutral, so a logical "-11.24" is
// painted as "11.24-" unless the cell is an LTR isolate. Models also sometimes
// emit the sign after the digits. These helpers parse both shapes and print
// the sign first: "-$11.24", "+$8.50", "-1.06R".

const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

function isSign(ch) {
  return ch === '+' || ch === '-' || ch === '\u2212' || ch === '\u2013';
}

function signChar(ch) {
  return ch === '+' ? '+' : '-';
}

/**
 * Parse a bare signed token. Accepts a leading or trailing sign, a currency
 * symbol, thousands separators, and an R / USD / % suffix.
 * Returns null when `raw` is not a single number.
 */
export function parseSignedNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw ?? '').trim();
  if (!s || s === '—' || s === '–' || s === '-' || s === '\u2212') return null;
  s = s.replace(BIDI_MARKS, '').replace(/\s+/g, '');
  if (!s) return null;

  let sign = 1;
  const lead = isSign(s[0]);
  const trail = isSign(s[s.length - 1]);
  if (trail && !lead) {
    sign = signChar(s[s.length - 1]) === '+' ? 1 : -1;
    s = s.slice(0, -1);
  } else if (lead) {
    sign = signChar(s[0]) === '+' ? 1 : -1;
    s = s.slice(1);
    if (s && isSign(s[s.length - 1])) return null;
  }

  s = s.replace(/(USDT|USDC|USD|R|%|x)$/i, '');
  s = s.replace(/[$₪€]/g, '');
  if (!/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s) && !/^\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return sign < 0 ? -n : n;
}

/** The whole string is one number token (optional sign, $, unit, trailing sign). */
export function isBareNumericText(raw) {
  const s = String(raw ?? '').trim().replace(BIDI_MARKS, '');
  if (!s || parseSignedNumber(s) == null) return false;
  return /^[+\u2212\u2013-]?\s?\$?\s?[\d,]+(?:\.\d+)?\s?\$?\s?(?:USDT|USDC|USD|R|%|x)?\s?[+\u2212\u2013-]?$/i.test(s);
}

/**
 * Move a trailing sign to the front ("11.24-" → "-11.24", "$11.24-" → "-$11.24").
 * Ranges and tokens that are not a single number are returned unchanged.
 */
export function normalizeSignedToken(run) {
  const original = String(run ?? '').trim();
  if (!original) return original;
  if (/\d\s*[-–—]\s*\$?\d/.test(original)) return original;
  if (!isBareNumericText(original)) return original;
  const compact = original.replace(BIDI_MARKS, '').replace(/\s+/g, '');
  const lead = isSign(compact[0]);
  const trail = isSign(compact[compact.length - 1]);
  if (!trail || lead) return original;
  const n = parseSignedNumber(original);
  if (n == null) return original;
  const digits = (original.match(/(\d[\d,]*(?:\.\d+)?)/) || [])[1] || String(Math.abs(n));
  const unitMatch = compact.match(/(USDT|USDC|USD|R|%|x)[+\u2212\u2013-]$/i);
  const unit = unitMatch ? unitMatch[1] : '';
  const dollar = original.includes('$') ? '$' : '';
  const sign = n < 0 ? '-' : '+';
  const unitText = unit ? (/^(?:USDT|USDC|USD)$/i.test(unit) ? ` ${unit}` : unit) : '';
  return `${sign}${dollar}${digits}${unitText}`;
}

/**
 * P&L as signed currency: "+$1,234.56" / "-$11.24". Zero is "+$0.00".
 * `decimals` is for tight tiles (a share card); chat tables use 2.
 */
export function formatPnlText(value, { decimals = 2 } = {}) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const d = Math.min(8, Math.max(0, decimals | 0));
  const sign = n < 0 ? '-' : '+';
  const body = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return `${sign}$${body}`;
}

/** R-multiple: "+1.20R" / "-1.06R" / "0.00R". */
export function formatRText(value, digits = 2) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const d = Math.min(6, Math.max(0, digits | 0));
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${Math.abs(n).toFixed(d)}R`;
}

/**
 * Column role from a markdown header. Only P&L and R are recolored and
 * reformatted; other numeric columns stay plain numbers, just LTR.
 */
export function classifyNumericHeader(header) {
  const h = String(header || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const l = h.toLowerCase();
  if (/^(r|rr)$/i.test(h) || /r-multiple|מכפיל/.test(l)) return 'r';
  if (/p\s*&\s*l|\bpnl\b|רווח|הפסד|דולר/.test(l)) return 'pnl';
  if (/^(usd|\$)$/i.test(l)) return 'pnl';
  return 'text';
}

export function columnLooksNumeric(values) {
  const filled = (values || []).map((v) => String(v ?? '').trim()).filter(Boolean);
  if (!filled.length) return false;
  const numeric = filled.filter((v) => isBareNumericText(v)).length;
  return numeric / filled.length >= 0.75;
}

function toneOf(n) {
  if (n > 0) return 'profit';
  if (n < 0) return 'loss';
  return null;
}

/**
 * Present one table cell. Returns null when the cell is prose (leave markdown).
 * `kind` is 'pnl' | 'r' | 'number' | 'text'.
 */
export function presentNumericCell(raw, kind) {
  if (kind === 'text' || !isBareNumericText(raw)) return null;
  const n = parseSignedNumber(raw);
  if (n == null) return null;
  if (kind === 'pnl') {
    return { text: formatPnlText(n), tone: toneOf(n), numeric: true, kind: 'pnl' };
  }
  if (kind === 'r') {
    return { text: formatRText(n), tone: toneOf(n), numeric: true, kind: 'r' };
  }
  return { text: normalizeSignedToken(String(raw).trim()), tone: null, numeric: true, kind: 'number' };
}
