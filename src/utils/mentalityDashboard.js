import { localDayKey } from './calculations';

// Pure helpers behind the mental-zone landing page: the daily journal windows,
// the 7-day mood strip, the journaling streak and the headline mental stat.
// Everything here is derived from the morning/evening journal docs the page
// already subscribes to — no extra reads.

// Recommended fill windows, in local hours. `end` is exclusive (11:59 → 12).
export const JOURNAL_WINDOWS = {
  morning: { start: 5, end: 12, label: '05:00–11:59' },
  evening: { start: 19, end: 24, label: '19:00–23:59' },
};

const POSITIVE = ['inspired', 'grateful', 'excited', 'calm', 'happy'];
const NEGATIVE = ['anxious', 'frustrated'];

export const HE_DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (h, m = 0) => `${pad(h)}:${pad(m)}`;

// Firestore Timestamp | Date | ISO string | millis → Date (or null).
export function toDate(value) {
  if (!value) return null;
  const d = typeof value?.toDate === 'function' ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isNaN(d?.getTime?.()) ? null : d;
}

// Where `now` sits relative to a journal's recommended window.
//   status: 'done' | 'open' | 'upcoming' | 'closed'
//   minutesLeft — until the window closes (open) / opens (upcoming)
export function journalWindowState(kind, entry, now = new Date()) {
  const win = JOURNAL_WINDOWS[kind];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startM = win.start * 60;
  const endM = win.end * 60;
  if (entry) {
    const at = toDate(entry.createdAt);
    return { status: 'done', doneAt: at ? hhmm(at.getHours(), at.getMinutes()) : null, window: win };
  }
  if (minutes >= startM && minutes < endM) return { status: 'open', minutesLeft: endM - minutes, window: win };
  if (minutes < startM) return { status: 'upcoming', minutesLeft: startM - minutes, window: win };
  return { status: 'closed', window: win };
}

// "2 ש׳ 15 ד׳" / "40 ד׳"
export function formatDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h && m) return `${h} ש׳ ${m} ד׳`;
  if (h) return `${h} ש׳`;
  return `${m} ד׳`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tone(emotions) {
  if (!emotions.length) return null;
  const pos = emotions.filter((e) => POSITIVE.includes(e)).length;
  const neg = emotions.filter((e) => NEGATIVE.includes(e)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

// A day's 1–10 score: the mean of the morning readiness and the evening day
// rating, whichever were recorded.
export function dayScore(morning, evening) {
  const vals = [num(morning?.readinessLevel), num(evening?.dayRating)].filter((v) => v != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function indexByDate(entries) {
  const map = new Map();
  for (const e of entries || []) if (e?.date && !map.has(e.date)) map.set(e.date, e);
  return map;
}

// The last 7 local days, oldest first, each with its journals and score.
export function buildWeek(morningEntries, eveningEntries, now = new Date()) {
  const mByDate = indexByDate(morningEntries);
  const eByDate = indexByDate(eveningEntries);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = localDayKey(d);
    const morning = mByDate.get(key) || null;
    const evening = eByDate.get(key) || null;
    days.push({
      key,
      date: d,
      letter: HE_DAY_LETTERS[d.getDay()],
      isToday: i === 0,
      morning,
      evening,
      logged: !!(morning || evening),
      score: dayScore(morning, evening),
      tone: tone([morning?.emotion, evening?.emotionAfter].filter(Boolean)),
    });
  }
  return days;
}

export function weekSummary(week) {
  const scored = week.filter((d) => d.score != null);
  const avg = scored.length ? Math.round((scored.reduce((a, d) => a + d.score, 0) / scored.length) * 10) / 10 : null;
  return { logged: week.filter((d) => d.logged).length, avg };
}

// Consecutive days with at least one journal, ending today — or yesterday when
// today hasn't been journaled yet, so the streak doesn't read 0 every morning.
export function journalStreak(morningEntries, eveningEntries, now = new Date()) {
  const keys = new Set([...(morningEntries || []), ...(eveningEntries || [])].map((e) => e?.date).filter(Boolean));
  let count = 0;
  let i = keys.has(localDayKey(now)) ? 0 : 1;
  for (; i < 3660; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (!keys.has(localDayKey(d))) break;
    count++;
  }
  return count;
}

// One headline number for the stats tile, from the last `days` days:
// plan adherence (evening "followed the plan") when recorded, else the average
// morning readiness, else null.
export function headlineMentalStat(morningEntries, eveningEntries, now = new Date(), days = 30) {
  const from = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)));
  const inRange = (e) => e?.date && e.date >= from;
  const plan = (eveningEntries || []).filter((e) => inRange(e) && typeof e.followedPlan === 'boolean');
  if (plan.length) {
    const yes = plan.filter((e) => e.followedPlan).length;
    return { kind: 'plan', value: Math.round((yes / plan.length) * 100), yes, total: plan.length, days };
  }
  const ready = (morningEntries || []).filter(inRange).map((e) => num(e.readinessLevel)).filter((v) => v != null);
  if (ready.length) {
    const avg = Math.round((ready.reduce((a, b) => a + b, 0) / ready.length) * 10) / 10;
    return { kind: 'readiness', value: avg, total: ready.length, days };
  }
  return null;
}
