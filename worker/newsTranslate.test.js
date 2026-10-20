import { describe, it, expect } from 'vitest';
import { NEWS_TRANSLATE_PROMPT, NEWS_TRANSLATE_RETRY_PROMPT } from './newsTranslate';

describe('news translation prompt', () => {
  it('requires Hebrew output and keeps names in Latin or Hebrew transliteration', () => {
    for (const prompt of [NEWS_TRANSLATE_PROMPT, NEWS_TRANSLATE_RETRY_PROMPT]) {
      expect(prompt).toContain('JPMorgan');
      expect(prompt).toContain('BlackRock');
      expect(prompt).toContain('ETF');
      expect(prompt).toContain('XRP');
      expect(prompt).toContain("ג'יי.פי. מורגן");
      expect(prompt).toContain('גוג\'ראטי');
      expect(prompt).toContain('דוונאגרי');
      expect(prompt).toContain('קירילית');
      expect(prompt).toContain('ערבית');
    }
    expect(NEWS_TRANSLATE_PROMPT).toContain('הפלט בעברית בלבד');
    expect(NEWS_TRANSLATE_RETRY_PROMPT).toContain('התרגום הקודם נפסל');
  });
});
