import { describe, it, expect } from 'vitest';
import {
  personalFacts, templateReminder, validateReminder, isCalm, summarizeReminderStats,
  countFromAggregation, datesFromQuery, combineCounts, combineDates, daysSinceLogin,
  journalDatesQuery, weekTradesWhere, reminderTradeCountQuery, statusWhere,
  personalizeReminder, buildReminderUserMessage,
} from './reminderCopy';

const NOW = new Date('2026-10-25T12:00:00Z');

describe('personalFacts', () => {
  it('turns the recipient counts into calm sentences', () => {
    const lines = personalFacts({ weekTrades: 3, openTrades: 2, journalDays: 4, daysSinceLogin: 5 });
    expect(lines).toEqual([
      'השבוע תיעדת 3 עסקאות',
      'יש לך 2 עסקאות פתוחות',
      'השבוע כתבת ביומן 4 ימים',
      'הכניסה האחרונה שלך הייתה לפני 5 ימים',
    ]);
  });

  it('uses the singular and skips zeros', () => {
    expect(personalFacts({ weekTrades: 1, openTrades: 0, journalDays: 1, daysSinceLogin: 0 })).toEqual([
      'השבוע תיעדת עסקה אחת',
      'השבוע כתבת ביומן יום אחד',
      'נכנסת היום',
    ]);
    expect(personalFacts({ weekTrades: 0, openTrades: null, journalDays: null, daysSinceLogin: null })).toEqual([]);
  });

  it('says yesterday for a login one day ago', () => {
    expect(personalFacts({ daysSinceLogin: 1 })).toEqual(['הכניסה האחרונה שלך הייתה אתמול']);
  });
});

describe('templateReminder', () => {
  it('builds a personal update and stays calm', () => {
    const stats = { weekTrades: 3, openTrades: 2, journalDays: null, daysSinceLogin: 1 };
    const h = templateReminder(stats);
    expect(h.title).toBe('השבוע תיעדת 3 עסקאות');
    expect(h.email).toContain('יש לך 2 עסקאות פתוחות');
    expect(h.email).toContain('הכניסה האחרונה שלך הייתה אתמול');
    expect(h.path).toBe('/journal');
    expect(isCalm(`${h.title}\n${h.push}\n${h.email}`)).toBe(true);
    expect(validateReminder(h, stats)).toMatchObject({ title: h.title, path: '/journal' });
  });

  it('stays general when nothing is known, with no invented number', () => {
    const h = templateReminder({});
    expect(h.title).toBe('עדכון קצר מהיומן');
    expect(h.email).not.toMatch(/\d/);
    expect(isCalm(h.email)).toBe(true);
  });
});

describe('validateReminder', () => {
  const stats = { weekTrades: 3, openTrades: 2, journalDays: 4, daysSinceLogin: 5 };
  const good = {
    title: 'השבוע תיעדת 3 עסקאות',
    push: 'יש לך 2 עסקאות פתוחות',
    email: 'השבוע כתבת ביומן 4 ימים.\n\nהכניסה האחרונה שלך הייתה לפני 5 ימים.',
    cta: 'ליומן',
    path: '/journal',
  };

  it('accepts calm copy whose numbers are the recipient\'s', () => {
    expect(validateReminder(good, stats)).toMatchObject({ title: good.title });
  });

  it('rejects emoji, exclamation, hype, all-caps and an invented number', () => {
    expect(validateReminder({ ...good, title: 'בדוק את היומן!' }, stats)).toBeNull();
    expect(validateReminder({ ...good, push: 'אל תפספס' }, stats)).toBeNull();
    expect(validateReminder({ ...good, email: 'מדהים 🚀' }, stats)).toBeNull();
    expect(validateReminder({ ...good, title: 'SOL זז' }, stats)).toBeNull();
    expect(validateReminder({ ...good, email: 'השבוע תיעדת 9 עסקאות' }, stats)).toBeNull();
    expect(validateReminder({ ...good, push: 'צפה בתנועה' }, stats)).toBeNull();
  });

  it('falls back to the journal for an unknown path', () => {
    expect(validateReminder({ ...good, path: 'https://evil.com' }, stats).path).toBe('/journal');
  });
});

describe('personalizeReminder', () => {
  it('leads with the recipient and drops numbered or hyped draft paragraphs', () => {
    const out = personalizeReminder({
      subject: 'SOL +15% 🚀',
      headline: 'מדהים!',
      message: 'השבוע תיעדת 9 עסקאות\n\nאל תפספס את התנועה\n\nאפשר לרשום ביומן כשנוח.',
      stats: { weekTrades: 3, openTrades: 2 },
    });
    expect(out.subject).toBe('השבוע תיעדת 3 עסקאות');
    expect(out.headline).toBe(out.subject);
    expect(out.message).toContain('יש לך 2 עסקאות פתוחות');
    expect(out.message).toContain('אפשר לרשום ביומן כשנוח.');
    expect(out.message).not.toContain('9');
    expect(out.message).not.toContain('אל תפספס');
  });

  it('leaves a draft alone when the recipient has no stats', () => {
    const out = personalizeReminder({
      subject: 'עדכון קצר מהיומן',
      headline: 'עדכון קצר מהיומן',
      message: 'אפשר לפתוח את היומן.',
      stats: {},
    });
    expect(out.subject).toBe('עדכון קצר מהיומן');
    expect(out.message).toBe('אפשר לפתוח את היומן.');
  });
});

describe('summarizeReminderStats', () => {
  it('counts distinct journal days in the last week and days since login', () => {
    const stats = summarizeReminderStats({
      weekCount: 3,
      openCount: 2,
      journalDates: ['2026-10-25', '2026-10-25', '2026-10-20', '2026-10-01'],
      lastActive: '2026-10-20T08:00:00Z',
      now: NOW,
    });
    expect(stats).toMatchObject({ weekTrades: 3, openTrades: 2, journalDays: 2 });
    expect(stats.daysSinceLogin).toBe(daysSinceLogin('2026-10-20T08:00:00Z', NOW));
    expect(stats.daysSinceLogin).toBeGreaterThan(0);
  });

  it('reads aggregation counts and query dates', () => {
    expect(countFromAggregation([{ result: { aggregateFields: { count: { integerValue: '2' } } } }])).toBe(2);
    expect(countFromAggregation(null)).toBeNull();
    expect(datesFromQuery([{ document: { fields: { date: { stringValue: '2026-10-25' } } } }, {}])).toEqual(['2026-10-25']);
    expect(combineCounts(2, null)).toBe(2);
    expect(combineCounts(null, null)).toBeNull();
    expect(combineDates(null, ['2026-10-25'])).toEqual(['2026-10-25']);
  });

  it('asks Firestore for this week\'s trades, open trades, and journal dates', () => {
    const where = weekTradesWhere(NOW);
    expect(where.fieldFilter.field.fieldPath).toBe('entryDate');
    expect(reminderTradeCountQuery(statusWhere('open')).structuredAggregationQuery.structuredQuery.from)
      .toEqual([{ collectionId: 'trades' }]);
    const q = journalDatesQuery('morningJournals', NOW);
    expect(q.structuredQuery.from).toEqual([{ collectionId: 'morningJournals' }]);
    expect(q.structuredQuery.where.fieldFilter.value.stringValue).toBe('2026-10-19');
    expect(buildReminderUserMessage({ weekTrades: 3, openTrades: 2 })).toContain('השבוע תיעדת 3 עסקאות');
  });
});
