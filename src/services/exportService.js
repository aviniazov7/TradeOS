// Build a proper multi-sheet Excel workbook out of the user's Firestore data.
// The writer emits inline strings and numbers only — a note that starts with
// "=" cannot become a formula. SheetJS is not in the client graph.

import { getUserCollectionDocs, getUserProfile } from './firestoreService';
import { buildXlsx } from './xlsxSafe';
import {
  ASSET_CLASS_LABELS, tradeAssetClass, tradeUnits, exitsSummary, grossPnl, signedR, statusLabel,
} from '../utils/tradeExport';

const fmtDate = (v) => {
  if (!v) return '';
  let d;
  if (typeof v?.toDate === 'function') d = v.toDate();
  else if (typeof v === 'number') d = new Date(v);
  else d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('he-IL', { hour12: false });
};
const fmtNum = (v, decimals = 2) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Number(n.toFixed(decimals)) : '';
};
const fmtBool = (v) => (v === true ? 'כן' : v === false ? 'לא' : '');
const join = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : '');

// Map each collection → ordered list of { header, get } columns. Anything not
// in this list is dropped from the workbook (no Firestore ids, no internal
// flags) so the file stays readable.
const SHEETS = {
  trades: {
    title: 'עסקאות',
    columns: [
      { header: 'מטבע', get: (t) => t.pair || t.symbol },
      { header: 'סוג נכס', get: (t) => ASSET_CLASS_LABELS[tradeAssetClass(t)] },
      { header: 'כיוון', get: (t) => t.direction === 'long' ? 'Long' : t.direction === 'short' ? 'Short' : '' },
      { header: 'סטטוס', get: (t) => statusLabel(t) },
      { header: 'תוצאה', get: (t) => t.result === 'win' ? 'רווח' : t.result === 'loss' ? 'הפסד' : t.result === 'breakeven' ? 'אפס' : '' },
      { header: 'תאריך כניסה', get: (t) => fmtDate(t.entryDate) },
      { header: 'תאריך יציאה', get: (t) => fmtDate(t.exitDate) },
      { header: 'מחיר כניסה', get: (t) => fmtNum(t.entryPrice, 6) },
      { header: 'מחיר יציאה', get: (t) => fmtNum(t.exitPrice, 6) },
      { header: 'סטופ לוס', get: (t) => fmtNum(t.stopLoss, 6) },
      { header: 'סטופ מקורי', get: (t) => fmtNum(t.originalStopLoss, 6) },
      { header: 'טייק פרופיט', get: (t) => fmtNum(Array.isArray(t.tps) ? t.tps[0] : t.takeProfit, 6) },
      // Coins / shares / contracts — the unit is in the next column.
      { header: 'כמות', get: (t) => fmtNum(tradeUnits(t).qty, 6) },
      { header: 'יחידת כמות', get: (t) => tradeUnits(t).unit },
      { header: 'מינוף', get: (t) => fmtNum(t.leverage, 0) },
      { header: 'גודל פוזיציה ($)', get: (t) => fmtNum(t.positionSize) },
      { header: 'יציאות', get: (t) => exitsSummary(t) },
      { header: 'P&L ברוטו ($)', get: (t) => fmtNum(grossPnl(t)) },
      { header: 'עמלות', get: (t) => fmtNum(t.fees) },
      { header: 'P&L נטו ($)', get: (t) => fmtNum(t.netPnl ?? t.pnl) },
      { header: 'אחוז P&L', get: (t) => fmtNum(t.pnlPercent) },
      // The field is rrRatio (t.rr never existed — the column exported empty
      // forever). Stored unsigned; the sign comes from the net P&L. This
      // sheet keeps that price ratio. The journal CSV writes the table's
      // net R (signedTradeR) instead.
      { header: 'R:R', get: (t) => (signedR(t) ? fmtNum(signedR(t)) : '') },
      { header: 'אסטרטגיה', get: (t) => t.strategy },
      { header: 'סשן', get: (t) => t.session },
      { header: 'טווח זמן', get: (t) => t.timeframe },
      { header: 'תגיות', get: (t) => join(t.tags) },
      { header: 'רגש לפני', get: (t) => t.emotionBefore },
      { header: 'רגש אחרי', get: (t) => t.emotionAfter },
      { header: 'הערות', get: (t) => t.notes },
      { header: 'מקור', get: (t) => t.source || 'ידני' },
    ],
  },

  journals: {
    title: 'יומנים',
    columns: [
      { header: 'שם היומן', get: (j) => j.name },
      { header: 'בורסה', get: (j) => j.exchange },
      { header: 'יתרה התחלתית', get: (j) => fmtNum(j.initialBalance) },
      // The journal document stores `currency` (see JournalContext.addJournal);
      // `baseCurrency` never existed, so this column exported empty.
      { header: 'מטבע בסיס', get: (j) => j.currency },
      { header: 'מועדף', get: (j) => fmtBool(j.starred) },
      { header: 'בארכיון', get: (j) => fmtBool(j.archived) },
      { header: 'נוצר', get: (j) => fmtDate(j.createdAt) },
      { header: 'עודכן', get: (j) => fmtDate(j.updatedAt) },
    ],
  },

  backtests: {
    title: 'בקטסטים',
    columns: [
      { header: 'מטבע', get: (b) => b.pair },
      { header: 'אסטרטגיה', get: (b) => b.strategy },
      { header: 'כיוון', get: (b) => b.direction },
      { header: 'תאריך', get: (b) => fmtDate(b.date || b.createdAt) },
      { header: 'תוצאה', get: (b) => b.result === 'win' ? 'רווח' : b.result === 'loss' ? 'הפסד' : b.result },
      { header: 'תוצאת R', get: (b) => fmtNum(b.rResult) },
      { header: 'טווח זמן', get: (b) => b.timeframe },
      { header: 'הערות', get: (b) => b.notes },
    ],
  },

  dca: {
    title: 'תוכניות DCA',
    columns: [
      { header: 'מטבע', get: (d) => d.coin },
      { header: 'תדירות', get: (d) => d.frequency },
      { header: 'סטטוס', get: (d) => d.status === 'active' ? 'פעיל' : d.status === 'paused' ? 'מושהה' : 'הסתיים' },
      { header: 'סכום כניסה', get: (d) => fmtNum(d.entryAmount) },
      { header: 'סה"כ הושקע', get: (d) => fmtNum(d.totalInvested) },
      { header: 'סה"כ כניסות', get: (d) => (d.entries || []).length },
      { header: 'נוצר', get: (d) => fmtDate(d.createdAt) },
    ],
  },

  tradingPlans: {
    title: 'תוכניות מסחר',
    columns: [
      { header: 'כותרת', get: (p) => p.title || p.name },
      { header: 'מטבע', get: (p) => p.pair },
      { header: 'כיוון', get: (p) => p.direction },
      { header: 'מחיר כניסה', get: (p) => fmtNum(p.entryPrice, 6) },
      { header: 'סטופ', get: (p) => fmtNum(p.stopLoss, 6) },
      { header: 'טייק', get: (p) => fmtNum(p.takeProfit, 6) },
      { header: 'פעיל', get: (p) => fmtBool(p.isActive) },
      { header: 'תיאור', get: (p) => p.description || p.notes },
      { header: 'נוצר', get: (p) => fmtDate(p.createdAt) },
    ],
  },

  notes: {
    title: 'הערות',
    columns: [
      { header: 'כותרת', get: (n) => n.title },
      { header: 'תוכן', get: (n) => n.content || n.body },
      { header: 'תגיות', get: (n) => join(n.tags) },
      { header: 'נוצר', get: (n) => fmtDate(n.createdAt) },
    ],
  },

  strategies: {
    title: 'אסטרטגיות',
    columns: [
      { header: 'שם', get: (s) => s.name },
      { header: 'תיאור', get: (s) => s.description },
      { header: 'נוצר', get: (s) => fmtDate(s.createdAt) },
    ],
  },
};

function sheetRows(objects, columns) {
  return [
    columns.map((col) => col.header),
    ...objects.map((doc) => columns.map((col) => col.get(doc) ?? '')),
  ];
}

export async function exportToExcel(user) {
  const profile = await getUserProfile(user.uid).catch(() => null);
  const sheets = [{
    name: 'סיכום',
    rows: [
      ['שדה', 'ערך'],
      ['שם המשתמש', user.displayName || profile?.data?.displayName || ''],
      ['אימייל', user.email || ''],
      ['תאריך הצטרפות', fmtDate(user.metadata?.creationTime)],
      ['תאריך הייצוא', fmtDate(new Date())],
      ['מסלול', profile?.data?.plan === 'premium' ? 'Premium' : 'חינמי'],
    ],
  }];

  let total = 0;
  for (const [colKey, def] of Object.entries(SHEETS)) {
    const docs = await getUserCollectionDocs(user.uid, colKey).catch(() => []);
    if (!docs.length) continue;
    sheets.push({ name: def.title, rows: sheetRows(docs, def.columns) });
    total += docs.length;
  }

  const filename = `TradeOS-Export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const bytes = buildXlsx(sheets);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { filename, total };
}
