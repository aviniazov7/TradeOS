import { describe, expect, it } from 'vitest';
import { isUnsetExchange } from './constants';
import { planJournalExchangeBind } from './exchangeBinding';

describe('isUnsetExchange', () => {
  it('treats other, blank and Hebrew placeholders as no venue', () => {
    for (const value of ['other', 'OTHER', 'אחר', 'אחרת', 'ללא', '', '  ', null, undefined]) {
      expect(isUnsetExchange(value)).toBe(true);
    }
    expect(isUnsetExchange('bybit')).toBe(false);
    expect(isUnsetExchange('binance')).toBe(false);
  });
});

describe('planJournalExchangeBind', () => {
  const otherJournal = { id: 'j1', exchange: 'other' };
  const blankJournal = { id: 'j2', exchange: '' };
  const bybitJournal = { id: 'j3', exchange: 'bybit' };

  it('tags a blank or other journal with the exchange that just connected', () => {
    expect(planJournalExchangeBind({ journals: [otherJournal], activeJournalId: 'j1', exchangeId: 'mexc' }))
      .toEqual({ action: 'patch', journalId: 'j1', exchange: 'mexc' });
    expect(planJournalExchangeBind({ journals: [blankJournal], activeJournalId: 'j2', exchangeId: 'bybit' }))
      .toEqual({ action: 'patch', journalId: 'j2', exchange: 'bybit' });
  });

  it('does not retag a journal that already names a real exchange', () => {
    expect(planJournalExchangeBind({ journals: [bybitJournal], activeJournalId: 'j3', exchangeId: 'mexc' }))
      .toEqual({ action: 'keep', journalId: 'j3' });
  });

  it('selects the journal that already belongs to the connected exchange', () => {
    expect(planJournalExchangeBind({
      journals: [otherJournal, bybitJournal],
      activeJournalId: 'j1',
      exchangeId: 'bybit',
    })).toEqual({ action: 'select', journalId: 'j3' });
  });

  it('creates a journal when the account has none', () => {
    expect(planJournalExchangeBind({ journals: [], exchangeId: 'okx' }))
      .toEqual({ action: 'create', exchangeId: 'okx' });
  });

  it('ignores archived journals', () => {
    expect(planJournalExchangeBind({
      journals: [{ id: 'old', exchange: 'bybit', archived: true }],
      exchangeId: 'bybit',
    })).toEqual({ action: 'create', exchangeId: 'bybit' });
  });
});
