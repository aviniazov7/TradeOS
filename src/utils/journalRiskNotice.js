// Hebrew copy and the per-day dismissal for a breached journal risk rule.
// This module does not read or write Firestore, and it does not send push
// or email. Recording a trade stays allowed.

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const text = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `\u200E$${text}`;
}

function plain(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `\u200E${n}` : '';
}

function mark(value) {
  return `\u200E${value ?? ''}`;
}

const LINES = [
  ['weeklyLoss', 'הפסד שבועי', (row) => `הפסד השבוע ${money(row.loss)} מתוך ${money(row.cap)}`],
  ['dailyLossPercent', 'הפסד יומי', (row) => `הפסד היום ${money(row.loss)} מתוך ${money(row.cap)} (${plain(row.percent)}% מיתרת הפתיחה)`],
  ['weeklyLossPercent', 'הפסד שבועי באחוזים', (row) => `הפסד השבוע באחוזים ${money(row.loss)} מתוך ${money(row.cap)} (${plain(row.percent)}% מיתרת הפתיחה)`],
  ['maxTrades', 'עסקאות ביום', (row) => `נסגרו ${plain(row.count)} עסקאות היום, והתקרה היא ${plain(row.max)}`],
  ['tradingHours', 'שעות מסחר', (row) => `${plain(row.outsideCount)} עסקאות נכנסו מחוץ לשעות ${mark(row.start)}–${mark(row.end)}`],
];

/** Null when nothing enabled is breached. Otherwise the banner and the new-trade warning. */
export function journalRiskBreachNotice(state) {
  if (!state?.breached) return null;
  const lines = [];
  const labels = [];
  for (const [key, label, line] of LINES) {
    const row = state[key];
    if (!row?.breached) continue;
    labels.push(label);
    lines.push({ id: key, text: line(row) });
  }
  if (!lines.length) return null;
  return {
    title: 'חריגה מכללי הסיכון. הרישום עדיין פתוח.',
    lines,
    summary: `חריגה מכללי הסיכון: ${labels.join(', ')}. הרישום עדיין פתוח.`,
  };
}

export function riskBreachDismissToken(uid, journalId, dayKey) {
  return `tradeos_risk_breach_${uid || 'local'}_${journalId || 'journal'}_${dayKey || ''}`;
}

export function readRiskBreachDismissed(storage, uid, journalId, dayKey) {
  if (!dayKey) return false;
  try {
    return storage?.getItem(riskBreachDismissToken(uid, journalId, dayKey)) === '1';
  } catch {
    return false;
  }
}

export function writeRiskBreachDismissed(storage, uid, journalId, dayKey) {
  if (!dayKey) return;
  try {
    storage?.setItem(riskBreachDismissToken(uid, journalId, dayKey), '1');
  } catch {
    /* private mode: the banner still hides for this visit */
  }
}
