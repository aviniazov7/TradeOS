import { describe, it, expect } from 'vitest';
import { parseSections, CANONICAL } from './aiReportSections';

// The contract between the coach prompt and the UI. A model that formats its
// headings slightly differently must still render — silently dropping a
// section would hide advice the user asked for.

const report = `**חוזקות**
• ניהול סיכון עקבי
**חולשות**
• over-trading בלונדון
**המלצות לפעולה**
• הקטן גודל פוזיציה
**תובנות מתקדמות**
• ה-R הממוצע עולה`;

describe('parseSections', () => {
  it('parses the four canonical sections in order', () => {
    const out = parseSections(report);
    expect(out.map((s) => s.title)).toEqual(CANONICAL);
    expect(out[0].bullets).toEqual(['ניהול סיכון עקבי']);
  });

  it('reorders sections the model emitted out of sequence', () => {
    const out = parseSections(`**חולשות**\n• א\n**חוזקות**\n• ב`);
    expect(out.map((s) => s.title)).toEqual(['חוזקות', 'חולשות']);
  });

  it('accepts markdown # headings as well as **bold**', () => {
    expect(parseSections(`## חוזקות\n• א`)[0].title).toBe('חוזקות');
  });

  it('tolerates numbering, trailing colons and stray asterisks in the heading', () => {
    for (const h of ['**1. חוזקות**', '**חוזקות:**', '### 2) חוזקות']) {
      expect(parseSections(`${h}\n• א`)[0]?.title).toBe('חוזקות');
    }
  });

  it('strips every bullet marker style', () => {
    const out = parseSections(`**חוזקות**\n• א\n- ב\n* ג`);
    expect(out[0].bullets).toEqual(['א', 'ב', 'ג']);
  });

  it('drops sections that are not canonical, and canonical ones with no bullets', () => {
    const out = parseSections(`**משהו אחר**\n• א\n**חוזקות**\n**חולשות**\n• ב`);
    expect(out.map((s) => s.title)).toEqual(['חולשות']);
  });

  it('ignores blank lines and leading prose before the first heading', () => {
    const out = parseSections(`שלום\n\n**חוזקות**\n\n• א\n`);
    expect(out).toHaveLength(1);
    expect(out[0].bullets).toEqual(['א']);
  });

  it('returns an empty list rather than throwing on junk', () => {
    expect(parseSections('')).toEqual([]);
    expect(parseSections(null)).toEqual([]);
    expect(parseSections(undefined)).toEqual([]);
    expect(parseSections('just a sentence')).toEqual([]);
  });
});
