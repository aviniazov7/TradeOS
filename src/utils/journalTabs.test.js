import { describe, expect, it } from 'vitest';
import { resolveJournalTab } from './journalTabs';

describe('resolveJournalTab', () => {
  it('folds the old positions link into the exchange hub', () => {
    expect(resolveJournalTab('positions')).toBe('exchange');
    expect(resolveJournalTab('exchange')).toBe('exchange');
    expect(resolveJournalTab(null)).toBe('trades');
    expect(resolveJournalTab('nope')).toBe('trades');
  });

  it('hides the exchange hub on a non-crypto journal', () => {
    expect(resolveJournalTab('exchange', { crypto: false })).toBe('trades');
    expect(resolveJournalTab('positions', { crypto: false })).toBe('trades');
    expect(resolveJournalTab('calendar', { crypto: false })).toBe('calendar');
    expect(resolveJournalTab('week', { crypto: false })).toBe('week');
    expect(resolveJournalTab('week')).toBe('week');
  });
});
