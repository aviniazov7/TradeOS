// Shared trade → export-row helpers for the journal's CSV export and the
// profile's Excel export (asset class, units, exits, gross vs net P&L,
// original stop). The journal CSV's % and R columns are the table's
// "% נטו" and "R נטו" (tradeNetPercent / signedTradeR). The Excel sheet
// still writes the stored price ratio via signedR.

import { isClosedTrade, signedTradeR, tradeNetPercent } from './calculations';
import { customCsvHeader, readCustomValue } from './customTradeFields';
import { tradeSetups } from './setupStats';
import { formatDateTime } from './formatters';

export const ASSET_CLASS_LABELS = { crypto: 'קריפטו', futures_cme: 'חוזים עתידיים', stocks: 'מניות' };
const UNIT_LABELS = { crypto: 'מטבעות', futures_cme: 'חוזים', stocks: 'מניות' };

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const round = (n, d = 2) => (n == null ? '' : Number(n.toFixed(d)));
const toDate = (raw) => {
  if (!raw) return null;
  const d = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const tradeAssetClass = (t) => (['futures_cme', 'stocks'].includes(t?.assetClass) ? t.assetClass : 'crypto');

/** Size in the trade's own unit: coins, shares or contracts. */
export function tradeUnits(t) {
  const cls = tradeAssetClass(t);
  const qty = cls === 'futures_cme' ? num(t?.contract?.contracts) ?? num(t?.quantity) : num(t?.quantity);
  return { qty, unit: UNIT_LABELS[cls] };
}

/** "105 (50%) | 110 (50%)" — or contracts for CME futures exits. */
export function exitsSummary(t) {
  if (!Array.isArray(t?.exits) || !t.exits.length) return '';
  return t.exits
    .filter((e) => num(e?.price) > 0)
    .map((e) => {
      if (num(e.contracts) != null) return `${num(e.price)} (${num(e.contracts)} חוזים)`;
      if (num(e.percent) != null) return `${num(e.price)} (${num(e.percent)}%)`;
      return String(num(e.price));
    })
    .join(' | ');
}

const netOf = (t) => num(t?.netPnl) ?? num(t?.pnl) ?? 0;

/** Gross P&L (before fees): the stored pnl, else net + fees. */
export function grossPnl(t) {
  return num(t?.pnl) ?? netOf(t) + (num(t?.fees) ?? 0);
}

/** Stored price ratio (rrRatio), signed by the net P&L. The Excel export uses this.
 *  The journal table and CSV use signedTradeR (net P&L / initial risk) instead. */
export function signedR(t) {
  const rr = Math.abs(num(t?.rrRatio) ?? 0);
  return netOf(t) < 0 ? -rr : rr;
}

export function statusLabel(t) {
  if (t?.status === 'partial') return 'חלקית';
  return isClosedTrade(t) ? 'סגורה' : 'פתוחה';
}

export const JOURNAL_CSV_HEADERS = [
  'תאריך', 'תאריך סגירה', 'זוג', 'סוג נכס', 'כיוון', 'כניסה', 'סגירה', 'סטופ לוס', 'סטופ מקורי',
  'כמות', 'יחידת כמות', 'גודל עסקה', 'מינוף', 'יציאות', 'רווח ברוטו', 'עמלות', 'רווח/הפסד נטו',
  '%', 'R', 'אסטרטגיה', 'טווח זמן', 'סטטוס', 'מקור', 'סיבת כניסה', 'הערות', 'תגיות',
  'רגש לפני', 'רגש אחרי', 'טעויות', 'ביטחון', 'סטאפ',
];

/**
 * Built-in columns, then one `שדה: <name>` column per defined custom field.
 * No definitions means the original header list, so an older file still lines up.
 */
export function journalCsvHeaders(defs = []) {
  const extra = (Array.isArray(defs) ? defs : []).map(customCsvHeader);
  return extra.length ? [...JOURNAL_CSV_HEADERS, ...extra] : JOURNAL_CSV_HEADERS;
}

/**
 * One journal CSV row per trade, aligned with journalCsvHeaders(defs). Numbers
 * stay numbers (the CSV writer keeps negatives numeric for Excel); dates are
 * local dd/MM/yyyy HH:mm, which the CSV import reads back. Trades without
 * `custom` leave the extra cells empty.
 */
export function journalCsvRow(t, defs = []) {
  const entry = toDate(t.entryDate);
  const exit = toDate(t.exitDate);
  const net = netOf(t);
  const entryPrice = num(t.entryPrice);
  // The table's "% נטו" / "R נטו". Stored pnlPercent is gross (fees never
  // entered it) and rrRatio is an unsigned price ratio, so writing those
  // made the file disagree with the row — including a sign flip when fees
  // turned a small gross win into a net loss.
  const pnlPct = tradeNetPercent(t);
  const netR = signedTradeR(t);
  const { qty, unit } = tradeUnits(t);
  const cls = tradeAssetClass(t);
  const list = (v) => (Array.isArray(v) ? v.join(' ') : (v || ''));
  return [
    entry ? formatDateTime(entry) : '', exit ? formatDateTime(exit) : '', t.pair || '',
    ASSET_CLASS_LABELS[cls], t.direction || '', entryPrice ?? '', num(t.exitPrice) ?? '',
    num(t.stopLoss) ?? '', num(t.originalStopLoss) ?? '',
    qty ?? '', unit, round(num(t.positionSize)), cls === 'crypto' ? (num(t.leverage) ?? '') : 1,
    exitsSummary(t), round(grossPnl(t)), round(num(t.fees) ?? 0), round(net),
    round(Number.isFinite(pnlPct) ? pnlPct : 0), round(netR), t.strategy || '',
    t.timeframe || '', statusLabel(t), t.source || 'manual', t.entryReason || '', t.notes || '',
    list(t.tags), t.emotionBefore || '', t.emotionAfter || '', list(t.mistakes), t.confidenceRating ?? '',
    tradeSetups(t).join(' | '),
    ...(Array.isArray(defs) ? defs : []).map((field) => {
      const value = readCustomValue(t, field);
      return value == null ? '' : value;
    }),
  ];
}
