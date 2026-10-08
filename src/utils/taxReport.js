// Israeli tax report — the pure math behind the "דוח מס" page.
//
// Every CLOSED trade in the chosen year (by exit date in Israel time, falling
// back to the entry date) is converted from $ to ₪ with the Bank of Israel
// representative rate of its closing day — or the nearest previous business
// day when that day has no rate (weekend / holiday / not published yet).
// Trades on the Tel Aviv exchange (tickers ending .TA) are already in ₪ and
// are not converted.
//
// INFORMATIONAL ONLY — this is a helper for the user's accountant, not tax
// advice. The UI must say so next to every number it derives from here.

import { isClosedTrade, safePnl, partialRealizedPnl } from './calculations';

export const TAX_RATE = 0.25;
export const TAX_TZ = 'Asia/Jerusalem';
// How far back we look for a rate before calling it missing. Israeli holidays
// plus a weekend never exceed ~6 days; anything longer means the feed has a gap.
export const MAX_RATE_LOOKBACK_DAYS = 10;

export const ASSET_CLASS_LABELS = {
  crypto: 'קריפטו',
  stocks: 'מניות',
  futures_cme: 'חוזים עתידיים',
};
export const ASSET_CLASS_ORDER = ['crypto', 'stocks', 'futures_cme'];

export const MONTH_LABELS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TAX_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

const toDate = (v) => {
  if (!v) return null;
  try {
    const d = typeof v.toDate === 'function' ? v.toDate() : v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch { return null; }
};

/** 'YYYY-MM-DD' of the given moment in Israel time ('' when unparseable). */
export function jerusalemDayKey(value) {
  const d = toDate(value);
  return d ? dayFmt.format(d) : '';
}

/** The Israel-time day a trade closed: exit date, falling back to entry date. */
export function tradeCloseDay(t) {
  return jerusalemDayKey(t?.exitDate) || jerusalemDayKey(t?.entryDate);
}

export function tradeSymbol(t) {
  return String(t?.pair || t?.symbol || '').trim().toUpperCase();
}

/** Tel Aviv listings are quoted (and their P&L stored) in shekels already. */
export function isIlsTrade(t) {
  return /\.TA$/.test(tradeSymbol(t));
}

/** Trade's asset class: its own field, else its journal's, else crypto (legacy rows). */
export function tradeAssetClass(t, journal) {
  const c = t?.assetClass || journal?.assetClass || 'crypto';
  return ASSET_CLASS_LABELS[c] ? c : 'crypto';
}

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The date range of rates a year's report needs (a cushion before Jan 1 for early-January holidays). */
export function fxRangeForYear(year) {
  return { from: addDays(`${year}-01-01`, -MAX_RATE_LOOKBACK_DAYS - 5), to: `${year}-12-31` };
}

/**
 * Rate for `day`: that day's rate, else the nearest previous day that has one
 * (within MAX_RATE_LOOKBACK_DAYS). → { rate, day } or null.
 */
export function findRate(rates, day, maxLookback = MAX_RATE_LOOKBACK_DAYS) {
  if (!rates || !day) return null;
  for (let i = 0; i <= maxLookback; i++) {
    const d = i === 0 ? day : addDays(day, -i);
    const r = Number(rates[d]);
    if (Number.isFinite(r) && r > 0) return { rate: r, day: d };
  }
  return null;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const emptyBucket = () => ({ gains: 0, losses: 0, net: 0, count: 0 });

/**
 * Build the year's report.
 *   trades       — all the user's trades (any journal, any status)
 *   journals     — the user's journals ([{ id, name, assetClass }])
 *   year         — calendar year (number)
 *   journalIds   — ids to include; null/undefined = every journal (+ legacy
 *                  trades with no journal, like the dashboard)
 *   rates        — { 'YYYY-MM-DD': usdIls }
 *   fallbackDays — days whose rate came from the fallback source (not BOI)
 */
export function buildTaxReport({ trades = [], journals = [], year, journalIds = null, rates = {}, fallbackDays = [] }) {
  const y = String(year);
  const yearEnd = `${y}-12-31`;
  const journalById = new Map(journals.map((j) => [j.id, j]));
  const fallbackSet = new Set(fallbackDays);
  const wanted = journalIds ? new Set(journalIds) : null;

  const inScope = (t) => {
    if (wanted) return !!t.journalId && wanted.has(t.journalId);
    return !t.journalId || journalById.has(t.journalId);
  };

  const rows = [];
  const missingRate = [];
  let partialCount = 0;
  let partialRealized = 0;

  for (const t of trades) {
    if (!t || !inScope(t)) continue;
    if (t.status === 'partial') {
      const entryDay = jerusalemDayKey(t.entryDate);
      if (entryDay && entryDay <= yearEnd) {
        partialCount += 1;
        partialRealized += partialRealizedPnl(t);
      }
      continue;
    }
    if (!isClosedTrade(t)) continue;
    const day = tradeCloseDay(t);
    if (!day || day.slice(0, 4) !== y) continue;

    const journal = journalById.get(t.journalId);
    const ils = isIlsTrade(t);
    const pnl = safePnl(t);
    const fees = num(t.fees);
    const found = findRate(rates, day);
    const row = {
      id: t.id,
      day,
      month: Number(day.slice(5, 7)),
      symbol: tradeSymbol(t) || '—',
      direction: t.direction === 'short' ? 'short' : t.direction === 'long' ? 'long' : '',
      assetClass: tradeAssetClass(t, journal),
      journalId: t.journalId || null,
      journalName: journal?.name || '',
      currency: ils ? 'ILS' : 'USD',
      pnl,
      fees,
      rate: found?.rate ?? null,
      rateDay: found?.day ?? null,
      fallback: !!found && fallbackSet.has(found.day),
      missingRate: false,
      pnlIls: null,
      pnlUsd: null,
      feesIls: null,
    };
    if (ils) {
      // Already shekels: no conversion. The $ equivalent is informational only.
      row.pnlIls = pnl;
      row.feesIls = fees;
      row.pnlUsd = found ? pnl / found.rate : null;
    } else if (found) {
      row.pnlUsd = pnl;
      row.pnlIls = pnl * found.rate;
      row.feesIls = fees * found.rate;
    } else {
      row.missingRate = true;
      row.pnlUsd = pnl;
      missingRate.push(row);
    }
    rows.push(row);
  }

  rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...emptyBucket() }));
  const byAsset = Object.fromEntries(ASSET_CLASS_ORDER.map((c) => [c, emptyBucket()]));
  let gains = 0;
  let losses = 0;
  let netUsd = 0;
  let feesIls = 0;
  let feesUsd = 0;
  const fallbackUsed = new Set();

  for (const r of rows) {
    if (r.pnlIls == null) continue; // missing rate — listed, not totalled
    const v = r.pnlIls;
    if (v > 0) gains += v; else losses += v;
    if (r.pnlUsd != null) netUsd += r.pnlUsd;
    feesIls += r.feesIls || 0;
    if (r.currency === 'USD') feesUsd += r.fees;
    else if (r.rate) feesUsd += r.fees / r.rate;
    if (r.fallback && r.currency === 'USD') fallbackUsed.add(r.rateDay);

    const m = months[r.month - 1];
    const a = byAsset[r.assetClass];
    for (const b of [m, a]) {
      if (v > 0) b.gains += v; else b.losses += v;
      b.net += v;
      b.count += 1;
    }
  }

  const net = gains + losses;
  const lossesOffset = Math.min(gains, -losses);
  const taxable = Math.max(0, net);

  return {
    year: Number(year),
    rows,
    months,
    byAsset,
    totals: {
      gainsIls: gains,
      lossesIls: losses,
      netIls: net,
      netUsd,
      lossesOffsetIls: lossesOffset,
      taxableIls: taxable,
      estimatedTaxIls: taxable * TAX_RATE,
      carryForwardLossIls: net < 0 ? -net : 0,
      feesIls,
      feesUsd,
      tradeCount: rows.length - missingRate.length,
    },
    missingRate,
    fallbackDays: [...fallbackUsed].sort(),
    partial: { count: partialCount, realized: partialRealized },
  };
}

const DIRECTION_LABELS = { long: 'לונג', short: 'שורט' };
const r2 = (v) => (v == null || !Number.isFinite(v) ? '' : Math.round(v * 100) / 100);
const r4 = (v) => (v == null || !Number.isFinite(v) ? '' : Math.round(v * 10000) / 10000);
const ddmmyyyy = (day) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '');

export const CSV_HEADERS = ['תאריך סגירה', 'נכס', 'כיוון', 'רווח/הפסד $', 'שער', 'רווח/הפסד ₪', 'עמלות', 'סוג נכס', 'הערה'];

/** CSV rows for the report (one per trade + a totals block). Fees are in ₪. */
export function taxCsvRows(report) {
  const rows = report.rows.map((r) => {
    const notes = [];
    if (r.currency === 'ILS') notes.push('עסקה בשקלים (בורסת ת״א) — ללא המרה');
    if (r.missingRate) notes.push('חסר שער — לא נכלל בסיכום');
    else if (r.currency === 'USD' && r.rateDay && r.rateDay !== r.day) notes.push(`שער מיום ${ddmmyyyy(r.rateDay)}`);
    if (r.fallback && r.currency === 'USD') notes.push('שער חלופי (Yahoo) — לא שער יציג');
    return [
      ddmmyyyy(r.day),
      r.symbol,
      DIRECTION_LABELS[r.direction] || '',
      r.currency === 'USD' ? r2(r.pnl) : '',
      r.currency === 'USD' ? r4(r.rate) : '',
      r2(r.pnlIls),
      r2(r.feesIls),
      ASSET_CLASS_LABELS[r.assetClass] || '',
      notes.join('; '),
    ];
  });
  const t = report.totals;
  const blank = ['', '', '', '', '', '', '', '', ''];
  const line = (label, ils) => [label, '', '', '', '', r2(ils), '', '', ''];
  rows.push(blank);
  rows.push(line('סה״כ רווחים', t.gainsIls));
  rows.push(line('סה״כ הפסדים', t.lossesIls));
  rows.push(line('רווח/הפסד נטו', t.netIls));
  rows.push(line('הפסדים שקוזזו', t.lossesOffsetIls));
  rows.push(line(`מס משוער (${TAX_RATE * 100}%)`, t.estimatedTaxIls));
  if (t.carryForwardLossIls > 0) rows.push(line('הפסד להעברה לשנה הבאה', t.carryForwardLossIls));
  rows.push(line('סה״כ עמלות', t.feesIls));
  rows.push(blank);
  rows.push(['הדוח הוא כלי עזר בלבד ואינו ייעוץ מס. יש לבדוק מול רואה חשבון.', '', '', '', '', '', '', '', '']);
  return { headers: CSV_HEADERS, rows };
}
