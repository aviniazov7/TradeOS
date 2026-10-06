import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatRR, LRM } from './formatters';

// Signed numbers carry a leading LEFT-TO-RIGHT MARK so, inside Hebrew text,
// the sign stays in front of the number instead of jumping to its end.
describe('signed number formatters', () => {
  it('formatCurrency keeps the sign in front', () => {
    expect(formatCurrency(-14.13)).toBe(`${LRM}-$14.13`);
    expect(formatCurrency(1234.5)).toBe(`${LRM}+$1,234.50`);
    // callers that strip the plus still work
    expect(formatCurrency(5).replace('+', '')).toBe(`${LRM}$5.00`);
  });
  it('formatPercent keeps the sign in front', () => {
    expect(formatPercent(-5.72)).toBe(`${LRM}-5.72%`);
    expect(formatPercent(3.851, 1)).toBe(`${LRM}+3.9%`);
  });
  it('formatRR signs a loss', () => {
    expect(formatRR(1.33, -14)).toBe(`${LRM}-1.33R`);
    expect(formatRR(2, 10)).toBe(`${LRM}2.00R`);
    expect(formatRR(0, 10)).toBe('–');
  });
  it('the mark is invisible (U+200E)', () => {
    expect(LRM).toBe('‎');
  });
});
