import { describe, it, expect } from 'vitest';
import {
  entryDayKey, findEntryForDay, findTodayEntry, findYesterdayEntry, entryTime,
  emptyMorningForm, morningFormFromEntry, morningPayload, MORNING_REQUIRED,
  emptyEveningForm, eveningFormFromEntry, eveningPayload, EVENING_REQUIRED,
  followedPlanFrom, requiredProgress, journalView, rulesFromPlan, DEFAULT_RULES, formsEqual, draftKey,
} from './mentalityJournalForm';

// Local wall-clock times (whatever the machine's zone is), like the app sees them.
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m); // October 2026
const ts = (date) => ({ toDate: () => date }); // Firestore Timestamp stand-in

describe('entryDayKey', () => {
  it('uses the stored local `date` key when present', () => {
    expect(entryDayKey({ date: '2026-10-08', createdAt: ts(at(7, 9)) })).toBe('2026-10-08');
  });
  it('falls back to the LOCAL day of createdAt (not the UTC day)', () => {
    // 00:30 local on the 8th is still the 7th in UTC for any zone east of UTC
    // (Israel until 02:00/03:00) — it must count as the 8th.
    expect(entryDayKey({ createdAt: ts(at(8, 0, 30)) })).toBe('2026-10-08');
    expect(entryDayKey({ createdAt: at(8, 23, 50) })).toBe('2026-10-08');
  });
  it('ignores a malformed date and returns "" when nothing is usable', () => {
    expect(entryDayKey({ date: '8/10/2026', createdAt: ts(at(8, 9)) })).toBe('2026-10-08');
    expect(entryDayKey({ createdAt: null })).toBe('');
    expect(entryDayKey(null)).toBe('');
  });
});

describe('findTodayEntry', () => {
  const yesterday = { id: 'y', date: '2026-10-07', createdAt: ts(at(7, 8)) };
  const today = { id: 't', date: '2026-10-08', createdAt: ts(at(8, 8)) };

  it('finds the entry saved earlier today', () => {
    expect(findTodayEntry([yesterday, today], at(8, 21))).toBe(today);
  });
  it('is null before today has been journaled', () => {
    expect(findTodayEntry([yesterday], at(8, 9))).toBe(null);
    expect(findTodayEntry([], at(8, 9))).toBe(null);
    expect(findTodayEntry(undefined, at(8, 9))).toBe(null);
  });
  it('switches days at local midnight, not at UTC midnight', () => {
    expect(findTodayEntry([today], at(8, 0, 5))).toBe(today);
    expect(findTodayEntry([today], at(8, 23, 59))).toBe(today);
    expect(findTodayEntry([today], at(9, 0, 1))).toBe(null);
  });
  it('detects a just-saved entry whose server timestamp is still pending', () => {
    const pending = { id: 'p', date: '2026-10-08', createdAt: null, updatedAt: null };
    expect(findTodayEntry([yesterday, pending], at(8, 9))).toBe(pending);
  });
  it('detects an entry with no `date` by its local createdAt day', () => {
    const legacy = { id: 'l', createdAt: ts(at(8, 1, 15)) };
    expect(findTodayEntry([yesterday, legacy], at(8, 10))).toBe(legacy);
  });
  it('picks the most recently edited of duplicate entries for the same day', () => {
    const a = { id: 'a', date: '2026-10-08', createdAt: ts(at(8, 7)), updatedAt: ts(at(8, 7)) };
    const b = { id: 'b', date: '2026-10-08', createdAt: ts(at(8, 8)), updatedAt: ts(at(8, 9)) };
    expect(findTodayEntry([a, b], at(8, 10))).toBe(b);
    expect(findTodayEntry([b, a], at(8, 10))).toBe(b);
  });
});

describe('findYesterdayEntry / findEntryForDay / entryTime', () => {
  it('finds the previous local day, also across a month boundary', () => {
    const e = { id: 'e', date: '2026-09-30' };
    expect(findYesterdayEntry([e], at(1, 7))).toBe(e);
    expect(findEntryForDay([e], '')).toBe(null);
  });
  it('formats the time of a timestamp', () => {
    expect(entryTime(ts(at(8, 7, 5)))).toBe('07:05');
    expect(entryTime(null)).toBe(null);
  });
});

describe('morning form', () => {
  it('maps a stored entry to the form and back without losing legacy fields', () => {
    const stored = {
      emotion: 'calm', readinessLevel: 7, preMarketChecklist: ['news'],
      thingsIAppreciate: ['a', 'b'], mainGoal: 'goal', focusToday: 'BTC', dailyGoals: 'x', motivation: 'm',
    };
    const form = morningFormFromEntry(stored);
    expect(form.thingsIAppreciate).toEqual(['a', 'b', '']);
    expect(form.sleepQuality).toBe('');
    const out = morningPayload(form, { date: '2026-10-08', rules: DEFAULT_RULES });
    expect(out).toMatchObject({
      date: '2026-10-08', emotion: 'calm', readinessLevel: 7, preMarketChecklist: ['news'],
      thingsIAppreciate: ['a', 'b', ''], mainGoal: 'goal', focusToday: 'BTC', dailyGoals: 'x', motivation: 'm',
      rulesTotal: DEFAULT_RULES.length, rulesChecked: [],
    });
    expect(Object.values(out).some((v) => v === undefined)).toBe(false);
  });
  it('requires emotion, readiness and an intention', () => {
    const empty = requiredProgress(MORNING_REQUIRED, emptyMorningForm());
    expect(empty).toMatchObject({ done: 0, total: 3, complete: false });
    const full = { ...emptyMorningForm(), emotion: 'calm', readinessLevel: 6, mainGoal: '  stick to A+ only ' };
    expect(requiredProgress(MORNING_REQUIRED, full).complete).toBe(true);
    expect(requiredProgress(MORNING_REQUIRED, { ...full, mainGoal: '   ' }).done).toBe(2);
  });
  it('drops checked rules that are not in the shown list and trims text', () => {
    const form = { ...emptyMorningForm(), rulesChecked: ['r1', 'gone'], mainGoal: ' x ' };
    const out = morningPayload(form, { date: 'd', rules: ['r1', 'r2'], planName: 'Plan' });
    expect(out).toMatchObject({ rulesChecked: ['r1'], rulesTotal: 2, rulesPlanName: 'Plan', mainGoal: 'x' });
  });
});

describe('rulesFromPlan', () => {
  it('uses the default rules without a plan', () => {
    expect(rulesFromPlan(null)).toEqual({ rules: DEFAULT_RULES, source: 'default', planName: '' });
  });
  it('builds rules from the plan checklist, caps and mistakes', () => {
    const r = rulesFromPlan({ name: 'Scalp', checklist: ['HTF trend', ' ', 'HTF trend'], maxDailyLoss: 3, maxPositions: 1, mistakesToAvoid: ['FOMO'] });
    expect(r.source).toBe('plan');
    expect(r.planName).toBe('Scalp');
    expect(r.rules).toEqual(['HTF trend', 'הפסד יומי מקסימלי 3%', 'פוזיציה אחת פתוחה לכל היותר', 'להימנע: FOMO']);
  });
  it('falls back to the defaults when the plan has nothing checkable', () => {
    expect(rulesFromPlan({ name: 'Empty', checklist: [] })).toMatchObject({ rules: DEFAULT_RULES, source: 'default', planName: 'Empty' });
  });
});

describe('evening form', () => {
  it('reads a legacy entry (single emotion, boolean plan)', () => {
    const f = eveningFormFromEntry({ emotionAfter: 'tired', followedPlan: false, dayRating: 4, lessonsLearned: 'l' });
    expect(f).toMatchObject({ emotionsAfter: ['tired'], planAdherence: 'no', dayRating: 4, lessonsLearned: 'l' });
    expect(eveningFormFromEntry({ followedPlan: true }).planAdherence).toBe('yes');
    expect(eveningFormFromEntry({}).planAdherence).toBe('');
  });
  it('keeps the boolean followedPlan readers working ("partly" counts as not followed)', () => {
    expect(followedPlanFrom('yes')).toBe(true);
    expect(followedPlanFrom('partial')).toBe(false);
    expect(followedPlanFrom('no')).toBe(false);
    expect(followedPlanFrom('')).toBe(null);
  });
  it('writes the first emotion to emotionAfter and caps emotions at two', () => {
    const form = { ...emptyEveningForm(), emotionsAfter: ['calm', 'tired', 'happy'], planAdherence: 'partial', dayRating: 8, lessonsLearned: ' x ' };
    const out = eveningPayload(form, { date: '2026-10-08' });
    expect(out).toMatchObject({
      date: '2026-10-08', emotionAfter: 'calm', emotionsAfter: ['calm', 'tired'], planAdherence: 'partial',
      followedPlan: false, dayRating: 8, lessonsLearned: 'x',
    });
    expect(Object.values(out).some((v) => v === undefined)).toBe(false);
  });
  it('requires rating, an emotion, plan adherence and a lesson', () => {
    expect(requiredProgress(EVENING_REQUIRED, emptyEveningForm())).toMatchObject({ done: 0, total: 4 });
    const full = { ...emptyEveningForm(), dayRating: 7, emotionsAfter: ['calm'], planAdherence: 'yes', lessonsLearned: 'x' };
    expect(requiredProgress(EVENING_REQUIRED, full).complete).toBe(true);
  });
});

describe('journalView', () => {
  it('shows the completed summary once today is saved, not an empty form', () => {
    expect(journalView({ entry: { id: 't' } })).toBe('completed');
    // Saved, but the snapshot listener hasn't delivered the doc yet.
    expect(journalView({ entry: null, savedEntry: { date: 'd' } })).toBe('completed');
  });
  it('shows the form for a new day, while editing, and loading before data', () => {
    expect(journalView({ entry: null })).toBe('form');
    expect(journalView({ entry: { id: 't' }, editing: true })).toBe('form');
    expect(journalView({ loading: true })).toBe('loading');
    expect(journalView({ loading: true, entry: { id: 't' } })).toBe('completed');
  });
});

describe('helpers', () => {
  it('compares forms by value', () => {
    expect(formsEqual(emptyMorningForm(), emptyMorningForm())).toBe(true);
    expect(formsEqual(emptyMorningForm(), { ...emptyMorningForm(), mainGoal: 'x' })).toBe(false);
    expect(formsEqual(emptyEveningForm(), { ...emptyEveningForm(), emotionsAfter: ['calm'] })).toBe(false);
  });
  it('keys drafts per user, journal and day', () => {
    expect(draftKey('u1', 'morning', '2026-10-08')).toBe('tradeos:journalDraft:u1:morning:2026-10-08');
  });
});
