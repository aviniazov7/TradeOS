// Article list for the news page. The browser used to call api.rss2json.com
// directly; that host now answers with a Cloudflare challenge (HTTP 403 HTML),
// so every source failed and the list showed the permanent error state.
// The digest and the "why it moved" panel already pull these RSS feeds from
// the Worker, where they succeed. This module does the same for the full list.
import { decodeHtmlEntities } from '../src/utils/htmlEntities.js';

// Feeds the AI digest and the price-attribution fallback already trust.
// Kept as its own list so a richer article-list source set cannot change
// which headlines the digest sends to the model.
export const NEWS_FEEDS = {
  crypto: [
    { key: 'cointelegraph', label: 'CoinTelegraph', rss: 'https://cointelegraph.com/rss' },
    { key: 'coindesk', label: 'CoinDesk', rss: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { key: 'decrypt', label: 'Decrypt', rss: 'https://decrypt.co/feed' },
    { key: 'theblock', label: 'The Block', rss: 'https://www.theblock.co/rss.xml' },
    { key: 'beincrypto', label: 'BeInCrypto', rss: 'https://beincrypto.com/feed/' },
    { key: 'cryptoslate', label: 'CryptoSlate', rss: 'https://cryptoslate.com/feed/' },
  ],
  stocks: [
    { key: 'yahoofinance', label: 'Yahoo Finance', rss: 'https://finance.yahoo.com/news/rssindex' },
    { key: 'marketwatch', label: 'MarketWatch', rss: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
    { key: 'cnbc', label: 'CNBC', rss: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
    { key: 'investing', label: 'Investing.com', rss: 'https://www.investing.com/rss/news_25.rss' },
    { key: 'nasdaq', label: 'Nasdaq', rss: 'https://www.nasdaq.com/feed/rssoutbound?category=Markets' },
  ],
};

// The on-screen list also includes the two outlets the page showed before the
// rss2json outage. Digest stays on NEWS_FEEDS so its prompt input is unchanged.
const LIST_EXTRAS = {
  crypto: [
    { key: 'bitcoinmagazine', label: 'Bitcoin Magazine', rss: 'https://bitcoinmagazine.com/.rss/full/' },
    { key: 'utoday', label: 'U.Today', rss: 'https://u.today/rss' },
  ],
};

export const NEWS_LIST_SOURCES = {
  crypto: [
    NEWS_FEEDS.crypto[0],
    NEWS_FEEDS.crypto[1],
    NEWS_FEEDS.crypto[2],
    LIST_EXTRAS.crypto[0],
    NEWS_FEEDS.crypto[3],
    NEWS_FEEDS.crypto[4],
    NEWS_FEEDS.crypto[5],
    LIST_EXTRAS.crypto[1],
  ],
  stocks: NEWS_FEEDS.stocks,
};

const DIGEST_ITEM_LIMIT = 20;
const FEED_ITEM_LIMIT = 30;
const PER_SOURCE_LIMIT = 15;
const FEED_XML_CAP = 1_000_000;
const FRESH_TTL = 180;
const STALE_TTL = 60 * 60;

// Feed links end up as <a href> / <img src> for every user, so a compromised
// feed must not be able to smuggle a javascript: or data: URL through.
const NEWS_LINK_RE = /^https?:\/\//i;

export function rssTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  const text = m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(text).trim();
}

function openTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>`, 'i'));
  return m ? m[0] : '';
}

function attr(tag, name) {
  if (!tag) return '';
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (!m) return '';
  return decodeHtmlEntities(m[2] ?? m[3] ?? '').trim();
}

function httpUrl(value) {
  const url = String(value || '').trim();
  return NEWS_LINK_RE.test(url) ? url : '';
}

function thumbnailFrom(block) {
  const tags = [
    openTag(block, 'media:content'),
    openTag(block, 'media:thumbnail'),
    openTag(block, 'enclosure'),
  ];
  for (const tag of tags) {
    if (!tag) continue;
    const type = attr(tag, 'type');
    const medium = attr(tag, 'medium');
    if (type && !/^image\//i.test(type)) continue;
    if (!type && medium && medium.toLowerCase() !== 'image') continue;
    const url = httpUrl(attr(tag, 'url'));
    if (url) return url;
  }
  return httpUrl(attr(openTag(block, 'img'), 'src'));
}

export function plainDescription(block) {
  const raw = rssTag(block, 'description') || rssTag(block, 'content:encoded') || rssTag(block, 'summary');
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s*The post [\s\S]*$/i, '')
    .replace(/\s*This post [\s\S]*first appeared on[\s\S]*$/i, '')
    .trim()
    .slice(0, 280);
}

function pushItem(items, block, source, { atom = false, rich = false } = {}) {
  const title = rssTag(block, 'title');
  let link = '';
  let pubDate = '';
  if (atom) {
    const linkM = block.match(/<link[^>]*href="([^"]+)"/i);
    link = linkM ? linkM[1].replace(/&amp;/g, '&') : '';
    pubDate = rssTag(block, 'published') || rssTag(block, 'updated');
  } else {
    link = rssTag(block, 'link');
    pubDate = rssTag(block, 'pubDate') || rssTag(block, 'dc:date');
  }
  if (!title || !NEWS_LINK_RE.test(link)) return;
  const item = {
    title,
    link,
    pubDate,
    sourceKey: source.key,
    sourceLabel: source.label,
  };
  if (rich) {
    item.description = plainDescription(block);
    item.thumbnail = thumbnailFrom(block);
    item.author = (rssTag(block, 'dc:creator') || rssTag(block, 'author')).slice(0, 80);
  }
  items.push(item);
}

function parseBlocks(xml, source, { limit, rich }) {
  const items = [];
  const rssBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of rssBlocks.slice(0, limit)) pushItem(items, block, source, { rich });
  if (items.length) return items;
  // Atom fallback (<entry> + <link href="..."/>) so a feed that switches
  // format degrades gracefully instead of vanishing.
  const atomBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of atomBlocks.slice(0, limit)) pushItem(items, block, source, { atom: true, rich });
  return items;
}

// Digest shape: title, link, pubDate, source. Limit stays 20 so the model
// input does not grow just because the article list reads more of the feed.
export function parseRssItems(xml, source) {
  return parseBlocks(String(xml || ''), source, { limit: DIGEST_ITEM_LIMIT, rich: false });
}

export function parseFeedArticles(xml, source) {
  return parseBlocks(String(xml || ''), source, { limit: FEED_ITEM_LIMIT, rich: true });
}

function timeOf(item) {
  const t = Date.parse(item?.pubDate);
  return Number.isFinite(t) ? t : -Infinity;
}

// Keep each outlet in the mix (a prolific feed must not crowd the others out),
// then order the combined list newest-first. The same URL keeps its newest copy.
export function mergeNewsArticles(groups, perSource = PER_SOURCE_LIMIT) {
  const capped = groups.map((group) => (
    [...group].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, perSource)
  ));
  const seen = new Set();
  const items = [];
  for (const item of capped.flat().sort((a, b) => timeOf(b) - timeOf(a))) {
    if (!item?.link || seen.has(item.link)) continue;
    seen.add(item.link);
    items.push(item);
  }
  return items;
}

const inflight = new Map();

export function resetNewsFeedGate() {
  inflight.clear();
}

export async function collectNewsFeed(market, fetchImpl = fetch) {
  const sources = NEWS_LIST_SOURCES[market] || [];
  const results = await Promise.allSettled(sources.map(async (source) => {
    const r = await fetchImpl(source.rss, {
      headers: {
        'User-Agent': 'Mozilla/5.0 TradeOS',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    if (!r.ok) throw new Error(`${source.key} ${r.status}`);
    const xml = (await r.text()).slice(0, FEED_XML_CAP);
    return parseFeedArticles(xml, source);
  }));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    console.error('news feed sources failed:', failed.map((r) => String(r.reason?.message || r.reason)).join('; '));
  }
  const items = mergeNewsArticles(
    results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
  );
  return { market, updatedAt: Date.now(), items };
}

function loadMarket(market, fetchImpl) {
  const pending = inflight.get(market);
  if (pending) return pending;
  const job = collectNewsFeed(market, fetchImpl).finally(() => {
    if (inflight.get(market) === job) inflight.delete(market);
  });
  inflight.set(market, job);
  return job;
}

function freshKey(market) {
  return new Request(`https://cache.tradeos.internal/news/feed?market=${market}&v=1`);
}
function staleKey(market) {
  return new Request(`https://cache.tradeos.internal/news/feed-stale?market=${market}&v=1`);
}

async function readCache(cache, key) {
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    const data = await hit.json();
    if (!data || !Array.isArray(data.items) || data.items.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeCache(cache, key, payload, maxAge) {
  if (!cache) return;
  try {
    await cache.put(key, new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${maxAge}`,
      },
    }));
  } catch { /* cache put is best-effort */ }
}

function feedResponse(body, cors, extra, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      ...extra,
    },
  });
}

export async function handleNewsFeed(requestUrl, cors, opts = {}) {
  const market = new URL(requestUrl).searchParams.get('market') === 'stocks' ? 'stocks' : 'crypto';
  const fetchImpl = opts.fetchImpl || fetch;
  const cache = opts.cache;
  const fresh = await readCache(cache, freshKey(market));
  if (fresh) {
    return feedResponse(fresh, cors, { 'X-Cache': 'HIT', 'Cache-Control': `public, max-age=${FRESH_TTL}` });
  }

  let payload = null;
  try {
    payload = await loadMarket(market, fetchImpl);
  } catch (err) {
    console.error('news feed failed:', err);
  }

  if (payload?.items?.length) {
    await writeCache(cache, freshKey(market), payload, FRESH_TTL);
    await writeCache(cache, staleKey(market), payload, STALE_TTL);
    return feedResponse(payload, cors, { 'X-Cache': 'MISS', 'Cache-Control': `public, max-age=${FRESH_TTL}` });
  }

  const stale = await readCache(cache, staleKey(market));
  if (stale) {
    return feedResponse(stale, cors, { 'X-Cache': 'STALE', 'Cache-Control': 'public, max-age=60' });
  }

  return feedResponse(
    { error: 'upstream' },
    cors,
    { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
    502,
  );
}
