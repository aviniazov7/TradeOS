import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import {
  NEWS_LIST_SOURCES,
  handleNewsFeed,
  mergeNewsArticles,
  parseFeedArticles,
  parseRssItems,
  resetNewsFeedGate,
} from './newsFeed.js';

const cors = { 'Access-Control-Allow-Origin': 'https://tradeoslive.web.app' };
const SOURCE = { key: 'cointelegraph', label: 'CoinTelegraph', rss: 'https://cointelegraph.com/rss' };
const FEED_URL = 'https://trade-os.example/news/feed?market=crypto';

const RSS = `<?xml version="1.0"?><rss><channel>
<item>
  <title><![CDATA[ECB official sees digital euro]]></title>
  <link><![CDATA[https://cointelegraph.com/news/ecb?utm_source=rss_feed&utm_medium=rss]]></link>
  <pubDate>Sun, 25 Oct 2026 15:11:00 +0000</pubDate>
  <description><![CDATA[<p><img src="https://images.example/ecb.jpg" alt="ECB official sees digital euro"></p><p>Piero Cipollone said the bloc is on track.</p><p>The post ECB official appeared first on CoinTelegraph.</p>]]></description>
  <dc:creator><![CDATA[Cointelegraph by Robert Lakin]]></dc:creator>
  <enclosure url="https://images.example/ecb.jpg" length="10" type="image/jpeg"/>
</item>
<item>
  <title>Skip me</title>
  <link>javascript:alert(1)</link>
  <pubDate>Sun, 25 Oct 2026 16:00:00 +0000</pubDate>
  <enclosure url="javascript:alert(1)" type="image/jpeg"/>
</item>
<item>
  <title>Pump.fun&#8217;s gap</title>
  <link>https://cryptoslate.com/pump</link>
  <pubDate>Sun, 25 Oct 2026 14:00:00 +0000</pubDate>
  <description>Plain summary</description>
  <media:content url="https://cryptoslate.com/a.webp?fm=jpg&amp;w=800" type="image/*" medium="image"/>
  <enclosure url="https://cryptoslate.com/audio.mp3" type="audio/mpeg"/>
</item>
</channel></rss>`;

function memoryCache() {
  const store = new Map();
  return {
    store,
    async match(req) {
      const saved = store.get(req.url);
      if (!saved) return undefined;
      return new Response(saved.body, { status: saved.status, headers: saved.headers });
    },
    async put(req, res) {
      store.set(req.url, {
        body: await res.text(),
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
      });
    },
  };
}

describe('parseRssItems / parseFeedArticles', () => {
  it('keeps the digest shape and drops non-http links', () => {
    const items = parseRssItems(RSS, SOURCE);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'ECB official sees digital euro',
      link: 'https://cointelegraph.com/news/ecb?utm_source=rss_feed&utm_medium=rss',
      pubDate: 'Sun, 25 Oct 2026 15:11:00 +0000',
      sourceKey: 'cointelegraph',
      sourceLabel: 'CoinTelegraph',
    });
    expect(items[1].title).toBe('Pump.fun’s gap');
    expect(items.some((item) => item.link.startsWith('javascript:'))).toBe(false);
  });

  it('reads a summary and an image, and ignores a challenge page', () => {
    const [first, second] = parseFeedArticles(RSS, SOURCE);
    expect(first.description).toBe('Piero Cipollone said the bloc is on track.');
    expect(first.thumbnail).toBe('https://images.example/ecb.jpg');
    expect(first.author).toBe('Cointelegraph by Robert Lakin');
    expect(second.thumbnail).toBe('https://cryptoslate.com/a.webp?fm=jpg&w=800');
    expect(parseFeedArticles('<html><title>Just a moment...</title></html>', SOURCE)).toEqual([]);
  });

  it('caps the digest at 20 items and falls back to Atom links', () => {
    const items = Array.from({ length: 25 }, (_, i) => (
      `<item><title>T${i}</title><link>https://ex.com/${i}</link><pubDate>Sun, 25 Oct 2026 15:11:00 +0000</pubDate></item>`
    )).join('');
    expect(parseRssItems(`<rss><channel>${items}</channel></rss>`, SOURCE)).toHaveLength(20);
    const atom = `<feed><entry><title>Atom story</title><link href="https://example.com/a?x=1&amp;y=2"/><published>2026-10-25T12:00:00Z</published></entry></feed>`;
    expect(parseRssItems(atom, SOURCE)).toEqual([{
      title: 'Atom story',
      link: 'https://example.com/a?x=1&y=2',
      pubDate: '2026-10-25T12:00:00Z',
      sourceKey: 'cointelegraph',
      sourceLabel: 'CoinTelegraph',
    }]);
  });
});

describe('mergeNewsArticles', () => {
  it('keeps each outlet and orders newest first', () => {
    const merged = mergeNewsArticles([
      [
        { title: 'old', link: 'https://a.example/1', pubDate: 'Sun, 25 Oct 2026 10:00:00 +0000' },
        { title: 'dup', link: 'https://a.example/2', pubDate: 'Sun, 25 Oct 2026 12:00:00 +0000' },
      ],
      [
        { title: 'new', link: 'https://b.example/1', pubDate: 'Sun, 25 Oct 2026 16:00:00 +0000' },
        { title: 'dup later', link: 'https://a.example/2', pubDate: 'Sun, 25 Oct 2026 15:00:00 +0000' },
      ],
    ]);
    expect(merged.map((item) => item.link)).toEqual([
      'https://b.example/1',
      'https://a.example/2',
      'https://a.example/1',
    ]);
    expect(merged[1].title).toBe('dup later');
  });
});

describe('handleNewsFeed', () => {
  beforeEach(() => resetNewsFeedGate());

  it('serves parsed RSS, caches it, and does not call rss2json', async () => {
    const fetchImpl = vi.fn(async () => new Response(RSS, { status: 200 }));
    const cache = memoryCache();
    const first = await handleNewsFeed(FEED_URL, cors, { fetchImpl, cache });
    const second = await handleNewsFeed(FEED_URL, cors, { fetchImpl, cache });
    expect(first.status).toBe(200);
    expect(first.headers.get('X-Cache')).toBe('MISS');
    expect(first.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await first.json();
    expect(body.market).toBe('crypto');
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].link).toMatch(/^https:\/\//);
    expect(second.headers.get('X-Cache')).toBe('HIT');
    expect(await second.json()).toEqual(body);
    expect(fetchImpl).toHaveBeenCalledTimes(NEWS_LIST_SOURCES.crypto.length);
    for (const [url] of fetchImpl.mock.calls) {
      expect(String(url)).not.toContain('rss2json');
    }
  });

  it('returns 502 when every source fails, and serves the last good copy after that', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response(RSS, { status: 200 }));
    const cache = memoryCache();
    await handleNewsFeed(FEED_URL, cors, { fetchImpl, cache });
    const freshUrl = [...cache.store.keys()].find((key) => key.includes('/news/feed?'));
    cache.store.delete(freshUrl);

    fetchImpl.mockImplementation(async () => new Response('Just a moment...', { status: 403 }));
    const again = await handleNewsFeed(FEED_URL, cors, { fetchImpl, cache });
    expect(again.status).toBe(200);
    expect(again.headers.get('X-Cache')).toBe('STALE');
    expect((await again.json()).items.length).toBeGreaterThan(0);

    cache.store.clear();
    resetNewsFeedGate();
    const down = await handleNewsFeed(FEED_URL, cors, { fetchImpl, cache });
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: 'upstream' });
    spy.mockRestore();
  });

  it('shares one upstream wave across parallel requests', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return new Response(RSS, { status: 200 });
    });
    const cache = memoryCache();
    const pending = Promise.all([
      handleNewsFeed(FEED_URL, cors, { fetchImpl, cache }),
      handleNewsFeed(FEED_URL, cors, { fetchImpl, cache }),
    ]);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(fetchImpl).toHaveBeenCalledTimes(NEWS_LIST_SOURCES.crypto.length);
    release();
    const [a, b] = await pending;
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(NEWS_LIST_SOURCES.crypto.length);
  });

  it('routes GET /news/feed on the worker', async () => {
    const fetchMock = vi.fn(async () => new Response(RSS, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const res = await worker.fetch(new Request(FEED_URL, {
        headers: { Origin: 'https://tradeoslive.web.app' },
      }), {});
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      const body = await res.json();
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((item) => item.link.startsWith('https://'))).toBe(true);
      expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('rss2json'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
