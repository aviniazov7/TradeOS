import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCurrencyShort, formatPercent, formatRR, formatSignedR, formatCompactUsd, LRM, LRI, PDI } from './formatters';

// Signed numbers are wrapped in LTR isolates (LRI…PDI) and still carry a
// leading LEFT-TO-RIGHT MARK, so Hebrew cannot move the sign or the "$".
const iso = (body) => `${LRI}${body}${PDI}`;

describe('signed number formatters', () => {
  it('formatCurrency keeps the sign in front and isolates the run', () => {
    expect(formatCurrency(-106)).toBe(iso(`${LRM}-$106.00`));
    expect(formatCurrency(288)).toBe(iso(`${LRM}+$288.00`));
    expect(formatCurrency(-14.13)).toBe(iso(`${LRM}-$14.13`));
    expect(formatCurrency(1234.5)).toBe(iso(`${LRM}+$1,234.50`));
    // callers that strip the plus still work
    expect(formatCurrency(5).replace('+', '')).toBe(iso(`${LRM}$5.00`));
  });
  it('formatCurrencyShort abbreviates only big amounts', () => {
    expect(formatCurrencyShort(-2647.19)).toBe(iso(`${LRM}-$2,647.19`));
    expect(formatCurrencyShort(99999.99)).toBe(iso(`${LRM}+$99,999.99`));
    expect(formatCurrencyShort(123456)).toBe(iso(`${LRM}+$123.5K`));
    expect(formatCurrencyShort(-1118566.25)).toBe(iso(`${LRM}-$1.12M`));
  });
  it('formatPercent keeps the sign in front', () => {
    expect(formatPercent(-5.72)).toBe(iso(`${LRM}-5.72%`));
    expect(formatPercent(3.851, 1)).toBe(iso(`${LRM}+3.9%`));
  });
  it('formatCompactUsd isolates a market-cap figure and dashes an empty one', () => {
    expect(formatCompactUsd(2.93e12)).toBe(iso('$2.93T'));
    expect(formatCompactUsd(0)).toBe('—');
    expect(formatCompactUsd(null)).toBe('—');
  });
  it('formatRR signs a loss', () => {
    expect(formatRR(1.33, -14)).toBe(iso(`${LRM}-1.33R`));
    expect(formatRR(2, 10)).toBe(iso(`${LRM}2.00R`));
    expect(formatRR(0, 10)).toBe('–');
  });
  it('formatSignedR keeps a zero and a negative net R', () => {
    expect(formatSignedR(1.8)).toBe(iso(`${LRM}1.80R`));
    expect(formatSignedR(-0.2)).toBe(iso(`${LRM}-0.20R`));
    expect(formatSignedR(0)).toBe(iso(`${LRM}0.00R`));
    expect(formatSignedR(null)).toBe('–');
  });
  it('the mark is invisible (U+200E) and the isolates are U+2066 / U+2069', () => {
    expect(LRM).toBe('\u200E');
    expect(LRI).toBe('\u2066');
    expect(PDI).toBe('\u2069');
  });
});
