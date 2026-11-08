import { describe, expect, it } from 'vitest';
import {
  BACKTEST_JOURNAL_STORAGE_KEY,
  backtestJournalStorageKey,
  readStoredBacktestJournalId,
  rememberBacktestJournalId,
  resolveBacktestJournalId,
} from './backtestSelection';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const journals = [
  { id: 'old', name: 'בקטסט ראשי' },
  { id: 'btc', name: 'BTC' },
];

describe('backtest journal selection', () => {
  it('keeps each account’s journal id', () => {
    const storage = memoryStorage();
    rememberBacktestJournalId(storage, 'user-a', 'btc', ['old', 'btc']);
    rememberBacktestJournalId(storage, 'user-b', 'other', ['other']);

    expect(readStoredBacktestJournalId(storage, 'user-a')).toBe('btc');
    expect(readStoredBacktestJournalId(storage, 'user-b')).toBe('other');
    expect(storage.getItem(BACKTEST_JOURNAL_STORAGE_KEY)).toBeNull();
  });

  it('adopts a legacy pointer only for the account that owns it', () => {
    const storage = memoryStorage({ [BACKTEST_JOURNAL_STORAGE_KEY]: 'btc' });
    expect(readStoredBacktestJournalId(storage, 'user-a')).toBe('btc');

    rememberBacktestJournalId(storage, 'user-a', 'btc', ['old', 'btc']);
    expect(storage.getItem(backtestJournalStorageKey('user-a'))).toBe('btc');
    expect(storage.getItem(BACKTEST_JOURNAL_STORAGE_KEY)).toBeNull();
  });

  it('does not erase the other account’s legacy pointer', () => {
    const storage = memoryStorage({ [BACKTEST_JOURNAL_STORAGE_KEY]: 'btc-b' });
    rememberBacktestJournalId(storage, 'user-a', 'old-a', ['old-a', 'btc-a']);

    expect(storage.getItem(BACKTEST_JOURNAL_STORAGE_KEY)).toBe('btc-b');
    expect(readStoredBacktestJournalId(storage, 'user-b')).toBe('btc-b');
    expect(storage.getItem(backtestJournalStorageKey('user-a'))).toBe('old-a');
  });

  it('does not store a journal id this account does not own', () => {
    const storage = memoryStorage();
    rememberBacktestJournalId(storage, 'user-b', 'btc-a', ['old-b']);
    expect(storage.getItem(backtestJournalStorageKey('user-b'))).toBeNull();
  });

  it('resolves the stored journal instead of the oldest one', () => {
    expect(resolveBacktestJournalId(journals, 'btc', null)).toBe('btc');
    expect(resolveBacktestJournalId(journals, 'missing', null)).toBe('old');
    expect(resolveBacktestJournalId(journals, 'new-id', 'new-id')).toBe('new-id');
    expect(resolveBacktestJournalId([], 'btc', null)).toBeNull();
  });
});
