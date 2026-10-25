// Personal, calm reminder copy for the admin "come back" email.
// Pure: no fetch. index.js reads the recipient's trades, journals and last
// login, then this module turns those numbers into a short Hebrew update.
// Missing numbers are omitted — nothing here invents a count.

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const PATHS = ['/', '/market', '/news', '/journal', '/journal?tab=analytics', '/mentality', '/premium'];

// Phrases that read as a promo or a market alert. Checked as substrings,
// except "בדוק", which must be its own word so "לבדוק" in calm copy stays.
const HYPE = [
  'אל תפספס',
  'צפה בתנועה',
  'מדהים',
  'הכותרת החמה',
  'מתגעגעים',
  'אל תחמיץ',
  'זינק',
  'צנח',
  'מטורף',
  'פצצה',
  'הזדמנות',
  'דחוף',
];

const BDOK = /(?:^|[^\p{L}])בדוק(?:[^\p{L}]|$)/u;

export function israelDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// Shift a YYYY-MM-DD key by whole calendar days, without DST drift.
export function dayKeyOffset(dayKey, deltaDays) {
  const [y, m, d] = String(dayKey || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function daysSinceLogin(lastActive, now = new Date()) {
  if (lastActive == null || lastActive === '') return null;
  const then = new Date(lastActive);
  if (Number.isNaN(then.getTime())) return null;
  const today = israelDayKey(now);
  const thenKey = israelDayKey(then);
  if (!DAY_KEY_RE.test(today) || !DAY_KEY_RE.test(thenKey)) return null;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${thenKey}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 86400000));
}

export function countFromAggregation(rows) {
  if (!Array.isArray(rows)) return null;
  const raw = rows[0]?.result?.aggregateFields?.count;
  if (!raw) return null;
  const n = Number(raw.integerValue ?? raw.doubleValue);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function datesFromQuery(rows) {
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const row of rows) {
    const d = row?.document?.fields?.date?.stringValue;
    if (typeof d === 'string' && DAY_KEY_RE.test(d)) out.push(d);
  }
  return out;
}

export function combineCounts(a, b) {
  if (a == null && b == null) return null;
  return (a || 0) + (b || 0);
}

export function combineDates(a, b) {
  if (a == null && b == null) return null;
  return [...(a || []), ...(b || [])];
}

// weekCount / openCount: non-negative integers, or null when the read failed.
// journalDates: 'YYYY-MM-DD' strings (morning + evening), or null.
// lastActive: ISO timestamp, or null.
export function summarizeReminderStats({ weekCount = null, openCount = null, journalDates = null, lastActive = null, now = new Date() } = {}) {
  const weekKey = dayKeyOffset(israelDayKey(now), -6);
  let journalDays = null;
  if (Array.isArray(journalDates)) {
    const set = new Set(journalDates.filter((d) => DAY_KEY_RE.test(d) && (!weekKey || d >= weekKey)));
    journalDays = set.size;
  }
  return {
    weekTrades: Number.isInteger(weekCount) && weekCount >= 0 ? weekCount : null,
    openTrades: Number.isInteger(openCount) && openCount >= 0 ? openCount : null,
    journalDays,
    daysSinceLogin: daysSinceLogin(lastActive, now),
  };
}

// Firestore bodies for one recipient. index.js posts them; tests lock the shape.
export function weekTradesWhere(now = new Date()) {
  return {
    fieldFilter: {
      field: { fieldPath: 'entryDate' },
      op: 'GREATER_THAN_OR_EQUAL',
      value: { timestampValue: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    },
  };
}

export function statusWhere(status) {
  return {
    fieldFilter: {
      field: { fieldPath: 'status' },
      op: 'EQUAL',
      value: { stringValue: status },
    },
  };
}

export function reminderTradeCountQuery(where) {
  return {
    structuredAggregationQuery: {
      structuredQuery: {
        from: [{ collectionId: 'trades' }],
        where,
      },
      aggregations: [{ alias: 'count', count: {} }],
    },
  };
}

export function journalDatesQuery(collectionId, now = new Date()) {
  const weekKey = dayKeyOffset(israelDayKey(now), -6);
  return {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'date' },
          op: 'GREATER_THAN_OR_EQUAL',
          value: { stringValue: weekKey },
        },
      },
      select: { fields: [{ fieldPath: 'date' }] },
      limit: 40,
    },
  };
}

function weekLine(n) {
  return n === 1 ? 'השבוע תיעדת עסקה אחת' : `השבוע תיעדת ${n} עסקאות`;
}
function openLine(n) {
  return n === 1 ? 'יש לך עסקה פתוחה אחת' : `יש לך ${n} עסקאות פתוחות`;
}
function journalLine(n) {
  return n === 1 ? 'השבוע כתבת ביומן יום אחד' : `השבוע כתבת ביומן ${n} ימים`;
}
function loginLine(n) {
  if (n === 0) return 'נכנסת היום';
  if (n === 1) return 'הכניסה האחרונה שלך הייתה אתמול';
  return `הכניסה האחרונה שלך הייתה לפני ${n} ימים`;
}

// Sentences the recipient can verify. Zero counts are skipped (nothing to
// report). A known last-login day is always included, including "today".
export function personalFacts(stats) {
  const lines = [];
  const s = stats || {};
  if (Number.isInteger(s.weekTrades) && s.weekTrades > 0) lines.push(weekLine(s.weekTrades));
  if (Number.isInteger(s.openTrades) && s.openTrades > 0) lines.push(openLine(s.openTrades));
  if (Number.isInteger(s.journalDays) && s.journalDays > 0) lines.push(journalLine(s.journalDays));
  if (Number.isInteger(s.daysSinceLogin) && s.daysSinceLogin >= 0) lines.push(loginLine(s.daysSinceLogin));
  return lines;
}

// Numbers the model is allowed to write: only positive counts we handed it.
export function allowedStatNumbers(stats) {
  const allowed = new Set();
  const s = stats || {};
  for (const n of [s.weekTrades, s.openTrades, s.journalDays]) {
    if (Number.isInteger(n) && n > 0) allowed.add(String(n));
  }
  if (Number.isInteger(s.daysSinceLogin) && s.daysSinceLogin > 0) allowed.add(String(s.daysSinceLogin));
  return allowed;
}

export function isCalm(text) {
  const s = String(text || '');
  if (/\p{Extended_Pictographic}/u.test(s)) return false;
  if (/[!！]/.test(s)) return false;
  if (/[A-Z]{3,}/.test(s)) return false;
  if (HYPE.some((w) => s.includes(w))) return false;
  if (BDOK.test(s)) return false;
  if (/%/.test(s)) return false;
  return true;
}

export const REMINDER_SYSTEM_PROMPT = `אתה כותב עדכון אישי קצר בעברית למשתמש של TradeOS, יומן מסחר.
העדכון מבוסס רק על הנתונים האישיים שבקלט. אם נתון לא מופיע בקלט — אל תזכיר אותו ואל תמציא מספר.
מסגרת: עדכון אישי על היומן של הנמען. לא התראת שוק, לא תנועת מטבע, לא אחוזים.
טון: רגוע, קצר, ידידותי.
אסור: אמוג'י, סימן קריאה, מילים באותיות גדולות באנגלית, ומילות לחץ או התלהבות כמו בדוק, אל תפספס, צפה בתנועה, מדהים, זינק, דחוף, הזדמנות.
בלי המלצת קנייה או מכירה.
החזר JSON בלבד:
{"title": "נושא עד 70 תווים", "push": "משפט אחד להתראה, עד 140 תווים", "email": "גוף: משפט אחד עד שלושה, מופרדים בשורה ריקה", "cta": "טקסט כפתור עד 22 תווים", "path": "/journal"}`;

export function buildReminderUserMessage(stats) {
  const lines = personalFacts(stats);
  if (!lines.length) return 'אין נתונים אישיים. כתוב עדכון כללי קצר בלי מספרים.';
  return `נתונים אישיים של הנמען:\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

const CLOSING = 'אפשר לפתוח את היומן כשנוח.';

export function templateReminder(stats) {
  const lines = personalFacts(stats);
  const title = (lines[0] || 'עדכון קצר מהיומן').slice(0, 80);
  const email = lines.length
    ? `${lines.join('\n\n')}\n\n${CLOSING}`
    : 'היומן שלך מחכה כשתרצה להוסיף עסקה או לרשום איך עבר היום.';
  const push = (lines[0] || 'עדכון קצר מהיומן שלך.').slice(0, 180);
  return { title, push, email, cta: 'ליומן', path: '/journal' };
}

export function validateReminder(raw, stats) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim().slice(0, 80);
  const push = String(raw.push || '').trim().slice(0, 180);
  const email = String(raw.email || '').trim().slice(0, 1500);
  const cta = String(raw.cta || 'ליומן').trim().slice(0, 30);
  if (!title || !push || !email || !cta) return null;
  const blob = `${title}\n${push}\n${email}\n${cta}`;
  if (!isCalm(blob)) return null;
  const allowed = allowedStatNumbers(stats);
  const mentioned = [...blob.matchAll(/\d+/g)].map((m) => m[0]);
  if (mentioned.some((n) => !allowed.has(n))) return null;
  return {
    title,
    push,
    email,
    cta,
    path: PATHS.includes(raw.path) ? raw.path : '/journal',
  };
}

// Admin draft + this recipient's stats → the subject/headline/body to send.
// With stats, the subject is the first personal sentence. The admin's own
// calm sentences stay after them, except paragraphs that carry a number
// (another recipient's counts, or a market figure) or a hype phrase.
// With no stats, the admin draft is sent unchanged.
export function personalizeReminder({ subject, headline, message, stats }) {
  const facts = personalFacts(stats);
  if (!facts.length) {
    return {
      subject: String(subject || headline || 'TradeOS'),
      headline: String(headline || subject || ''),
      message: String(message || ''),
    };
  }
  const factSet = new Set(facts);
  const extra = String(message || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/\d/.test(p))
    .filter((p) => isCalm(p))
    .filter((p) => !factSet.has(p))
    .join('\n\n');
  const body = extra ? `${facts.join('\n\n')}\n\n${extra}` : `${facts.join('\n\n')}\n\n${CLOSING}`;
  return { subject: facts[0], headline: facts[0], message: body };
}
