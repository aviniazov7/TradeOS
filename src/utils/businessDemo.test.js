import { describe, expect, it } from 'vitest';
import { buildBusinessDemoEntries } from './businessDemo';
import { businessEntryLimit, categoryChartSeries, monthCurrencyNets } from '../components/business/businessView';
import { FREE_LIMITS } from './constants';

const NOW = new Date('2026-03-20T12:00:00Z');

describe('business demo entries', () => {
  it('builds a marked sample across currencies, on Jerusalem days', () => {
    const rows = buildBusinessDemoEntries({
      journals: [{ id: 'j-ftmo', name: 'FTMO 100K' }],
      now: NOW,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.demo === true && row.id.startsWith('demo-biz-'))).toBe(true);
    expect(new Set(rows.map((row) => row.currency))).toEqual(new Set(['USD', 'ILS', 'USDT']));
    expect(rows.some((row) => row.month === '2026-03' && row.journalId === 'j-ftmo')).toBe(true);
    expect(rows.some((row) => row.month === '2026-02')).toBe(true);
    expect(rows.some((row) => row.netPnl != null || row.pnl != null)).toBe(false);

    const march = monthCurrencyNets(rows, '2026-03');
    expect(march.map((row) => row.currency)).toEqual(['USD', 'ILS', 'USDT']);
    expect(march.find((row) => row.currency === 'USD').net).toBe(245);
    expect(march.find((row) => row.currency === 'ILS').net).toBe(-49);
    expect(march.find((row) => row.currency === 'USDT').net).toBe(25);
    const usd = categoryChartSeries(rows, '2026-03', 'USD');
    expect(usd.every((row) => row.currency === 'USD')).toBe(true);
    expect(categoryChartSeries(rows, '2026-03', 'EUR')).toEqual([]);
  });

  it('caps the free list at 15 and leaves the monthly net available', () => {
    expect(FREE_LIMITS.businessEntries).toBe(15);
    expect(businessEntryLimit(14, false).canAdd).toBe(true);
    expect(businessEntryLimit(15, false)).toMatchObject({ cap: 15, canAdd: false });
    expect(businessEntryLimit(40, true)).toMatchObject({ cap: null, canAdd: true });
  });
});
