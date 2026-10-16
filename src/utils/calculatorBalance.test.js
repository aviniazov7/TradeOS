import { describe, expect, it } from 'vitest';
import {
  calculatorBalanceCaption,
  calculatorJournalLabel,
  formatBalanceInput,
  journalAccountBalance,
} from './calculatorBalance';

const mexc = { id: 'j1', name: 'MEXC', exchange: 'mexc', initialBalance: 50 };
const scalp = { id: 'j2', name: 'סקלפינג', exchange: 'bybit', initialBalance: 80.456 };

describe('journal account balance', () => {
  it('prefers a positive live wallet over the journal opening balance', () => {
    expect(journalAccountBalance(mexc, 394.14223635)).toBe(394.14223635);
  });

  it('uses the journal opening balance when the wallet is missing or not positive', () => {
    expect(journalAccountBalance(mexc, null)).toBe(50);
    expect(journalAccountBalance(mexc, 0)).toBe(50);
    expect(journalAccountBalance(mexc, -1)).toBe(50);
  });

  it('returns nothing when neither source is a positive balance', () => {
    expect(journalAccountBalance({ initialBalance: 0 }, null)).toBeNull();
    expect(journalAccountBalance(null, undefined)).toBeNull();
  });
});

describe('formatBalanceInput', () => {
  it('rounds the displayed balance to 2 decimals', () => {
    expect(formatBalanceInput(394.14223635)).toBe('394.14');
    expect(formatBalanceInput(10)).toBe('10.00');
    expect(formatBalanceInput(1.005)).toBe('1.01');
    expect(formatBalanceInput(80.456)).toBe('80.46');
  });

  it('stays empty when there is no positive balance', () => {
    expect(formatBalanceInput(null)).toBe('');
    expect(formatBalanceInput(0)).toBe('');
    expect(formatBalanceInput(-4)).toBe('');
  });
});

describe('calculator journal label', () => {
  it('names the venue once when the journal is already called MEXC', () => {
    expect(calculatorJournalLabel(mexc)).toBe('MEXC');
  });

  it('includes the exchange when the journal name is something else', () => {
    expect(calculatorJournalLabel(scalp)).toBe('סקלפינג · Bybit');
  });

  it('says whether the figure is the live wallet or the opening balance', () => {
    expect(calculatorBalanceCaption(mexc, 394.14)).toBe('ארנק MEXC');
    expect(calculatorBalanceCaption(scalp, null)).toBe('יתרה התחלתית · סקלפינג · Bybit');
    expect(calculatorBalanceCaption({ name: 'ריק', initialBalance: 0 }, null)).toBe('');
  });
});
