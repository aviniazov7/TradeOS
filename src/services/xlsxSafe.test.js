import { describe, expect, it } from 'vitest';
import { buildXlsx, spreadsheetCell } from './xlsxSafe';

describe('spreadsheetCell', () => {
  it('keeps numbers, including a negative P&L, as numbers', () => {
    expect(spreadsheetCell(-12.5)).toEqual({ type: 'n', value: -12.5 });
    expect(spreadsheetCell('-12.5')).toEqual({ type: 'n', value: -12.5 });
  });

  it('prefixes formula-looking text', () => {
    expect(spreadsheetCell('=HYPERLINK("https://evil.example","open")').value.startsWith("'=")).toBe(true);
    expect(spreadsheetCell('+cmd').value).toBe("'+cmd");
    expect(spreadsheetCell('@sum').value).toBe("'@sum");
  });
});

describe('buildXlsx', () => {
  it('writes text cells, not formula cells', () => {
    const bytes = buildXlsx([{
      name: 'עסקאות',
      rows: [['הערות', 'P&L'], ['=HYPERLINK("https://evil.example","open")', -12.5]],
    }]);
    const xml = Buffer.from(bytes).toString('utf8');
    expect(xml).toContain('t="inlineStr"');
    expect(xml).toContain("'=HYPERLINK");
    expect(xml).not.toContain('<f>');
    expect(xml).toContain('<v>-12.5</v>');
  });
});
