const CACHE_NAME = 'tradeos-v23';
const STATIC_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
];

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
// No skipWaiting() here: a new version stays "waiting" until the user
// explicitly opts in via the in-app update prompt (SKIP_WAITING message),
// so updates never reload the app mid-use.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// Activate the waiting worker on demand (user clicked "update now").
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
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

  // Never cache navigation requests (index.html) — always go to network
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
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
