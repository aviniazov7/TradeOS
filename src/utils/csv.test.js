import { describe, it, expect } from 'vitest';
import { toCsv, stampedName } from './csv';

// A CSV export that shifts a column, or that Excel executes as a formula, is
// worse than no export: the user takes the numbers elsewhere and trusts them.

const BOM = '\uFEFF';
const body = (csv) => csv.replace(new RegExp('^' + BOM), '').split('\n');

describe('toCsv — escaping', () => {
  it('leaves ordinary values alone', () => {
    expect(body(toCsv(['a', 'b'], [[1, 'x']]))).toEqual(['a,b', '1,x']);
  });

  it('quotes a field containing a comma so the columns cannot shift', () => {
    expect(body(toCsv(['note'], [['buy, then hold']]))[1]).toBe('"buy, then hold"');
  });

  it('doubles inner quotes, per RFC 4180', () => {
    expect(body(toCsv(['note'], [['he said "go"']]))[1]).toBe('"he said ""go"""');
  });

  it('quotes a field containing a newline or carriage return', () => {
    // Asserted on the whole string, not line-by-line: the point of the quoting
    // is that this value spans lines without ending the CSV record.
    expect(toCsv(['note'], [['line1\nline2']])).toContain('"line1\nline2"');
    expect(toCsv(['note'], [['a\rb']])).toContain('"a\rb"');
  });

  it('renders null and undefined as empty, not as the words', () => {
    expect(body(toCsv(['a', 'b'], [[null, undefined]]))[1]).toBe(',');
  });
});

describe('toCsv — spreadsheet formula injection', () => {
  it('neutralises every character Excel and Sheets treat as a formula', () => {
    // Free-text notes and market titles reach this file. Without the guard,
    // opening the export runs them.
    for (const evil of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      const cell = body(toCsv(['x'], [[evil]]))[1];
      expect(cell.replace(/^"/, '').startsWith("'")).toBe(true);
    }
  });

  it('a neutralised value that also needs quoting gets both', () => {
    expect(body(toCsv(['x'], [['=cmd,1']]))[1]).toBe(`"'=cmd,1"`);
  });

  it('does not touch a value that merely CONTAINS an equals sign', () => {
    expect(body(toCsv(['x'], [['a=b']]))[1]).toBe('a=b');
  });
});

describe('toCsv — Excel compatibility', () => {
  it('starts with a BOM so Excel renders Hebrew instead of mojibake', () => {
    expect(toCsv(['זוג'], [['ביטקוין']]).startsWith(BOM)).toBe(true);
  });

  it('escapes headers as well as rows', () => {
    expect(body(toCsv(['a,b'], []))[0]).toBe('"a,b"');
  });

  it('handles no rows at all', () => {
    expect(body(toCsv(['a'], []))).toEqual(['a']);
  });
});

describe('stampedName', () => {
  it('appends an ISO date and the .csv extension', () => {
    expect(stampedName('trades')).toMatch(/^trades_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
