import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));

import { fetchNewsFeed } from './newsService';

afterEach(() => {
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
