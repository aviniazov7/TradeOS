import { describe, expect, it } from 'vitest';
import {
  BUSINESS_REPORT_DISCLAIMER,
  businessDayKey,
  businessTotals,
  categoryBreakdownByMonth,
  formatBusinessMonthReport,
  monthlyNetByCurrency,
  roundBusinessMoney,
  summarizeBusinessLedger,
  validateBusinessEntry,
} from './businessLedger';

const entry = (over = {}) => ({
  kind: 'expense',
  category: 'challenge_fee',
  amount: 100,
  currency: 'USD',
  date: '2026-03-15',
  ...over,
});

const visible = (text) => text.replaceAll('\u200E', '');

describe('validateBusinessEntry', () => {
  it('rejects a row that is not an object', () => {
    expect(validateBusinessEntry(null)).toEqual({ ok: false, code: 'invalid', message: 'רשומה לא תקינה.' });
    expect(validateBusinessEntry(['income']).code).toBe('invalid');
  });

  it('rejects a bad kind, category, or currency', () => {
    expect(validateBusinessEntry(entry({ kind: 'transfer' })).code).toBe('kind');
    expect(validateBusinessEntry(entry({ kind: 'הכנסה' })).code).toBe('kind');
    expect(validateBusinessEntry(entry({ category: 'trading_profit' })).code).toBe('category');
    expect(validateBusinessEntry(entry({ category: 'challenge fee' })).code).toBe('category');
    expect(validateBusinessEntry(entry({ currency: 'EUR' })).code).toBe('currency');
    expect(validateBusinessEntry(entry({ currency: 'usdils' })).code).toBe('currency');
  });

  it('rejects a non-positive or non-finite amount, and accepts a plain numeric string', () => {
    expect(validateBusinessEntry(entry({ amount: 0 })).code).toBe('amount');
    expect(validateBusinessEntry(entry({ amount: -5 })).code).toBe('amount');
    expect(validateBusinessEntry(entry({ amount: Infinity })).code).toBe('amount');
    expect(validateBusinessEntry(entry({ amount: Number.NaN })).code).toBe('amount');
    expect(validateBusinessEntry(entry({ amount: '0' })).code).toBe('amount');
    expect(validateBusinessEntry(entry({ amount: '12usd' })).code).toBe('amount');
    expect(validateBusinessEntry(entry({ amount: '' })).code).toBe('amount');
    expect(validateBusinessEntry(entry({ amount: '250.50' })).entry.amount).toBe(250.5);
  });

  it('normalizes case and drops an empty note and journal pointer', () => {
    const result = validateBusinessEntry(entry({
      kind: ' Income ',
      category: 'Reset',
      currency: 'ils',
      note: '   ',
      journalId: '',
    }));
    expect(result.ok).toBe(true);
    expect(result.entry).toMatchObject({
      kind: 'income',
      category: 'reset',
      currency: 'ILS',
      note: '',
      journalId: null,
      cashOnly: false,
      month: '2026-03',
    });
  });

  it('keeps a short note and a journal pointer, and rejects a long note or a bad pointer', () => {
    const note = 'א'.repeat(160);
    const ok = validateBusinessEntry(entry({ note, journalId: '  j-ftmo  ' }));
    expect(ok.entry.note).toBe(note);
    expect(ok.entry.journalId).toBe('j-ftmo');
    expect(validateBusinessEntry(entry({ note: 'א'.repeat(161) })).code).toBe('note');
    expect(validateBusinessEntry(entry({ note: 12 })).code).toBe('note');
    expect(validateBusinessEntry(entry({ journalId: 5 })).code).toBe('journal');
    expect(validateBusinessEntry(entry({ journalId: `${'a'.repeat(129)}` })).code).toBe('journal');
  });

  it('does not mutate the input and accepts its own normalized row', () => {
    const raw = entry({ note: 'דמי אתגר' });
    const copy = { ...raw };
    const first = validateBusinessEntry(raw);
    expect(raw).toEqual(copy);
    expect(validateBusinessEntry(first.entry).entry).toEqual(first.entry);
  });
});

describe('businessDayKey — Jerusalem month boundaries', () => {
  it('keeps a date-only day, and buckets instants on the Jerusalem calendar', () => {
    const cases = [
      ['2026-02-28', '2026-02-28'],
      ['2026-02-28T21:59:00Z', '2026-02-28'],
      ['2026-02-28T22:00:00Z', '2026-03-01'],
      ['2026-03-01', '2026-03-01'],
      ['2026-03-31T20:59:00Z', '2026-03-31'],
      ['2026-03-31T21:00:00Z', '2026-04-01'],
      ['2026-03-31T23:30:00+03:00', '2026-03-31'],
      ['2026-03-31T23:30:00+02:00', '2026-04-01'],
      ['2025-12-31T21:59:00Z', '2025-12-31'],
      ['2025-12-31T22:00:00Z', '2026-01-01'],
      ['2026-10-24T20:59:00Z', '2026-10-24'],
      ['2026-10-24T21:00:00Z', '2026-10-25'],
      ['2026-10-31T21:59:00Z', '2026-10-31'],
      ['2026-10-31T22:00:00Z', '2026-11-01'],
      ['2024-02-29', '2024-02-29'],
      ['2026-02-29', ''],
      ['2026-04-31', ''],
      ['2026-00-10', ''],
      ['2026-03', ''],
      ['31/03/2026', ''],
      ['', ''],
    ];
    cases.forEach(([input, day]) => {
      expect(businessDayKey(input), String(input)).toBe(day);
    });
  });

  it('reads a Date, a timestamp, and a toDate() instant without treating them as UTC days', () => {
    expect(businessDayKey(new Date('2026-02-28T22:00:00Z'))).toBe('2026-03-01');
    expect(businessDayKey(Date.parse('2025-12-31T22:00:00Z'))).toBe('2026-01-01');
    const stamp = { toDate: () => new Date('2026-03-31T21:30:00Z') };
    expect(businessDayKey(stamp)).toBe('2026-04-01');
    expect(businessDayKey({ toDate() { throw new Error('unread'); } })).toBe('');
    expect(validateBusinessEntry(entry({ date: new Date('not a date') })).code).toBe('date');
  });
});

describe('summarizeBusinessLedger', () => {
  it('returns an empty book for no rows', () => {
    const empty = {
      accepted: [],
      rejected: [],
      months: [],
      totals: { count: 0, byCurrency: {} },
    };
    expect(summarizeBusinessLedger([])).toEqual(empty);
    expect(summarizeBusinessLedger(null)).toEqual(empty);
    expect(summarizeBusinessLedger(undefined)).toEqual(empty);
    expect(monthlyNetByCurrency([])).toEqual([]);
    expect(categoryBreakdownByMonth('nope')).toEqual([]);
    expect(businessTotals(null)).toEqual({ count: 0, byCurrency: {} });
  });

  it('sorts months and same-day rows, and leaves an invalid row out of the totals', () => {
    const summary = summarizeBusinessLedger([
      entry({ date: '2026-03-20', amount: 2, note: 'מאוחר' }),
      entry({ date: '2026-03-02', amount: 1, note: 'מוקדם' }),
      entry({ date: '2026-03-02', amount: 3, note: 'אמצע' }),
      entry({ date: '2026-01-15', amount: 50 }),
      entry({ amount: 0 }),
    ]);
    expect(summary.rejected).toEqual([
      { index: 4, code: 'amount', message: 'הסכום חייב להיות מספר חיובי.' },
    ]);
    expect(summary.months.map((month) => month.month)).toEqual(['2026-01', '2026-03']);
    expect(summary.months[1].entries.map((row) => row.note)).toEqual(['מוקדם', 'אמצע', 'מאוחר']);
    expect(summary.totals.byCurrency.USD).toMatchObject({ income: 0, expense: 56, net: -56, count: 4 });
    expect(summary.totals.net).toBeUndefined();
  });
});

describe('currencies stay separate', () => {
  const rows = [
    entry({
      date: '2026-03-20',
      kind: 'income',
      category: 'payout',
      amount: 1200,
      journalId: 'journal-ftmo-100k',
      rate: 3.7,
    }),
    entry({ date: '2026-03-02', amount: 155, note: 'FTMO 100K' }),
    entry({ date: '2026-03-05', category: 'subscription', amount: 49, currency: 'ILS' }),
    entry({ date: '2026-03-18', kind: 'income', category: 'withdrawal', amount: 20, currency: 'usdt' }),
  ];

  it('does not add, convert, or borrow a rate across USD, ILS, and USDT', () => {
    const totals = businessTotals(rows);
    expect(Object.keys(totals.byCurrency)).toEqual(['USD', 'ILS', 'USDT']);
    expect(totals.byCurrency.USD).toMatchObject({ income: 1200, expense: 155, net: 1045, count: 2 });
    expect(totals.byCurrency.ILS).toMatchObject({ income: 0, expense: 49, net: -49, count: 1 });
    expect(totals.byCurrency.USDT).toMatchObject({ income: 20, expense: 0, net: 20, count: 1 });
    expect(totals.net).toBeUndefined();
    expect(totals.converted).toBeUndefined();
    expect(totals.byCurrency.USD.rate).toBeUndefined();
    expect(totals.byCurrency.ILS.net).not.toBeCloseTo(-49 - 1200 * 3.7);

    const [march] = monthlyNetByCurrency(rows);
    expect(march.month).toBe('2026-03');
    expect(march.net).toBeUndefined();
    expect(Object.keys(march.currencies)).toEqual(['USD', 'ILS', 'USDT']);
    expect(march.currencies.USD.net).toBe(1045);

    const breakdown = categoryBreakdownByMonth(rows)[0].currencies;
    expect(breakdown.USD.payout).toMatchObject({ income: 1200, expense: 0, net: 1200, count: 1, cashOnly: true });
    expect(breakdown.USD.challenge_fee).toMatchObject({ income: 0, expense: 155, net: -155, cashOnly: false });
    expect(breakdown.USD.payout.tradingProfit).toBeUndefined();
    expect(breakdown.ILS.subscription.net).toBe(-49);
    expect(breakdown.USDT.withdrawal.cashOnly).toBe(true);
  });

  it('nets a refund inside the same category without mixing it into another currency', () => {
    const cat = categoryBreakdownByMonth([
      entry({ amount: 100 }),
      entry({ kind: 'income', amount: 25, note: 'החזר' }),
      entry({ kind: 'income', category: 'other', amount: 10, currency: 'ILS' }),
    ])[0].currencies;
    expect(cat.USD.challenge_fee).toMatchObject({ income: 25, expense: 100, net: -75, count: 2 });
    expect(cat.ILS.other.net).toBe(10);
    expect(cat.USD.other).toBeUndefined();
  });
});

describe('payouts and withdrawals are not trading profit', () => {
  it('rejects a row that carries a journal profit figure, and keeps the cash amount alone', () => {
    const linked = entry({
      kind: 'income',
      category: 'payout',
      amount: 400,
      journalId: 'j1',
      netPnl: 2500,
    });
    expect(validateBusinessEntry(linked).code).toBe('trading_profit');
    expect(validateBusinessEntry(entry({
      kind: 'income',
      category: 'withdrawal',
      profit: 0,
    })).code).toBe('trading_profit');
    expect(validateBusinessEntry(entry({ pnlFromExchange: 80 })).code).toBe('trading_profit');

    const summary = summarizeBusinessLedger([
      linked,
      entry({ kind: 'income', category: 'payout', amount: 400, journalId: 'j1', date: '2026-03-08' }),
    ]);
    expect(summary.rejected.map((row) => row.code)).toEqual(['trading_profit']);
    expect(summary.totals.byCurrency.USD.net).toBe(400);
    expect(summary.accepted[0].journalId).toBe('j1');
    expect(summary.accepted[0].cashOnly).toBe(true);
    expect(summary.accepted[0].netPnl).toBeUndefined();
    expect(summary.accepted[0].pnl).toBeUndefined();
  });
});

describe('rounding', () => {
  it('rounds each row to the nearest cent before summing', () => {
    expect(roundBusinessMoney(1.005)).toBe(1.01);
    expect(roundBusinessMoney(1.004)).toBe(1);
    expect(roundBusinessMoney(0.1 + 0.2)).toBe(0.3);
    expect(validateBusinessEntry(entry({ amount: 0.004 })).ok).toBe(false);
    expect(validateBusinessEntry(entry({ amount: 0.005 })).entry.amount).toBe(0.01);
    expect(validateBusinessEntry(entry({ amount: 1.005 })).entry.amount).toBe(1.01);

    const tenths = businessTotals([
      entry({ amount: 0.1, currency: 'ILS' }),
      entry({ amount: 0.2, currency: 'ILS' }),
    ]);
    expect(tenths.byCurrency.ILS.expense).toBe(0.3);
    expect(tenths.byCurrency.ILS.net).toBe(-0.3);

    // 1.004 rounds down to 1.00 on each row. The raw sum 2.008 would round to 2.01.
    expect(businessTotals([
      entry({ kind: 'income', category: 'other', amount: 1.004 }),
      entry({ kind: 'income', category: 'other', amount: 1.004 }),
    ]).byCurrency.USD.income).toBe(2);

    const cents = Array.from({ length: 100 }, () => entry({
      kind: 'income',
      category: 'other',
      amount: 0.01,
      currency: 'USDT',
      date: '2026-06-15',
    }));
    expect(businessTotals(cents).byCurrency.USDT.net).toBe(1);
    expect(businessTotals([
      entry({ kind: 'income', category: 'other', amount: 1.01 }),
      entry({ kind: 'income', category: 'other', amount: 1.01 }),
      entry({ kind: 'income', category: 'other', amount: 1.01 }),
    ]).byCurrency.USD.income).toBe(3.03);
  });
});

describe('formatBusinessMonthReport', () => {
  const rows = [
    entry({
      date: '2026-03-20',
      kind: 'income',
      category: 'payout',
      amount: 1200,
      journalId: 'journal-ftmo-100k',
    }),
    entry({ date: '2026-03-02', amount: 155, note: 'FTMO 100K' }),
    entry({ date: '2026-03-05', category: 'subscription', amount: 49, currency: 'ILS' }),
    entry({ date: '2026-03-18', kind: 'income', category: 'withdrawal', amount: 20, currency: 'USDT' }),
  ];

  const marchReport = [
    'ניהול עסק — מרץ 2026',
    'ימים לפי שעון ירושלים. כל מטבע בנפרד, בלי המרה ובלי ערבוב.',
    '',
    'דולר (USD)',
    'הכנסות: $1,200.00',
    'הוצאות: $155.00',
    'נטו: +$1,045.00',
    'דמי אתגר: -$155.00',
    'תשלום: +$1,200.00 · מזומן, לא רווח מסחר',
    'תנועות',
    '02/03/2026 · הוצאה · דמי אתגר · $155.00 · FTMO 100K',
    '20/03/2026 · הכנסה · תשלום · $1,200.00',
    '',
    'שקל (ILS)',
    'הכנסות: ₪0.00',
    'הוצאות: ₪49.00',
    'נטו: -₪49.00',
    'מנוי: -₪49.00',
    'תנועות',
    '05/03/2026 · הוצאה · מנוי · ₪49.00',
    '',
    'USDT',
    'הכנסות: 20.00 USDT',
    'הוצאות: 0.00 USDT',
    'נטו: +20.00 USDT',
    'משיכה: +20.00 USDT · מזומן, לא רווח מסחר',
    'תנועות',
    '18/03/2026 · הכנסה · משיכה · 20.00 USDT',
    '',
    'סה״כ תנועות בחודש: 4',
    '',
    BUSINESS_REPORT_DISCLAIMER,
  ].join('\n');

  it('copies a Hebrew month with each currency in its own section', () => {
    const report = formatBusinessMonthReport(rows, '2026-03');
    expect(visible(report)).toBe(marchReport);
    expect(report).not.toContain('journal-ftmo-100k');
    expect(report).not.toContain('1,094');
    expect(report).not.toContain('1,016');
  });

  it('states an empty month, and puts a Jerusalem midnight instant in the next month', () => {
    const empty = [
      'ניהול עסק — אפריל 2026',
      'ימים לפי שעון ירושלים. כל מטבע בנפרד, בלי המרה ובלי ערבוב.',
      '',
      'אין תנועות בחודש הזה.',
      '',
      'סה״כ תנועות בחודש: 0',
      '',
      BUSINESS_REPORT_DISCLAIMER,
    ].join('\n');
    expect(visible(formatBusinessMonthReport([], '2026-04'))).toBe(empty);
    expect(formatBusinessMonthReport(rows, '2026-13')).toBe('חודש לא תקין.');
    expect(formatBusinessMonthReport(rows, '2026-3')).toBe('חודש לא תקין.');

    const overnight = entry({ date: '2026-02-28T22:00:00Z', amount: 10 });
    const dateOnly = entry({ date: '2026-02-28', amount: 11 });
    expect(monthlyNetByCurrency([overnight])[0].month).toBe('2026-03');
    expect(monthlyNetByCurrency([dateOnly])[0].month).toBe('2026-02');
    expect(visible(formatBusinessMonthReport([overnight], '2026-02'))).toContain('אין תנועות בחודש הזה.');
    expect(visible(formatBusinessMonthReport([overnight], '2026-03'))).toContain('נטו: -$10.00');
    expect(visible(formatBusinessMonthReport([
      entry({ date: '2026-03-31T21:30:00Z', amount: 90, category: 'reset' }),
    ], '2026-04'))).toContain('ניהול עסק — אפריל 2026');
    expect(visible(formatBusinessMonthReport([
      entry({ date: '2026-03-31T21:30:00Z', amount: 90, category: 'reset' }),
    ], '2026-03'))).toContain('אין תנועות בחודש הזה.');
  });
});
