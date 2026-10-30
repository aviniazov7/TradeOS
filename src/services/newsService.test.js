import { afterEach, describe, expect, it, vi } from 'vitest';

const authState = { currentUser: null };
vi.mock('firebase/auth', () => ({ getAuth: () => authState }));

import { fetchNewsFeed, translateNews, unpackNewsTranslations } from './newsService';

afterEach(() => {
  authState.currentUser = null;
  vi.unstubAllGlobals();
});

describe('fetchNewsFeed', () => {
  it('loads the article list from the worker', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      items: [{ title: 'ECB', link: 'https://cointelegraph.com/news/ecb' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const items = await fetchNewsFeed('crypto');
    expect(items).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://trade-os.tradeos.workers.dev/news/feed?market=crypto');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('rss2json');
  });

  it('throws when the worker is down or returns no articles', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'upstream' }), { status: 502 })));
    await expect(fetchNewsFeed('stocks')).rejects.toThrow(/חדשות/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
    await expect(fetchNewsFeed('crypto')).rejects.toThrow(/חדשות/);
  });
});

describe('translateNews quota', () => {
  it('unpacks a spent quota as a quiet stop, including any cached rows', () => {
    expect(unpackNewsTranslations(null)).toEqual({ items: null, quotaExceeded: false });
    expect(unpackNewsTranslations([{ title: 'ביטקוין', desc: '' }])).toEqual({
      items: [{ title: 'ביטקוין', desc: '' }],
      quotaExceeded: false,
    });
    expect(unpackNewsTranslations({
      quotaExceeded: true,
      items: [null, { title: 'שמור', desc: '' }],
    })).toEqual({
      items: [null, { title: 'שמור', desc: '' }],
      quotaExceeded: true,
    });
  });

  it('returns the quota flag instead of throwing when the worker refuses the model call', async () => {
    authState.currentUser = { getIdToken: async () => 'token' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'הגעת למכסה היומית (20 בקשות).',
      quotaExceeded: true,
      items: [null],
    }), { status: 429, headers: { 'Content-Type': 'application/json' } })));
    const res = await translateNews([{ title: 'Bitcoin rises', desc: '' }]);
    expect(unpackNewsTranslations(res)).toEqual({ items: [null], quotaExceeded: true });
  });
});
