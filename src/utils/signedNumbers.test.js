import { describe, expect, it } from 'vitest';
import {
  classifyNumericHeader,
  columnLooksNumeric,
  formatPnlText,
  formatRText,
  normalizeSignedToken,
  parseSignedNumber,
  presentNumericCell,
} from './signedNumbers';

describe('parseSignedNumber', () => {
  it('reads a leading sign, a trailing sign, and currency', () => {
    expect(parseSignedNumber('-11.24')).toBe(-11.24);
    expect(parseSignedNumber('11.24-')).toBe(-11.24);
    expect(parseSignedNumber('1.06-')).toBe(-1.06);
    expect(parseSignedNumber('-$11.24')).toBe(-11.24);
    expect(parseSignedNumber('$11.24-')).toBe(-11.24);
    expect(parseSignedNumber('11.24$-')).toBe(-11.24);
    expect(parseSignedNumber('+$8.50')).toBe(8.5);
    expect(parseSignedNumber('+1,234.56')).toBe(1234.56);
    expect(parseSignedNumber('-1,234.56')).toBe(-1234.56);
    expect(parseSignedNumber('-1.06R')).toBe(-1.06);
    expect(parseSignedNumber('1.06R-')).toBe(-1.06);
    expect(parseSignedNumber('−3.2%')).toBe(-3.2);
  });

  it('rejects prose, ranges, and dates', () => {
    expect(parseSignedNumber('הפסד של 11')).toBeNull();
    expect(parseSignedNumber('100-120')).toBeNull();
    expect(parseSignedNumber('2026-10-16')).toBeNull();
    expect(parseSignedNumber('Long')).toBeNull();
    expect(parseSignedNumber('—')).toBeNull();
  });
});

describe('formatPnlText', () => {
  it('puts the sign before the dollar and groups thousands', () => {
    expect(formatPnlText(-11.24)).toBe('-$11.24');
    expect(formatPnlText(8.5)).toBe('+$8.50');
    expect(formatPnlText(1234.5)).toBe('+$1,234.50');
    expect(formatPnlText(-1234.5)).toBe('-$1,234.50');
    expect(formatPnlText(0)).toBe('+$0.00');
    expect(formatPnlText(-4, { decimals: 0 })).toBe('-$4');
  });
});

describe('formatRText', () => {
  it('uses two decimals and an R suffix, sign first', () => {
    expect(formatRText(-1.06)).toBe('-1.06R');
    expect(formatRText(1.2)).toBe('+1.20R');
    expect(formatRText(0)).toBe('0.00R');
    expect(formatRText(-1.064)).toBe('-1.06R');
    expect(formatRText(12.3, 1)).toBe('+12.3R');
    expect(formatRText(null)).toBeNull();
  });
});

describe('normalizeSignedToken', () => {
  it('moves a trailing minus in front and leaves ranges alone', () => {
    expect(normalizeSignedToken('11.24-')).toBe('-11.24');
    expect(normalizeSignedToken('$11.24-')).toBe('-$11.24');
    expect(normalizeSignedToken('1.06R-')).toBe('-1.06R');
    expect(normalizeSignedToken('-$11.24')).toBe('-$11.24');
    expect(normalizeSignedToken('65000')).toBe('65000');
    expect(normalizeSignedToken('$100-$120')).toBe('$100-$120');
    expect(normalizeSignedToken('+200 USDT')).toBe('+200 USDT');
  });
});

describe('column classification', () => {
  it('recognizes P&L and R headers and leaves prices as plain numbers', () => {
    expect(classifyNumericHeader('R')).toBe('r');
    expect(classifyNumericHeader('P&L (USD)')).toBe('pnl');
    expect(classifyNumericHeader('PnL')).toBe('pnl');
    expect(classifyNumericHeader('רווח/הפסד')).toBe('pnl');
    expect(classifyNumericHeader('כניסה')).toBe('text');
    expect(classifyNumericHeader('תאריך')).toBe('text');
  });

  it('treats a column of bare numbers as numeric', () => {
    expect(columnLooksNumeric(['65000', '0.45', '5.4'])).toBe(true);
    expect(columnLooksNumeric(['Long', 'Short', 'Long'])).toBe(false);
    expect(columnLooksNumeric(['2026-10-16', '2026-10-15'])).toBe(false);
  });
});

describe('presentNumericCell', () => {
  it('reformats a flipped P&L and R and colors only those', () => {
    expect(presentNumericCell('11.24-', 'pnl')).toEqual({
      text: '-$11.24', tone: 'loss', numeric: true, kind: 'pnl',
    });
    expect(presentNumericCell('1.06-', 'r')).toEqual({
      text: '-1.06R', tone: 'loss', numeric: true, kind: 'r',
    });
    expect(presentNumericCell('+$8.50', 'pnl')).toMatchObject({ text: '+$8.50', tone: 'profit' });
    expect(presentNumericCell('8.5', 'pnl')).toMatchObject({ text: '+$8.50', tone: 'profit' });
    expect(presentNumericCell('65000', 'number')).toEqual({
      text: '65000', tone: null, numeric: true, kind: 'number',
    });
    expect(presentNumericCell('11.24-', 'number').text).toBe('-11.24');
    expect(presentNumericCell('11.24-', 'number').tone).toBeNull();
    expect(presentNumericCell('Short', 'pnl')).toBeNull();
    expect(presentNumericCell('**+$8**', 'pnl')).toBeNull();
  });
});
