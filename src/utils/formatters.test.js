import { describe, it, expect } from 'vitest';
import {
  formatCurrency, formatPercent, formatNumber, formatPrice,
  formatCompactUsd, formatCoinPrice, safeDate, formatRR, formatDuration,
} from './formatters';

// Every money figure and date on screen goes through these. The recurring
// failure mode is not an exception — it is rendering "NaN" or "$0.00" where a
// real number belongs, or throwing on an Invalid Date and blanking a screen.

describe('formatCurrency', () => {
  it('always carries an explicit sign and groups thousands', () => {
    expect(formatCurrency(1234.5)).toBe('+$1,234.50');
    expect(formatCurrency(-1234.5)).toBe('-$1,234.50');
  });
  it('treats zero as positive', () => {
    expect(formatCurrency(0)).toBe('+$0.00');
  });
  it('never renders NaN', () => {
    expect(formatCurrency(null)).toBe('$0.00');
    expect(formatCurrency(NaN)).toBe('$0.00');
    expect(formatCurrency(undefined)).toBe('$0.00');
  });
  it('honours a custom precision', () => {
    expect(formatCurrency(1.239, 3)).toBe('+$1.239');
  });
});

describe('formatPercent', () => {
  it('signs the value and fixes the decimals', () => {
    expect(formatPercent(3.847)).toBe('+3.85%');
    expect(formatPercent(-3.847)).toBe('-3.85%');
    expect(formatPercent(0)).toBe('+0.00%');
  });
  it('never renders NaN', () => {
    expect(formatPercent(null)).toBe('0.00%');
    expect(formatPercent(NaN)).toBe('0.00%');
  });
});

describe('formatNumber', () => {
  it('groups thousands and falls back to a bare 0', () => {
    expect(formatNumber(1234.567)).toBe('1,234.57');
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(NaN)).toBe('0');
  });
});

describe('formatPrice — precision scales with magnitude', () => {
  it('keeps big prices readable and small ones meaningful', () => {
    // A sub-cent coin at 2 decimals would render as 0.00 and look worthless.
    expect(formatPrice(80000)).toBe('80,000.00');
    expect(formatPrice(0.00001234)).toContain('0.0000');
    expect(formatPrice(0.00001234)).not.toBe('0.00');
  });
  it('zero and junk render as a bare 0', () => {
    expect(formatPrice(0)).toBe('0');
    expect(formatPrice(null)).toBe('0');
    expect(formatPrice(NaN)).toBe('0');
  });
});

describe('formatCompactUsd', () => {
  it('scales the suffix with the magnitude', () => {
    expect(formatCompactUsd(1.5e12)).toBe('$1.50T');
    expect(formatCompactUsd(2.3e9)).toBe('$2.3B');
    expect(formatCompactUsd(4.5e6)).toBe('$4.5M');
    expect(formatCompactUsd(12345)).toContain('12,345');
  });
  it('renders an em-dash for nothing rather than $0', () => {
    // These are market cap and open interest — "$0" reads as a real figure.
    expect(formatCompactUsd(0)).toBe('—');
    expect(formatCompactUsd(null)).toBe('—');
    expect(formatCompactUsd(NaN)).toBe('—');
  });
});

describe('formatCoinPrice', () => {
  it('prefixes $ and switches precision at $1', () => {
    expect(formatCoinPrice(1234.5678)).toBe('$1,234.57');
    expect(formatCoinPrice(0.000123)).toBe('$0.000123');
  });
  it('distinguishes a real zero price from no price at all', () => {
    // Zero is a value and takes the sub-$1 branch, so it renders with full
    // precision; only a missing price becomes the em-dash.
    expect(formatCoinPrice(0)).toBe('$0.000000');
    expect(formatCoinPrice(null)).toBe('—');
    expect(formatCoinPrice(undefined)).toBe('—');
  });
});

describe('safeDate', () => {
  it('reads a Firestore Timestamp, a Date and a string', () => {
    const ms = Date.UTC(2026, 2, 17);
    expect(safeDate({ toDate: () => new Date(ms) }).getTime()).toBe(ms);
    expect(safeDate(new Date(ms)).getTime()).toBe(ms);
    expect(safeDate('2026-03-17T00:00:00.000Z').getTime()).toBe(ms);
  });
  it('returns null for garbage — date-fns format() on an Invalid Date throws and blanks the screen', () => {
    expect(safeDate('not a date')).toBe(null);
    expect(safeDate(null)).toBe(null);
    expect(safeDate({})).toBe(null);
  });
});

describe('formatRR', () => {
  it('takes its sign from the P&L, not from the R value', () => {
    // R is stored unsigned app-wide; a signed value here rendered "--0.60R".
    expect(formatRR(1.92, 100)).toBe('1.92R');
    expect(formatRR(1.0, -50)).toBe('-1.00R');
  });
  it('with no P&L given, reads as positive', () => {
    expect(formatRR(2)).toBe('2.00R');
  });
  it('shows a dash when there is no R to show', () => {
    expect(formatRR(0, 100)).toBe('–');
    expect(formatRR(null, 100)).toBe('–');
    expect(formatRR(NaN, 100)).toBe('–');
  });
});

describe('formatDuration', () => {
  it('picks the unit that reads naturally', () => {
    expect(formatDuration(0.5)).toBe('30 דקות');
    expect(formatDuration(3.25)).toBe('3.3 שעות');
    expect(formatDuration(48)).toBe('2.0 ימים');
  });
  it('shows a dash for nothing or a negative span', () => {
    expect(formatDuration(0)).toBe('–');
    expect(formatDuration(-5)).toBe('–');
    expect(formatDuration(null)).toBe('–');
  });
});
