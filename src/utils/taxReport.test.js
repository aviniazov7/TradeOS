import { describe, it, expect } from 'vitest';
import {
  jerusalemDayKey, tradeCloseDay, isIlsTrade, findRate, fxRangeForYear,
  buildTaxReport, taxCsvRows, TAX_RATE,
} from './taxReport';

const RATES = {
  '2024-12-31': 3.647,
  '2025-01-02': 3.65,
  '2025-01-03': 3.6,
  '2025-01-06': 3.7,
  '2025-02-03': 3.5,
  '2025-03-31': 3.7,
  '2025-12-31': 3.2,
};

const journals = [
  { id: 'c', name: 'קריפטו', assetClass: 'crypto' },
  { id: 's', name: 'מניות', assetClass: 'stocks' },
  { id: 'f', name: 'חוזים', assetClass: 'futures_cme' },
];

const closed = (over) => ({ status: 'closed', direction: 'long', pair: 'BTCUSDT', journalId: 'c', ...over });

describe('jerusalemDayKey / tradeCloseDay', () => {
  it('buckets by Israel local time, not UTC', () => {
    // 22:30 UTC on Jan 31 is already 00:30 Feb 1 in Israel (UTC+2 in winter).
    expect(jerusalemDayKey('2025-01-31T22:30:00Z')).toBe('2025-02-01');
    // 21:30 UTC in July is 00:30 next day (UTC+3 in summer).
    expect(jerusalemDayKey('2025-07-31T21:30:00Z')).toBe('2025-08-01');
    expect(jerusalemDayKey('2025-07-31T20:30:00Z')).toBe('2025-07-31');
  });
  it('accepts Firestore-like timestamps and rejects garbage', () => {
    expect(jerusalemDayKey({ toDate: () => new Date('2025-03-10T10:00:00Z') })).toBe('2025-03-10');
    expect(jerusalemDayKey('nope')).toBe('');
    expect(jerusalemDayKey(null)).toBe('');
  });
  it('uses the exit date, falling back to the entry date', () => {
    expect(tradeCloseDay({ entryDate: '2025-01-01T10:00:00Z', exitDate: '2025-01-05T10:00:00Z' })).toBe('2025-01-05');
    expect(tradeCloseDay({ entryDate: '2025-01-01T10:00:00Z' })).toBe('2025-01-01');
  });
});

describe('isIlsTrade', () => {
  it('detects Tel Aviv tickers', () => {
    expect(isIlsTrade({ pair: 'TEVA.TA' })).toBe(true);
    expect(isIlsTrade({ pair: 'lumi.ta' })).toBe(true);
    expect(isIlsTrade({ pair: 'TEVA' })).toBe(false);
    expect(isIlsTrade({ pair: 'BTCUSDT' })).toBe(false);
  });
});

describe('findRate', () => {
  it('uses the same day when present', () => {
    expect(findRate(RATES, '2025-01-03')).toEqual({ rate: 3.6, day: '2025-01-03' });
  });
  it('falls back to the nearest previous business day (weekend)', () => {
    expect(findRate(RATES, '2025-01-05')).toEqual({ rate: 3.6, day: '2025-01-03' });
    expect(findRate(RATES, '2025-01-01')).toEqual({ rate: 3.647, day: '2024-12-31' });
  });
  it('gives up beyond the lookback window', () => {
    expect(findRate(RATES, '2025-01-30')).toBeNull();
  });
  it('asks for a cushion before January 1', () => {
    const { from, to } = fxRangeForYear(2025);
    expect(from < '2025-01-01').toBe(true);
    expect(to).toBe('2025-12-31');
  });
});

describe('buildTaxReport', () => {
  const trades = [
    // Jan: +1000$ on a Friday rate day → 3600₪, fees 10$ → 36₪
    closed({ id: 't1', netPnl: 1000, fees: 10, exitDate: '2025-01-03T12:00:00Z' }),
    // Jan, Sunday close → Friday's rate: -200$ × 3.6 = -720₪
    closed({ id: 't2', netPnl: -200, direction: 'short', exitDate: '2025-01-05T12:00:00Z' }),
    // Feb 1 in Israel (Jan 31 UTC late night) → Feb bucket; no rate within the lookback → missing
    closed({ id: 't3', netPnl: 50, exitDate: '2025-01-31T22:30:00Z' }),
    // Stocks in shekels: no conversion
    closed({ id: 't4', journalId: 's', pair: 'TEVA.TA', netPnl: 500, fees: 5, exitDate: '2025-03-31T08:00:00Z' }),
    // Futures loss, no explicit assetClass on the trade → journal's
    closed({ id: 't5', journalId: 'f', pair: 'ES', netPnl: -300, exitDate: '2025-03-31T15:00:00Z' }),
    // Previous year → excluded
    closed({ id: 't6', netPnl: 999, exitDate: '2024-12-31T10:00:00Z' }),
    // Open / partial → excluded
    { id: 't7', status: 'open', journalId: 'c', entryDate: '2025-02-01T10:00:00Z' },
    { id: 't8', status: 'partial', journalId: 'c', entryDate: '2025-02-01T10:00:00Z', netPnl: 40, exits: [{ price: 1, percent: 50 }] },
    // Deleted journal → excluded
    closed({ id: 't9', journalId: 'gone', netPnl: 70, exitDate: '2025-01-03T10:00:00Z' }),
    // No exit date → entry date
    closed({ id: 't10', netPnl: 100, exitPrice: 5, status: undefined, entryDate: '2025-02-03T10:00:00Z' }),
  ];

  const report = buildTaxReport({ trades, journals, year: 2025, rates: RATES, fallbackDays: ['2025-02-03'] });

  it('converts USD trades with the closing-day rate and leaves .TA trades in ₪', () => {
    const byId = Object.fromEntries(report.rows.map((r) => [r.id, r]));
    expect(byId.t1.pnlIls).toBeCloseTo(3600);
    expect(byId.t1.feesIls).toBeCloseTo(36);
    expect(byId.t2.pnlIls).toBeCloseTo(-720);
    expect(byId.t2.rateDay).toBe('2025-01-03');
    expect(byId.t4.currency).toBe('ILS');
    expect(byId.t4.pnlIls).toBe(500);
    expect(byId.t4.feesIls).toBe(5);
    expect(byId.t5.pnlIls).toBeCloseTo(-1110);
    expect(byId.t5.assetClass).toBe('futures_cme');
    expect(byId.t10.pnlIls).toBeCloseTo(350);
    expect(byId.t10.fallback).toBe(true);
  });

  it('excludes other years, open/partial and orphaned trades', () => {
    const ids = report.rows.map((r) => r.id).sort();
    expect(ids).toEqual(['t1', 't10', 't2', 't3', 't4', 't5']);
    expect(report.partial.count).toBe(1);
    expect(report.partial.realized).toBe(40);
  });

  it('lists trades without a rate and keeps them out of the totals', () => {
    expect(report.missingRate.map((r) => r.id)).toEqual(['t3']);
    expect(report.totals.tradeCount).toBe(5);
  });

  it('offsets losses against gains and estimates 25% on the positive net', () => {
    const t = report.totals;
    expect(t.gainsIls).toBeCloseTo(3600 + 500 + 350);
    expect(t.lossesIls).toBeCloseTo(-720 - 1110);
    expect(t.netIls).toBeCloseTo(4450 - 1830);
    expect(t.lossesOffsetIls).toBeCloseTo(1830);
    expect(t.estimatedTaxIls).toBeCloseTo((4450 - 1830) * TAX_RATE);
    expect(t.carryForwardLossIls).toBe(0);
    expect(t.feesIls).toBeCloseTo(36 + 5);
    expect(report.fallbackDays).toEqual(['2025-02-03']);
  });

  it('buckets months in Israel local time', () => {
    expect(report.months[0].count).toBe(2); // t1, t2 (t3 has no rate)
    expect(report.months[0].net).toBeCloseTo(2880);
    expect(report.months[1].count).toBe(1); // t10
    expect(report.months[2].count).toBe(2); // t4, t5
    expect(report.months[2].gains).toBeCloseTo(500);
    expect(report.months[2].losses).toBeCloseTo(-1110);
    const t3 = report.rows.find((r) => r.id === 't3');
    expect(t3.month).toBe(2);
  });

  it('splits by asset class', () => {
    expect(report.byAsset.crypto.count).toBe(3);
    expect(report.byAsset.stocks.net).toBe(500);
    expect(report.byAsset.futures_cme.net).toBeCloseTo(-1110);
  });

  it('no tax and a carry-forward loss when the year is negative', () => {
    const r = buildTaxReport({
      trades: [closed({ id: 'a', netPnl: -100, exitDate: '2025-01-02T10:00:00Z' }), closed({ id: 'b', netPnl: 20, exitDate: '2025-01-02T11:00:00Z' })],
      journals, year: 2025, rates: RATES,
    });
    expect(r.totals.netIls).toBeCloseTo(-292);
    expect(r.totals.estimatedTaxIls).toBe(0);
    expect(r.totals.carryForwardLossIls).toBeCloseTo(292);
    expect(r.totals.lossesOffsetIls).toBeCloseTo(73);
  });

  it('filters by selected journals', () => {
    const r = buildTaxReport({ trades, journals, year: 2025, rates: RATES, journalIds: ['s'] });
    expect(r.rows.map((x) => x.id)).toEqual(['t4']);
  });

  it('handles no trades', () => {
    const r = buildTaxReport({ trades: [], journals, year: 2025, rates: RATES });
    expect(r.rows).toEqual([]);
    expect(r.totals.netIls).toBe(0);
    expect(r.totals.estimatedTaxIls).toBe(0);
  });
});

describe('taxCsvRows', () => {
  it('has the Hebrew headers and one row per trade plus totals', () => {
    const report = buildTaxReport({
      trades: [
        closed({ id: 'a', netPnl: 100, fees: 1, exitDate: '2025-01-02T10:00:00Z' }),
        closed({ id: 'b', journalId: 's', pair: 'TEVA.TA', netPnl: 50, exitDate: '2025-01-02T10:00:00Z' }),
      ],
      journals, year: 2025, rates: RATES,
    });
    const { headers, rows } = taxCsvRows(report);
    expect(headers.slice(0, 7)).toEqual(['תאריך סגירה', 'נכס', 'כיוון', 'רווח/הפסד $', 'שער', 'רווח/הפסד ₪', 'עמלות']);
    expect(rows[0]).toEqual(['02/01/2025', 'BTCUSDT', 'לונג', 100, 3.65, 365, 3.65, 'קריפטו', '']);
    expect(rows[1][3]).toBe('');
    expect(rows[1][5]).toBe(50);
    expect(rows.at(-1)[0]).toContain('אינו ייעוץ מס');
  });
});
