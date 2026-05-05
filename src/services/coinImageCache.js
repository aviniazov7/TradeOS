const CACHE_KEY = 'tradeos_coin_images';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Non-crypto assets — hosted locally in /public/icons/
const MANUAL_ICONS = {
  XAU: '/icons/xau.svg',
};

let memoryCache = null;
let fetchPromise = null;

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const { data, ts } = JSON.parse(stored);
      if (Date.now() - ts < CACHE_DURATION) {
        memoryCache = data;
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

function saveToStorage() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: memoryCache, ts: Date.now() }));
  } catch { /* ignore */ }
}

export function getCachedImage(symbol) {
  const key = symbol.toUpperCase();
  if (MANUAL_ICONS[key]) return MANUAL_ICONS[key];
  if (!memoryCache) loadFromStorage();
  return memoryCache?.[key] || null;
}

export function cacheImage(symbol, url) {
  if (!memoryCache) {
    loadFromStorage();
    if (!memoryCache) memoryCache = {};
  }
  memoryCache[symbol.toUpperCase()] = url;
  saveToStorage();
}

export function clearCachedImage(symbol) {
  if (!memoryCache) {
    loadFromStorage();
    if (!memoryCache) return;
  }
  delete memoryCache[symbol.toUpperCase()];
  saveToStorage();
}

export async function prefetchCoinImages() {
  if (memoryCache && Object.keys(memoryCache).length > 50) return memoryCache;
  if (loadFromStorage() && Object.keys(memoryCache).length > 50) return memoryCache;

  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL || '';
      const base = workerUrl
        ? `${workerUrl}/cg/coins/markets`
        : 'https://api.coingecko.com/api/v3/coins/markets';
      const params = 'vs_currency=usd&order=market_cap_desc&per_page=250';
      const [res1, res2] = await Promise.allSettled([
        fetch(`${base}?${params}&page=1`),
        fetch(`${base}?${params}&page=2`),
      ]);
      if (!memoryCache) memoryCache = {};
      for (const result of [res1, res2]) {
        if (result.status === 'fulfilled' && result.value.ok) {
          const coins = await result.value.json();
          coins.forEach((c) => {
            const img = c.image?.replace('/large/', '/small/');
            if (img) memoryCache[c.symbol.toUpperCase()] = img;
          });
        }
      }
      saveToStorage();
    } catch {
      if (!memoryCache) memoryCache = {};
    }
    fetchPromise = null;
    return memoryCache;
  })();

  return fetchPromise;
}
