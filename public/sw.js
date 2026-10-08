const CACHE_NAME = 'tradeos-v307';
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
  return BYPASS_HOST_PATTERNS.some((p) => url.includes(p));
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

  event.respondWith(
    fetch(event.request)
      .then((response) => {
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
