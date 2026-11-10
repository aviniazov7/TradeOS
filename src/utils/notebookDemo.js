import { notebookDayKey, validateNotebookEntry } from './notebook';

// Synthetic rows for the marked demo only. They are not a user's notebook
// and they are never sent to Firestore.

export const NOTEBOOK_DEMO_JOURNAL_NAME = 'יומן לדוגמה';

function shiftMonthKey(month, delta) {
  const match = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!match) return '';
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  const key = shifted.toISOString().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : '';
}

/** Move a civil `YYYY-MM-DD` by whole days. Month and year boundaries roll over. */
function shiftDayKey(day, deltaDays) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  if (!match || !Number.isFinite(deltaDays)) return '';
  const shifted = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + deltaDays,
  ));
  if (Number.isNaN(shifted.getTime())) return '';
  const key = shifted.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

function daysBefore(today, days) {
  const shifted = shiftDayKey(today, -Math.abs(days));
  if (!shifted || shifted > today) return today;
  return shifted;
}

/**
 * Newest sample stays in the current month. Subtracting a couple of days on
 * the 1st or 2nd would land in last month, so that case uses today itself.
 */
function recentDemoDay(today, days) {
  const shifted = daysBefore(today, days);
  if (shifted.slice(0, 7) === today.slice(0, 7)) return shifted;
  return today;
}

/** Day 20 of the previous Jerusalem month. Always before `today`. */
function previousMonthDemoDay(today) {
  const prev = shiftMonthKey(today.slice(0, 7), -1);
  const candidate = prev ? `${prev}-20` : '';
  if (candidate && candidate <= today && notebookDayKey(candidate)) return candidate;
  return daysBefore(today, 32);
}

function demoInstant(day, today, instant) {
  if (!day || day >= today) return instant.toISOString();
  // Noon UTC is 14:00 or 15:00 in Jerusalem, so the civil day stays `day`,
  // and it is already over before the next Jerusalem day begins.
  return `${day}T12:00:00.000Z`;
}

function journalNameForDemo(journals) {
  const found = (journals || []).find((journal) => journal && !journal.archived && journal.name);
  const name = typeof found?.name === 'string' ? found.name.trim() : '';
  return name || NOTEBOOK_DEMO_JOURNAL_NAME;
}

/**
 * A few notes across two Jerusalem months. Days are relative to `now`
 * (today minus a fixed offset, or today when that offset would leave the
 * month or land in the future). The text is synthetic.
 */
export function buildNotebookDemoEntries({ journals = [], now = new Date() } = {}) {
  const instant = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const today = notebookDayKey(instant) || notebookDayKey(new Date()) || '1970-01-01';
  const lessonDay = recentDemoDay(today, 2);
  const ideaDay = daysBefore(today, 9);
  const weekDay = previousMonthDemoDay(today);
  const journalName = journalNameForDemo(journals);
  const stamp = (day) => demoInstant(day, today, instant);
  const raw = [
    {
      id: 'demo-nb-lesson',
      demo: true,
      title: 'לקח על BTC',
      body: 'היום **לא רדפתי** אחרי הפריצה.\n\n- חיכיתי לאישור\n- שמרתי על הסיכון',
      tags: ['לקח', 'BTC'],
      date: lessonDay,
      journalName,
      createdAt: stamp(lessonDay),
      updatedAt: stamp(lessonDay),
    },
    {
      id: 'demo-nb-idea',
      demo: true,
      title: 'רעיון Long',
      body: 'ETH עדיין מתחת ל-EMA. לא להיכנס לפני אישור.',
      tags: ['רעיון'],
      date: ideaDay,
      createdAt: stamp(ideaDay),
      updatedAt: stamp(ideaDay),
    },
    {
      id: 'demo-nb-week',
      demo: true,
      title: 'סיכום שבוע',
      body: 'שבוע שקט. פחות עסקאות, יותר המתנה.',
      tags: ['שבוע'],
      date: weekDay,
      journalName,
      createdAt: stamp(weekDay),
      updatedAt: stamp(weekDay),
    },
  ];
  return raw.map((row) => {
    const result = validateNotebookEntry(row);
    if (!result.ok) return null;
    return { ...result.entry, id: row.id, demo: true };
  }).filter(Boolean);
}
