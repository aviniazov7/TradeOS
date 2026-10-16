// Short-lived JSON cache for data that is fetched again on every visit
// (market stats, news, fear & greed). sessionStorage survives a reload in
// the same tab and is dropped when the tab closes. Firestore documents are
// NOT stored here — Timestamps don't round-trip through JSON.

const PREFIX = 'tradeos_cache:';

export function readSessionCache(key, maxAgeMs) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > maxAgeMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function writeSessionCache(key, data) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* private mode or quota — the live fetch still works */
  }
}
