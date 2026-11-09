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

function journalNameForDemo(journals) {
  const found = (journals || []).find((journal) => journal && !journal.archived && journal.name);
  const name = typeof found?.name === 'string' ? found.name.trim() : '';
  return name || NOTEBOOK_DEMO_JOURNAL_NAME;
}

/**
 * A few notes across two Jerusalem months. `now` only picks the month.
 * The text is synthetic.
 */
export function buildNotebookDemoEntries({ journals = [], now = new Date() } = {}) {
  const day = notebookDayKey(now) || '2026-03-15';
  const month = day.slice(0, 7);
  const prev = shiftMonthKey(month, -1) || month;
  const journalName = journalNameForDemo(journals);
  const raw = [
    {
      id: 'demo-nb-lesson',
      demo: true,
      title: 'לקח על BTC',
      body: 'היום **לא רדפתי** אחרי הפריצה.\n\n- חיכיתי לאישור\n- שמרתי על הסיכון',
      tags: ['לקח', 'BTC'],
      date: `${month}-18`,
      journalName,
      createdAt: `${month}-18T08:00:00Z`,
      updatedAt: `${month}-18T08:00:00Z`,
    },
    {
      id: 'demo-nb-idea',
      demo: true,
      title: 'רעיון Long',
      body: 'ETH עדיין מתחת ל-EMA. לא להיכנס לפני אישור.',
      tags: ['רעיון'],
      date: `${month}-04`,
      createdAt: `${month}-04T08:00:00Z`,
      updatedAt: `${month}-04T08:00:00Z`,
    },
    {
      id: 'demo-nb-week',
      demo: true,
      title: 'סיכום שבוע',
      body: 'שבוע שקט. פחות עסקאות, יותר המתנה.',
      tags: ['שבוע'],
      date: `${prev}-20`,
      journalName,
      createdAt: `${prev}-20T08:00:00Z`,
      updatedAt: `${prev}-20T08:00:00Z`,
    },
  ];
  return raw.map((row) => {
    const result = validateNotebookEntry(row);
    if (!result.ok) return null;
    return { ...result.entry, id: row.id, demo: true };
  }).filter(Boolean);
}
