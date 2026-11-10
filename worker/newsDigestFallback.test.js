import { describe, expect, it } from 'vitest';
import { digestFromArticles } from './newsDigestFallback';

describe('headline digest fallback', () => {
  it('turns feed articles into digest stories without a model', () => {
    const digest = digestFromArticles('crypto', {
      updatedAt: 100,
      items: [
        { title: 'ETF outflows', link: 'https://example.com/a', sourceLabel: 'CoinDesk' },
        { title: '  ', link: 'https://example.com/skip', sourceLabel: 'X' },
        { title: 'Rate decision', link: 'https://example.com/b', sourceLabel: 'The Block' },
      ],
    });
    expect(digest).toMatchObject({ market: 'crypto', updatedAt: 100, source: 'headlines' });
    expect(digest.stories).toHaveLength(2);
    expect(digest.stories[0].headline).toBe('ETF outflows');
    expect(digest.stories[0].why).toContain('המקור');
    expect(digest.stories[0].sources[0].link).toBe('https://example.com/a');
  });

  it('returns null when there is nothing to show', () => {
    expect(digestFromArticles('stocks', { items: [] })).toBeNull();
    expect(digestFromArticles('stocks', null)).toBeNull();
  });
});