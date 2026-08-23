// Pure customer-state logic behind the admin panel: who counts as Premium, who
// is about to lapse, who has gone quiet, and how a Firestore timestamp of any
// vintage becomes a date.
//
// These drove real decisions — a Premium badge, a churn-risk list, the weekly
// digest's expiring-soon count — from inside a 3,200-line component, where
// nothing could reach them from a test. They are pure functions of a user
// document, so they belong here.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Any timestamp shape this app has ever written: a live Firestore Timestamp, a
 * serialized one ({seconds} or {_seconds}), epoch ms, an ISO string or a Date.
 * Returns null when unparseable — never an Invalid Date, which silently
 * poisons every comparison downstream.
 */
export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'object') {
    const s = v.seconds ?? v._seconds;
    if (typeof s === 'number') return new Date(s * 1000);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

/**
 * Admins are always Premium. A plan with no expiry is lifetime. An expiry MUST
 * go through toDate: planExpires is a Firestore Timestamp, and `new Date(ts)`
 * yields Invalid Date → NaN → a paying customer displayed as free. If it is set
 * but genuinely unparseable the badge is kept, because `plan` says premium —
 * better to over-grant a badge than to strip one from someone who paid.
 */
export function isUserPremium(u) {
  if (!u) return false;
  if (u.role === 'admin') return true;
  if (u.plan !== 'premium') return false;
  if (!u.planExpires) return true;
  const d = toDate(u.planExpires);
  return d ? d.getTime() > Date.now() : true;
}

export function lastActiveMs(u) {
  return toDate(u?.lastActive)?.getTime() || 0;
}

/** Infinity when the user has never been seen — they sort as the most stale. */
export function daysSinceActive(u, now = Date.now()) {
  const t = lastActiveMs(u);
  return t ? Math.floor((now - t) / DAY_MS) : Infinity;
}

/** Opened the app within the last `days` days. */
export function activeWithin(u, days, now = Date.now()) {
  return daysSinceActive(u, now) <= days;
}

/** Negative once expired; Infinity for lifetime or unknown. */
export function daysUntilExpiry(u, now = Date.now()) {
  const d = toDate(u?.planExpires);
  if (!d) return Infinity;
  return Math.ceil((d.getTime() - now) / DAY_MS);
}

/** Hebrew "last seen" label. */
export function relativeActive(v, now = Date.now()) {
  const d = toDate(v);
  if (!d) return 'מעולם לא';
  const diff = now - d.getTime();
  if (diff < 60 * 1000) return 'עכשיו';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `לפני ${mins} ד'`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע'`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'אתמול';
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'לפני חודש' : `לפני ${months} חודשים`;
}

export const ILS = (n) => '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL');

/** CSV cell: quoted only when it contains a quote, comma or newline. */
export function csvCell(v) {
  const s = (v ?? '').toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
