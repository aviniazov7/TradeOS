import { normalizeShareFields } from './journalShareFilter';

// Same sentence the Worker returns. The screen always shows this text, so a
// registered address and an unknown address cannot be told apart.
export const SHARE_CREATED_MESSAGE = 'אם הכתובת רשומה ב-TradeOS, השיתוף נשמר.';

// Public read-only page. The token is the path segment; viewing does not sign in.
export function journalShareLink(token, origin) {
  const path = `/share/${encodeURIComponent(token)}`;
  const base = String(origin || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export const SHARE_DAY_OPTIONS = [7, 30, 90];

export const SHARE_FIELD_ROWS = [
  { key: 'trades', label: 'עסקאות', hint: 'זוג, כיוון, מחירים, תוצאה וסטטיסטיקה.' },
  { key: 'notes', label: 'הערות', hint: 'הערת העסקה וסיבת הכניסה. רק יחד עם העסקאות.', needs: 'trades' },
  { key: 'emotions', label: 'רגשות וטעויות', hint: 'רגש, טעויות ודירוגים. רק יחד עם העסקאות.', needs: 'trades' },
  { key: 'balances', label: 'יתרת פתיחה', hint: 'יתרת הפתיחה וגודל חשבון הפרופ. בלי יתרה חיה.' },
  { key: 'tradingView', label: 'קישורי גרף', hint: 'קישורי TradingView. רק יחד עם העסקאות.', needs: 'trades' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeOwnerEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isOwnerEmail(ownerEmail, typed) {
  const owner = normalizeOwnerEmail(ownerEmail);
  const email = normalizeOwnerEmail(typed);
  return owner.includes('@') && owner === email;
}

export function jerusalemToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// The Worker rejects a manual date more than 366 days ahead.
export function maxShareDate(now = new Date()) {
  const [year, month, day] = jerusalemToday(now).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 366);
  return date.toISOString().slice(0, 10);
}

// Notes, emotions and chart links are trade fields. Stored off unless trades is on.
export function effectiveShareFields(fields) {
  const next = normalizeShareFields(fields);
  if (!next.trades) {
    next.notes = false;
    next.emotions = false;
    next.tradingView = false;
  }
  return next;
}

// One end date, always: rolling days or a manual day. Never both, never neither.
export function shareExpiryPatch({ expiry, expiresOn }) {
  if (expiry === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn || '')) return { error: 'בחרו תאריך סיום' };
    return { body: { expiresOn } };
  }
  const days = Number(expiry);
  if (!SHARE_DAY_OPTIONS.includes(days)) return { error: 'בחרו תוקף' };
  return { body: { days } };
}

export function shareRequestBody({ journalId, email, fields, expiry, expiresOn }) {
  const normalized = normalizeOwnerEmail(email);
  if (!EMAIL_RE.test(normalized) || normalized.length > 200) return { error: 'כתובת לא תקינה' };
  const expiryPatch = shareExpiryPatch({ expiry, expiresOn });
  if (expiryPatch.error) return expiryPatch;
  return {
    body: {
      journalId,
      email: normalized,
      fields: effectiveShareFields(fields),
      ...expiryPatch.body,
    },
  };
}

export function sharesForJournal(shares, journalId) {
  return (Array.isArray(shares) ? shares : []).filter((share) => share?.journalId === journalId);
}
