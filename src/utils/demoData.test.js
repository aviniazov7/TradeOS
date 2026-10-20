import { describe, expect, it } from 'vitest';
import {
  DEMO_BANNER_TEXT, DEMO_START_BALANCE, buildDemoTrades, isDemoTrade, overlayDemo, readDemoMode, writeDemoMode,
} from './demoData';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

describe('demo mode', () => {
  it('stores the flag per user and clears it on exit', () => {
    const storage = memoryStorage();
    expect(readDemoMode('u1', storage)).toBe(false);
    writeDemoMode('u1', true, storage);
    expect(readDemoMode('u1', storage)).toBe(true);
    expect(readDemoMode('u2', storage)).toBe(false);
    writeDemoMode('u1', false, storage);
    expect(readDemoMode('u1', storage)).toBe(false);
  });

  it('fills an empty account with sample trades that are marked demo', () => {
    const view = overlayDemo({
      active: true,
      trades: [],
      journals: [{ id: 'j1', name: 'היומן שלי', exchange: 'other', initialBalance: 0 }],
      activeJournalId: 'j1',
      now: Date.parse('2026-10-01T00:00:00Z'),
    });
    expect(view.active).toBe(true);
    expect(view.trades.length).toBeGreaterThanOrEqual(5);
    expect(view.trades.every(isDemoTrade)).toBe(true);
    expect(view.trades.every((t) => t.journalId === 'j1')).toBe(true);
    expect(view.journals[0].demo).toBe(true);
    expect(view.journals[0].initialBalance).toBe(DEMO_START_BALANCE);
    expect(view.journals[0].exchange).toBe('other');
  });

  it('never replaces real trades', () => {
    const real = [{ id: 'real-1', pair: 'BTCUSDT', journalId: 'j1' }];
    const view = overlayDemo({ active: true, trades: real, journals: [{ id: 'j1' }], activeJournalId: 'j1' });
    expect(view.active).toBe(false);
    expect(view.trades).toBe(real);
    expect(view.journals[0].demo).toBeUndefined();
  });

  it('keeps sample rows off any real id', () => {
    const rows = buildDemoTrades('j1');
    expect(rows.every((t) => String(t.id).startsWith('demo-'))).toBe(true);
    expect(rows.some((t) => t.source !== 'demo')).toBe(false);
  });

  it('says the sample is not saved', () => {
    expect(DEMO_BANNER_TEXT).toContain('דמו');
    expect(DEMO_BANNER_TEXT).toContain('לא נשמרות');
  });
});
