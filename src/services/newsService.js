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
