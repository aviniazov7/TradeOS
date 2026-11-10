const CACHE_NAME = 'tradeos-v356';
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
  return path.startsWith('/exchange/') || path.startsWith('/hl/') || path.startsWith('/admin/') || path.startsWith('/push/') || path.startsWith('/coupons/') || path.startsWith('/api/');
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

// The network refetch of a document. fetch() from this worker can be
// intercepted again; path "/" and "/index.html" would otherwise look like
// another document, recurse, and the navigation would fall back to the cached
// shell on every open (stale hashes, then a chunk reload).
function isShellRefetch(request) {
  if (!request) return false;
  try {
    if (new URL(request.url).searchParams.get('__tos_net') === '1') return true;
  } catch { /* ignore */ }
  try {
    const headers = request.headers;
    if (headers && typeof headers.get === 'function' && headers.get('X-TradeOS-Shell-Refetch') === '1') return true;
  } catch { /* ignore */ }
  return false;
}
// END isShellRefetch

// Navigations, the app shell, and any HTML document. Safari PWAs sometimes
// deliver the document without mode "navigate"; treating only that mode as
// the shell left /index.html on the generic cache path. The shell refetch is
// not a document — the browser must hit the network for it.
function isDocumentRequest(request) {
  if (!request) return false;
  if (isShellRefetch(request)) return false;
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  let path = '';
  try { path = new URL(request.url).pathname; } catch { return false; }
  if (path === '/' || path === '/index.html') return true;
  const dest = request.destination || '';
  if (dest && dest !== 'document') return false;
  const accept = (request.headers && typeof request.headers.get === 'function' && request.headers.get('accept')) || '';
  return accept.includes('text/html');
}
// END isDocumentRequest

// A deleted hashed chunk is rewritten to index.html (200 text/html). Caching
// that body under the chunk URL pins the old shell's import to HTML.
function shouldRejectHtmlAsModule(request, response) {
  if (!response || !response.headers || typeof response.headers.get !== 'function') return false;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return false;
  let path = '';
  try { path = new URL(request.url).pathname; } catch { return false; }
  if (path.startsWith('/assets/')) return true;
  return /\.(js|mjs|css)$/i.test(path);
}
// END shouldRejectHtmlAsModule

// Network-first document fetch. Pass the URL string, not the navigation
// Request: Safari throws on fetch(navigateRequest) and the catch then served
// the cached index.html that still points at removed chunks. Mark the refetch
// so this worker does not treat it as another navigation.
async function networkFirstDocument(request) {
  let requestUrl = request && request.url;
  try {
    const parsed = new URL(requestUrl);
    parsed.searchParams.set('__tos_net', '1');
    requestUrl = parsed.toString();
  } catch { /* keep the raw url */ }
  try {
    const response = await fetch(requestUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'follow',
      headers: { 'X-TradeOS-Shell-Refetch': '1' },
    });
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy));
    }
    return response;
  } catch {
    const cached = await caches.match(SHELL_URL);
    if (cached) return cached;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
// END networkFirstDocument

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
        const res = await fetch(`${SHELL_URL}?__tos_net=1`, {
          cache: 'no-store',
          headers: { 'X-TradeOS-Shell-Refetch': '1' },
        });
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

// Activate — drop caches from previous builds, then take control of open
// clients so the next navigation is handled by this worker (skipWaiting
// already ran on install). Push and notification handlers live on this
// worker too; claiming does not unsubscribe them.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
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
  // Shell refetch: do not respondWith. Handling it as a document recurses
  // back into this worker and pins the visit to the cached shell.
  if (isShellRefetch(event.request)) return;

  // Documents are network-first (no-store), including / and /index.html.
  // The cached shell is only the offline fallback — serving it while online
  // is what pins Safari/PWA to a removed hashed chunk. Offline still falls
  // back to that copy so the app can boot and show OfflineScreen.
  if (isDocumentRequest(event.request)) {
    event.respondWith(networkFirstDocument(event.request));
    return;
  }

  const cacheMode = isImmutableAsset(url) ? 'default' : 'no-store';
  event.respondWith(
    fetch(event.request, { cache: cacheMode })
      .then((response) => {
        if (response && shouldRejectHtmlAsModule(event.request, response)) {
          return new Response('', { status: 404, statusText: 'Missing chunk' });
        }
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

// Only a same-origin path. A notification url of https://evil.example used to
// navigate the open PWA there. Backslashes and "//" are rejected too: the URL
// parser turns them into a different host.
function notificationTarget(raw) {
  const fallback = new URL('/', self.registration.scope).href;
  if (typeof raw !== 'string') return fallback;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes(':')) return fallback;
  let url;
  try { url = new URL(path, self.registration.scope); } catch { return fallback; }
  if (url.origin !== self.location.origin) return fallback;
  return url.href;
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification.data?.url || '/mentality');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => c.visibilityState === 'visible');
      if (client) {
        client.navigate(target);
        client.focus();
      } else {
        self.clients.openWindow(target);
      }
    })
  );
});
