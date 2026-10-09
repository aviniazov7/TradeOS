import { describe, it, expect } from 'vitest';
import { wrapLtrRuns } from './bidiNumbers';

const mark = (t) => wrapLtrRuns(t, (r) => `[${r}]`);

describe('wrapLtrRuns', () => {
  it('isolates signed amounts with units', () => {
    expect(mark('רווח של +200 USDT היום')).toBe('רווח של [+200 USDT] היום');
    expect(mark('הפסד -1.5R בעסקה')).toBe('הפסד [-1.5R] בעסקה');
    expect(mark('ירידה של −3.2%')).toBe('ירידה של [−3.2%]');
  });

  it('isolates dollar prices and ranges', () => {
    expect(mark('כניסה ב $64,250.5 וסטופ')).toBe('כניסה ב [$64,250.5] וסטופ');
    expect(mark('אזור 0.74–0.75$ חשוב')).toBe('אזור [0.74–0.75$] חשוב');
    expect(mark('טווח $100-$120')).toBe('טווח [$100-$120]');
    expect(mark('סטופ ב-63,900$ בלבד')).toBe('סטופ ב-[63,900$] בלבד');
  });

  it('isolates plain numbers that carry a unit', () => {
    expect(mark('אחוז הצלחה 62% ו-3x מינוף')).toBe('אחוז הצלחה [62%] ו-[3x] מינוף');
    expect(mark('נפח 1.2M')).toBe('נפח [1.2M]');
  });

  it('leaves Hebrew prefix hyphens and bare numbers alone', () => {
    expect(mark('נכנסתי ב-200')).toBe('נכנסתי ב-200');
    expect(mark('עשית 12 עסקאות')).toBe('עשית 12 עסקאות');
    expect(mark('BTC2025 ו-ETH')).toBe('BTC2025 ו-ETH');
  });

  it('does not grab a unit that is the start of a word', () => {
    expect(mark('100 Range')).toBe('100 Range');
    expect(mark('5 Bitcoin')).toBe('5 Bitcoin');
  });

  it('wraps with an LTR span by default', () => {
    expect(wrapLtrRuns('+5%')).toBe('<span dir="ltr">+5%</span>');
  });
});
