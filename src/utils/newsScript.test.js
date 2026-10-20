import { describe, it, expect } from 'vitest';
import {
  hasForeignScript,
  isHebrewSafeText,
  isHebrewSafeTranslation,
  dropInvalidTranslations,
  safeHebrew,
  preferredHeadline,
  partitionTranslations,
  sanitizeDigest,
} from './newsScript';

const BUG = 'જેપીמארגן מצפה שביטקוין יעלה על מניות אמריקאיות';
const HEBREW = "ג'יי.פי. מורגן מצפה שביטקוין יעלה";

describe('Hebrew news script validator', () => {
  it('accepts Hebrew, Latin names, digits, and common punctuation', () => {
    expect(isHebrewSafeText(HEBREW)).toBe(true);
    expect(isHebrewSafeText('JPMorgan ו-BlackRock משיקים ETF על XRP')).toBe(true);
    expect(isHebrewSafeText('ביטקוין עלה ל-$64,000 (5%) — "ETF"…')).toBe(true);
    expect(isHebrewSafeText('בְּרֵאשִׁית · ₪100')).toBe(true);
    expect(isHebrewSafeText('שלום\u200F')).toBe(true);
    expect(isHebrewSafeText('')).toBe(true);
    expect(isHebrewSafeText(null)).toBe(true);
    expect(hasForeignScript(HEBREW)).toBe(false);
  });

  it('rejects Gujarati, Devanagari, Cyrillic, CJK, Arabic, and Greek mixed into Hebrew', () => {
    expect(isHebrewSafeText(BUG)).toBe(false);
    expect(hasForeignScript('જેપી')).toBe(true);
    expect(isHebrewSafeText('जेपी מורגן מעלה תחזית')).toBe(false);
    expect(isHebrewSafeText('Дж. П. Морган מעלה תחזית')).toBe(false);
    expect(isHebrewSafeText('摩根大通 מעלה תחזית')).toBe(false);
    expect(isHebrewSafeText('جي بي مورغان מעלה תחזית')).toBe(false);
    expect(isHebrewSafeText('모건 מעלה תחזית')).toBe(false);
    expect(isHebrewSafeText('Ωמגה של השוק')).toBe(false);
  });

  it('rejects a translation whose title is fine but whose description is not', () => {
    expect(isHebrewSafeTranslation({ title: HEBREW, desc: '' })).toBe(true);
    expect(isHebrewSafeTranslation({ title: HEBREW })).toBe(true);
    expect(isHebrewSafeTranslation({ title: HEBREW, desc: 'פירוט על ETF' })).toBe(true);
    expect(isHebrewSafeTranslation({ title: HEBREW, desc: BUG })).toBe(false);
    expect(isHebrewSafeTranslation({ title: BUG, desc: '' })).toBe(false);
    expect(isHebrewSafeTranslation(HEBREW)).toBe(true);
    expect(isHebrewSafeTranslation(BUG)).toBe(false);
    expect(isHebrewSafeTranslation('')).toBe(false);
    expect(isHebrewSafeTranslation({ title: '   ' })).toBe(false);
    expect(isHebrewSafeTranslation(null)).toBe(false);
  });

  it('drops cached entries that use a foreign script and keeps the rest', () => {
    const map = {
      good: { title: HEBREW, desc: 'תקציר' },
      bug: { title: BUG, desc: '' },
      badDesc: { title: HEBREW, desc: 'જેપી' },
      cal: 'דוח תעסוקה',
      badCal: 'જેપી מורגן',
    };
    const cleaned = dropInvalidTranslations(map);
    expect(cleaned).toEqual({
      good: map.good,
      cal: 'דוח תעסוקה',
    });
    const clean = { only: map.good };
    expect(dropInvalidTranslations(clean)).toBe(clean);
    expect(dropInvalidTranslations(null)).toEqual({});
    expect(dropInvalidTranslations(['x'])).toEqual({});
  });

  it('falls back to the English headline when the Hebrew copy is unsafe', () => {
    expect(safeHebrew(BUG)).toBe('');
    expect(safeHebrew(HEBREW)).toBe(HEBREW);
    expect(preferredHeadline(BUG, BUG, 'JPMorgan expects bitcoin to rise')).toBe('JPMorgan expects bitcoin to rise');
    expect(preferredHeadline(HEBREW, 'JPMorgan expects bitcoin to rise', 'JPMorgan expects bitcoin to rise')).toBe(HEBREW);
    expect(preferredHeadline('', 'JPMorgan expects bitcoin to rise', 'unused')).toBe('JPMorgan expects bitcoin to rise');
  });

  it('keeps safe rows and returns the original English for one retry', () => {
    const source = [
      { title: 'JPMorgan expects bitcoin to beat stocks', desc: 'A note from the bank.' },
      { title: 'BlackRock lists an XRP ETF', desc: '' },
    ];
    const first = partitionTranslations(source, [
      { id: 0, title: BUG, desc: 'תקציר' },
      { id: '1', title: 'בלאקרוק משיקה ETF על XRP', desc: '' },
      { id: 5, title: HEBREW },
      { id: 0, title: '' },
    ]);
    expect(first.accepted[1]).toEqual({ title: 'בלאקרוק משיקה ETF על XRP', desc: '' });
    expect(first.accepted[0]).toBeNull();
    expect(first.rejected).toEqual([
      { id: 0, title: 'JPMorgan expects bitcoin to beat stocks', desc: 'A note from the bank.' },
    ]);

    const retry = partitionTranslations(source, [
      { id: 0, title: HEBREW, desc: 'הערה מהבנק.' },
    ]);
    expect(retry.accepted[0].title).toBe(HEBREW);
    expect(retry.rejected).toEqual([]);
  });

  it('prefers a later safe row over an earlier foreign-script row for the same id', () => {
    const source = [{ title: 'JPMorgan note', desc: '' }];
    const part = partitionTranslations(source, [
      { id: 0, title: BUG },
      { id: 0, title: HEBREW },
    ]);
    expect(part.accepted[0].title).toBe(HEBREW);
    expect(part.rejected).toEqual([]);
  });

  it('rejects a safe title when the description uses another script', () => {
    const source = [{ title: 'JPMorgan note', desc: 'details' }];
    const bad = partitionTranslations(source, [
      { id: 0, title: HEBREW, desc: `פירוט ${'જેપી'}` },
    ]);
    expect(bad.accepted[0]).toBeNull();
    expect(bad.rejected).toEqual([{ id: 0, title: 'JPMorgan note', desc: 'details' }]);
  });

  it('replaces a stored digest headline that uses a foreign script', () => {
    const digest = {
      market: 'stocks',
      stories: [
        {
          headline: BUG,
          why: 'חשוב לסוחר',
          sources: [{ title: 'JPMorgan expects bitcoin to beat stocks', link: 'https://example.com' }],
        },
        { headline: HEBREW, why: `בגלל ${'જેપી'}`, sources: [] },
      ],
    };
    const { digest: cleaned, changed } = sanitizeDigest(digest);
    expect(changed).toBe(true);
    expect(cleaned.stories[0].headline).toBe('JPMorgan expects bitcoin to beat stocks');
    expect(cleaned.stories[0].why).toBe('חשוב לסוחר');
    expect(cleaned.stories[1].headline).toBe(HEBREW);
    expect(cleaned.stories[1].why).toBe('');
    expect(sanitizeDigest(cleaned).changed).toBe(false);
    expect(sanitizeDigest(cleaned).digest).toBe(cleaned);
  });
});
