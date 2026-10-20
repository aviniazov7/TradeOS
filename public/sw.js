const CACHE_NAME = 'tradeos-v329';
const STATIC_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
];
// The app shell, cached separately so offline navigations have something to
// serve. Navigations remain network-first — this copy is only a fallback and
// is refreshed on install and after every successful online navigation.
const SHELL_URL = '/index.html';

// Domains the service worker MUST NOT touch (auth + realtime APIs)
const BYPASS_HOST_PATTERNS = [
  'googleapis.com',
  'google.com',
  'gstatic.com',
  'firebaseio.com',
  'firebaseapp.com',
  'firebasestorage.app',
  'firebasestorage.googleapis.com',
  'identitytoolkit',
  'securetoken',
  'accounts.google',
  'gsi/client',
];

function shouldBypass(url) {
  if (BYPASS_HOST_PATTERNS.some((p) => url.includes(p))) return true;
  // Firebase serves /__/auth/* and the rest of /__/ on the hosting site.
  // Do not let the app shell answer those navigations.
  try {
    const path = new URL(url).pathname;
    return path === '/__' || path.startsWith('/__/');
  } catch {
    return false;
  }
}

// Authenticated Worker responses are per account. Cache Storage is keyed by
// URL only, so caching them would replay one user's orders, fills, or
// positions for the next account on this device. Keep this in step with
// src/services/workerCachePolicy.js.
function isPrivateWorkerRequest(request) {
  let parsed;
  try { parsed = new URL(request.url); } catch { return false; }
  const host = parsed.hostname;
  const onWorker = host === 'trade-os.tradeos.workers.dev'
    || host === 'trade-os-staging.tradeos.workers.dev'
    || host.endsWith('.workers.dev');
  if (!onWorker) return false;
  const hasAuthorization = !!(request.headers && typeof request.headers.has === 'function' && request.headers.has('Authorization'));
  if (hasAuthorization) return true;
  const path = parsed.pathname;
  if (path === '/notify-settings' || path === '/ai-usage' || path === '/candles' || path === '/wallet') return true;
  return path.startsWith('/exchange/') || path.startsWith('/hl/') || path.startsWith('/admin/') || path.startsWith('/push/') || path.startsWith('/coupons/');
}
// END isPrivateWorkerRequest

// Hashed build output is immutable. Everything else (the shell, sw.js, and
// /logos) must skip the HTTP cache: Firebase keeps images for 7 days, and a
// logo URL that once 200'd as index.html stayed that way until the filename
// changed. The ticker then treated the HTML as a broken image and walked on
// to Parqet's "zest" mark.
function isImmutableAsset(url) {
  try { return new URL(url).pathname.startsWith('/assets/'); } catch { return false; }
}

function responseIsHtmlForImage(request, response) {
  const path = (() => { try { return new URL(request.url).pathname; } catch { return ''; } })();
  if (!/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(path)) return false;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  return type.includes('text/html');
}

// Install — cache static assets (NOT index.html).
// skipWaiting() so a freshly deployed worker activates immediately instead of
// getting stuck "waiting" behind an old worker until the user taps a prompt.
// Combined with clients.claim() in activate, this guarantees users pick up new
// releases on their next load — the "waiting for opt-in" design left people
// pinned to stale code when the prompt never showed. The in-app update banner
// (SKIP_WAITING message) still works for a same-session refresh.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(STATIC_ASSETS);
      // Fetch the shell fresh (no-store) so the new CACHE_NAME always pairs
      // with the HTML it shipped with. Non-fatal: if this fails the shell is
      // (re)cached by the next successful navigation below.
      try {
        const res = await fetch(SHELL_URL, { cache: 'no-store' });
        if (res.ok) await cache.put(SHELL_URL, res);
      } catch { /* offline during install */ }
    })
  );
});

// Activate the waiting worker on demand (user clicked "update now"), or
// answer a version query so the UI can tell whether the user already
// dismissed the prompt for this exact CACHE_NAME.
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ cacheName: CACHE_NAME });
  }
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (event.request.method !== 'GET') return;
  if (url.startsWith('chrome-extension')) return;
  if (shouldBypass(url)) return; // Let the browser handle auth/Firebase traffic directly
  // Do not respondWith: the browser performs the request and the worker
  // never cache.put's an authenticated body.
  if (isPrivateWorkerRequest(event.request)) return;

  // Navigations are network-first: cache: 'no-store' bypasses the browser's
  // HTTP disk cache, so a deploy is picked up immediately (stale HTML would
  // also pin stale asset hashes). Every successful response refreshes the
  // cached shell copy in the background; offline falls back to that copy —
  // the app then boots and shows its own OfflineScreen banner.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, clone));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL))
    );
    return;
  }

  const cacheMode = isImmutableAsset(url) ? 'default' : 'no-store';
  event.respondWith(
    fetch(event.request, { cache: cacheMode })
      .then((response) => {
        // Never store the SPA shell under an image URL. An <img> would fail
        // to decode it and the old ticker walked that failure to a CDN logo.
        if (response && responseIsHtmlForImage(event.request, response)) {
          return new Response('', { status: 404, statusText: 'Not an image' });
        }
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) => cached || new Response('', { status: 408, statusText: 'Offline' })
        )
      )
  );
});

// Web Push — show a notification from a server-sent push payload (works even
// when the app is closed). Payload shape: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'TradeOS';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlPath = event.notification.data?.url || '/mentality';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => c.visibilityState === 'visible');
      if (client) {
        client.navigate(urlPath);
        client.focus();
      } else {
        self.clients.openWindow(urlPath);
      }
    })
  );
});
