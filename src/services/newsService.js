import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

// AI news digest — a single cron-prepared brief for all users (see the
// worker's "AI News Digest" section). Returns { market, updatedAt, stories }
// where each story is { headline, why, impact, category, sources[] }.
export async function fetchNewsDigest(market = 'crypto') {
  const res = await fetch(`${WORKER_BASE}/news/digest?market=${encodeURIComponent(market)}`);
  if (!res.ok) throw new Error('טעינת התקציר נכשלה');
  return res.json();
}

// The article list. rss2json sits behind a Cloudflare challenge and answers
// 403 HTML to the browser, which made every source fail together. The Worker
// fetches the RSS feeds itself (same path as the digest) and returns items.
export async function fetchNewsFeed(market = 'crypto', { signal } = {}) {
  const key = market === 'stocks' ? 'stocks' : 'crypto';
  const res = await fetch(`${WORKER_BASE}/news/feed?market=${encodeURIComponent(key)}`, { signal });
  if (!res.ok) throw new Error('טעינת החדשות נכשלה');
  const data = await res.json().catch(() => null);
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) throw new Error('טעינת החדשות נכשלה');
  return items;
}

// News -> price attribution, prepared on the cron. Returns
// { updatedAt, findings[], loudest[] }; findings carry a ready Hebrew sentence.
export async function fetchNewsImpact() {
  const res = await fetch(`${WORKER_BASE}/news/impact`);
  if (!res.ok) throw new Error('טעינת ניתוח התנועות נכשלה');
  return res.json();
}

// Batch-translate feed items to Hebrew. Returns an array aligned to the input
// (null entries = no translation, caller falls back to English), or null when
// the call as a whole failed — callers should treat both as "keep original".
export async function translateNews(items) {
  const user = getAuth().currentUser;
  if (!user || !items?.length) return null;
  try {
    const token = await user.getIdToken();
    const res = await fetch(`${WORKER_BASE}/news/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return Array.isArray(data?.items) ? data.items : null;
  } catch {
    return null;
  }
}
