import { describe, expect, it } from 'vitest';
import { globalSearchPagePaths } from './globalSearchPages';

describe('global page search', () => {
  it('sends a search for custom trade fields to the journal', () => {
    for (const query of ['שדות', 'שדות מותאמים', 'שדות נוספים לעסקה', 'שדה משלך', 'custom fields']) {
      const paths = globalSearchPagePaths(query);
      expect(paths).toContain('/journal');
      expect(paths).not.toContain('/profile');
    }
  });
});
