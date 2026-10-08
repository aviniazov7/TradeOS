// Build a proper multi-sheet Excel workbook out of the user's Firestore data.
// Loaded lazily by ProfilePage so the xlsx bundle doesn't ship to every user.

import { getUserCollectionDocs, getUserProfile } from './firestoreService';
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
      // forever). Stored unsigned; the sign comes from the pnl, matching the
      // in-app display (formatRR) and the journal's CSV export.
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

function rowsFromDocs(docs, columns) {
  return (docs || []).map((doc) => {
    const row = {};
    for (const col of columns) {
      row[col.header] = col.get(doc) ?? '';
    }
    return row;
  });
}

// Auto-fit each column to the longest cell (capped) so the output looks like a
// real Excel file the moment you open it.
function autoFitColumns(rows, columns) {
  return columns.map((col) => {
    let max = String(col.header).length;
    for (const row of rows) {
      const v = row[col.header];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(50, Math.max(10, max + 2)) };
  });
}

export async function exportToExcel(user) {
  // Dynamic import so the ~600KB xlsx bundle only loads when the user actually
  // clicks "Export Data" — keeps the cold start lean for everyone else.
  const XLSX = await import('xlsx');

  const profile = await getUserProfile(user.uid).catch(() => null);
  const wb = XLSX.utils.book_new();

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const summaryRows = [
    { 'שדה': 'שם המשתמש', 'ערך': user.displayName || profile?.data?.displayName || '' },
    { 'שדה': 'אימייל', 'ערך': user.email || '' },
    { 'שדה': 'תאריך הצטרפות', 'ערך': fmtDate(user.metadata?.creationTime) },
    { 'שדה': 'תאריך הייצוא', 'ערך': fmtDate(new Date()) },
    { 'שדה': 'מסלול', 'ערך': profile?.data?.plan === 'premium' ? 'Premium' : 'חינמי' },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'סיכום');

  // ── One sheet per collection ───────────────────────────────────────────────
  let total = 0;
  for (const [colKey, def] of Object.entries(SHEETS)) {
    const docs = await getUserCollectionDocs(user.uid, colKey).catch(() => []);
    if (!docs.length) continue;
    const rows = rowsFromDocs(docs, def.columns);
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = autoFitColumns(rows, def.columns);
    // Bold the header row — workbook viewers render it as a sticky-looking title.
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (sheet[addr]) sheet[addr].s = { font: { bold: true } };
    }
    XLSX.utils.book_append_sheet(wb, sheet, def.title);
    total += rows.length;
  }

  const filename = `TradeOS-Export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  return { filename, total };
}
