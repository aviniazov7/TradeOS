import { describe, expect, it } from 'vitest';
import { backtestSettingsSnapshot, defaultBacktestPair } from './backtestForm';

describe('defaultBacktestPair', () => {
  it('uses the journal\'s first selected symbol', () => {
    expect(defaultBacktestPair({
      pairs: ['eur/usd', 'GBPUSD'],
      trades: [{ pair: 'NAS100', date: '2026-10-01' }],
      lastUsed: 'USDJPY',
    })).toBe('EURUSD');
  });

  it('skips a blank pair and keeps the next selected symbol', () => {
    expect(defaultBacktestPair({ pairs: ['', '  ', 'US30'] })).toBe('US30');
  });

  it('uses the last symbol saved in that journal when none are selected', () => {
    expect(defaultBacktestPair({
      pairs: [],
      lastUsed: 'nas100',
      trades: [{ pair: 'BTCUSDT', date: '2026-10-02' }],
    })).toBe('NAS100');
    expect(defaultBacktestPair({
      pairs: [],
      trades: [
        { pair: 'EURUSD', date: '2026-01-01' },
        { pair: 'GBPUSD', createdAt: '2026-06-01' },
      ],
    })).toBe('GBPUSD');
  });

  it('falls back to BTCUSDT only when the journal has no symbol at all', () => {
    expect(defaultBacktestPair({ pairs: [], trades: [] })).toBe('BTCUSDT');
    expect(defaultBacktestPair({ pairs: ['not a symbol'] })).toBe('BTCUSDT');
  });
});

describe('backtestSettingsSnapshot', () => {
  it('ignores example row keys and treats a typed draft as a change', () => {
    const form = {
      name: 'יומן',
      pairs: ['EURUSD'],
      tradeExamples: [{ title: 'כניסה', chartUrl: '', description: '', _key: 'ex-0' }],
    };
    const base = backtestSettingsSnapshot(form, '');
    expect(backtestSettingsSnapshot({
      ...form,
      tradeExamples: [{ title: 'כניסה', chartUrl: '', description: '', _key: 'other' }],
    }, '')).toBe(base);
    expect(backtestSettingsSnapshot(form, 'פריט')).not.toBe(base);
    expect(backtestSettingsSnapshot({ ...form, name: 'אחר' }, '')).not.toBe(base);
  });
});
