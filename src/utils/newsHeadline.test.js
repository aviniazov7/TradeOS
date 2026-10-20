import { describe, it, expect } from 'vitest';
import { headlineNeedsTranslation } from './newsHeadline';

describe('headlineNeedsTranslation', () => {
  it('asks to translate an English headline and leaves Hebrew alone', () => {
    expect(headlineNeedsTranslation('Bitcoin hits a new high')).toBe(true);
    expect(headlineNeedsTranslation('ביטקוין בשיא חדש')).toBe(false);
    expect(headlineNeedsTranslation('Bitcoin · ביטקוין')).toBe(false);
    expect(headlineNeedsTranslation('')).toBe(false);
    expect(headlineNeedsTranslation('જેપીמארגן מצפה שביטקוין יעלה')).toBe(true);
  });
});