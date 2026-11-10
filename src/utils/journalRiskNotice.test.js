import { describe, expect, it } from 'vitest';
import { evaluateJournalRisk } from './journalRiskRules';
import {
  journalRiskBreachNotice,
  readRiskBreachDismissed,
  writeRiskBreachDismissed,
} from './journalRiskNotice';

const NOW = new Date('2026-01-16T00:30:00Z');
const TODAY = '2026-01-16T10:00:00Z';

const rules = {
  weeklyLoss: { enabled: true, amount: 500 },
  dailyLossPercent: { enabled: true, percent: 3 },
  weeklyLossPercent: { enabled: true, percent: 5 },
  maxTradesPerDay: { enabled: true, count: 2 },
  tradingHours: { enabled: true, start: '09:00', end: '17:00' },
};

const closed = (over = {}) => ({
  status: 'closed',
  journalId: 'j1',
  exitDate: TODAY,
  entryDate: TODAY,
  netPnl: -100,
  ...over,
});

function state(trades, next = rules, opts = {}) {
  return evaluateJournalRisk(trades, next, {
    now: NOW,
    journalId: 'j1',
    balance: 10_000,
    ...opts,
  });
}

function memory() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

describe('journalRiskBreachNotice', () => {
  it('stays quiet when the journal has no rules or nothing is breached', () => {
    const trades = [closed({ netPnl: -900, entryDate: '2026-01-16T05:00:00Z' })];
    expect(journalRiskBreachNotice(null)).toBeNull();
    expect(journalRiskBreachNotice(state(trades, null))).toBeNull();
    expect(journalRiskBreachNotice(state([closed({ netPnl: -50 })], {
      weeklyLoss: { enabled: false, amount: 10 },
      maxTradesPerDay: { enabled: true, count: 3 },
    }))).toBeNull();
  });

  it('names each breached rule and says recording stays open', () => {
    const notice = journalRiskBreachNotice(state([
      closed({ netPnl: -500, entryDate: '2026-01-16T05:00:00Z' }),
      closed({ id: 'b', netPnl: -20, entryDate: '2026-01-16T04:00:00Z' }),
    ]));
    expect(notice.title).toBe('חריגה מכללי הסיכון. הרישום עדיין פתוח.');
    expect(notice.summary).toBe('חריגה מכללי הסיכון: הפסד שבועי, הפסד יומי, הפסד שבועי באחוזים, עסקאות ביום, שעות מסחר. הרישום עדיין פתוח.');
    expect(notice.lines.map((line) => line.text)).toEqual([
      'הפסד השבוע \u200E$520.00 מתוך \u200E$500.00',
      'הפסד היום \u200E$520.00 מתוך \u200E$300.00 (\u200E3% מיתרת הפתיחה)',
      'הפסד השבוע באחוזים \u200E$520.00 מתוך \u200E$500.00 (\u200E5% מיתרת הפתיחה)',
      'נסגרו \u200E2 עסקאות היום, והתקרה היא \u200E2',
      '\u200E2 עסקאות נכנסו מחוץ לשעות \u200E09:00–\u200E17:00',
    ]);
  });
});

describe('risk breach dismissal', () => {
  it('hides the warning for this journal until the next Israel day', () => {
    const store = memory();
    const day = state([]).dayKey;
    expect(day).toBe('2026-01-16');
    expect(readRiskBreachDismissed(store, 'u1', 'j1', day)).toBe(false);
    writeRiskBreachDismissed(store, 'u1', 'j1', day);
    expect(readRiskBreachDismissed(store, 'u1', 'j1', day)).toBe(true);
    expect(readRiskBreachDismissed(store, 'u1', 'j1', '2026-01-17')).toBe(false);
    expect(readRiskBreachDismissed(store, 'u1', 'j2', day)).toBe(false);
    expect(readRiskBreachDismissed(store, 'u2', 'j1', day)).toBe(false);
  });

  it('ignores a storage that cannot be read', () => {
    const store = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    expect(readRiskBreachDismissed(store, 'u1', 'j1', '2026-01-16')).toBe(false);
    expect(() => writeRiskBreachDismissed(store, 'u1', 'j1', '2026-01-16')).not.toThrow();
  });
});
