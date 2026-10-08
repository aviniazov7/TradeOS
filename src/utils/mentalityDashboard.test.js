import { describe, it, expect } from 'vitest';
import {
  journalWindowState, formatDuration, dayScore, buildWeek, weekSummary, journalStreak, headlineMentalStat,
} from './mentalityDashboard';
import { localDayKey } from './calculations';

const at = (h, m = 0) => new Date(2026, 9, 8, h, m); // Thu 8 Oct 2026, local
const dayKey = (offset) => localDayKey(new Date(2026, 9, 8 + offset));

describe('journalWindowState', () => {
  it('is open inside the window with minutes left until it closes', () => {
    expect(journalWindowState('morning', null, at(9, 30))).toMatchObject({ status: 'open', minutesLeft: 150 });
    expect(journalWindowState('evening', null, at(23, 59))).toMatchObject({ status: 'open', minutesLeft: 1 });
  });
  it('is upcoming before the window and closed after it', () => {
    expect(journalWindowState('evening', null, at(17))).toMatchObject({ status: 'upcoming', minutesLeft: 120 });
    expect(journalWindowState('morning', null, at(12))).toMatchObject({ status: 'closed' });
  });
  it('is done once an entry exists, with its creation time', () => {
    const entry = { createdAt: { toDate: () => at(7, 5) } };
    expect(journalWindowState('morning', entry, at(20))).toMatchObject({ status: 'done', doneAt: '07:05' });
    expect(journalWindowState('morning', { createdAt: null }, at(20))).toMatchObject({ status: 'done', doneAt: null });
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes in Hebrew short units', () => {
    expect(formatDuration(135)).toBe('2 ש׳ 15 ד׳');
    expect(formatDuration(120)).toBe('2 ש׳');
    expect(formatDuration(40)).toBe('40 ד׳');
  });
});

describe('dayScore', () => {
  it('averages readiness and day rating, ignoring missing values', () => {
    expect(dayScore({ readinessLevel: 7 }, { dayRating: 8 })).toBe(7.5);
    expect(dayScore({ readinessLevel: 6 }, null)).toBe(6);
    expect(dayScore(null, null)).toBe(null);
    expect(dayScore({ readinessLevel: 'x' }, {})).toBe(null);
  });
});

describe('buildWeek / weekSummary', () => {
  it('returns 7 days oldest-first ending today, with scores and tone', () => {
    const morning = [{ date: dayKey(0), readinessLevel: 8, emotion: 'calm' }];
    const evening = [{ date: dayKey(-2), dayRating: 4, emotionAfter: 'frustrated' }];
    const week = buildWeek(morning, evening, at(10));
    expect(week).toHaveLength(7);
    expect(week[6]).toMatchObject({ key: dayKey(0), isToday: true, score: 8, tone: 'positive', letter: 'ה' });
    expect(week[4]).toMatchObject({ key: dayKey(-2), score: 4, tone: 'negative' });
    expect(week[0].logged).toBe(false);
    expect(weekSummary(week)).toEqual({ logged: 2, avg: 6 });
  });
});

describe('journalStreak', () => {
  it('counts back from today, or from yesterday when today is still empty', () => {
    const m = [{ date: dayKey(-1) }, { date: dayKey(-2) }];
    const e = [{ date: dayKey(-3) }];
    expect(journalStreak(m, e, at(8))).toBe(3);
    expect(journalStreak([...m, { date: dayKey(0) }], e, at(8))).toBe(4);
    expect(journalStreak([{ date: dayKey(-2) }], [], at(8))).toBe(0);
  });
});

describe('headlineMentalStat', () => {
  it('prefers plan adherence over the last 30 days', () => {
    const evening = [
      { date: dayKey(0), followedPlan: true },
      { date: dayKey(-1), followedPlan: false },
      { date: dayKey(-3), followedPlan: true },
      { date: dayKey(-40), followedPlan: false },
      { date: dayKey(-2) },
    ];
    expect(headlineMentalStat([], evening, at(10))).toMatchObject({ kind: 'plan', value: 67, yes: 2, total: 3 });
  });
  it('falls back to average readiness, then null', () => {
    const morning = [{ date: dayKey(0), readinessLevel: 7 }, { date: dayKey(-1), readinessLevel: 8 }];
    expect(headlineMentalStat(morning, [], at(10))).toMatchObject({ kind: 'readiness', value: 7.5, total: 2 });
    expect(headlineMentalStat([], [], at(10))).toBe(null);
  });
});
