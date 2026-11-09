import { businessDayKey, validateBusinessEntry } from './businessLedger';

// Synthetic rows for the marked demo only. They are not a user's book and
// they are never sent to Firestore.

export const BUSINESS_DEMO_JOURNAL_ID = 'demo-journal';
export const BUSINESS_DEMO_JOURNAL_NAME = 'יומן לדוגמה';

export function shiftMonthKey(month, delta) {
  const match = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!match) return '';
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  const key = shifted.toISOString().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : '';
}

function journalForDemo(journals) {
  const found = (journals || []).find((journal) => journal && !journal.archived && journal.id && journal.name);
  return found?.id || BUSINESS_DEMO_JOURNAL_ID;
}

/**
 * A small multi-currency month plus one row in the previous month.
 * `now` is only used to pick the Jerusalem month. Amounts are synthetic.
 */
export function buildBusinessDemoEntries({ journals = [], now = new Date() } = {}) {
  const day = businessDayKey(now) || '2026-03-15';
  const month = day.slice(0, 7);
  const prev = shiftMonthKey(month, -1) || month;
  const journalId = journalForDemo(journals);
  const raw = [
    {
      id: 'demo-biz-fee',
      demo: true,
      kind: 'expense',
      category: 'challenge_fee',
      amount: 155,
      currency: 'USD',
      date: `${month}-03`,
      journalId,
      note: 'דמי אתגר לדוגמה',
    },
    {
      id: 'demo-biz-payout',
      demo: true,
      kind: 'income',
      category: 'payout',
      amount: 400,
      currency: 'USD',
      date: `${month}-18`,
      journalId,
      note: 'תשלום לדוגמה',
    },
    {
      id: 'demo-biz-sub',
      demo: true,
      kind: 'expense',
      category: 'subscription',
      amount: 49,
      currency: 'ILS',
      date: `${month}-05`,
      note: 'מנוי נתונים לדוגמה',
    },
    {
      id: 'demo-biz-withdraw',
      demo: true,
      kind: 'income',
      category: 'withdrawal',
      amount: 25,
      currency: 'USDT',
      date: `${month}-12`,
      note: 'משיכה לדוגמה',
    },
    {
      id: 'demo-biz-reset',
      demo: true,
      kind: 'expense',
      category: 'reset',
      amount: 80,
      currency: 'USD',
      date: `${prev}-20`,
      journalId,
      note: 'איפוס לדוגמה',
    },
  ];
  return raw.map((row) => {
    const result = validateBusinessEntry(row);
    if (!result.ok) return null;
    return { ...result.entry, id: row.id, demo: true };
  }).filter(Boolean);
}
