import { lazy } from 'react';

// After a deploy, Safari and installed PWAs can still be running an old
// index.html whose hashed chunks 404. The failure shows up as a Vite preload
// error, a rejected lazy() import, or the error boundary. Reload the document
// once per session so the fresh shell can load; a second failure stays on the
// error screen instead of looping.
export const CHUNK_RELOAD_KEY = 'tradeos-chunk-reload';
export const CHUNK_RELOAD_QUERY = '__reload';

const CHUNK_MESSAGE_SNIPPETS = [
  'Importing a module script failed',
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Loading chunk',
  'Loading CSS chunk',
];

function messageIsChunkFailure(message) {
  if (!message) return false;
  if (CHUNK_MESSAGE_SNIPPETS.some((snippet) => message.includes(snippet))) return true;
  // HTML served in place of a hashed module (hosting rewrite of a deleted chunk).
  // A bare "MIME type" mention is not a chunk failure.
  return /MIME type/i.test(message) && /text\/html/i.test(message);
}

let reloadingNow = false;
const installedTargets = new WeakSet();

export function resetChunkReloadForTests() {
  reloadingNow = false;
}

export function isChunkReloadInFlight() {
  return reloadingNow;
}

export function isChunkLoadError(error) {
  if (!error) return false;
  if (typeof error === 'string') return messageIsChunkFailure(error);
  if (error.name === 'ChunkLoadError') return true;
  return messageIsChunkFailure(`${error.message || ''}`);
}

// Vite dispatches vite:preloadError for a failed dynamic import AND for a
// stylesheet preload ("Unable to preload CSS") and for an empty prefetch.
// Only a real missing module may reload the document.
export function shouldReloadForPreloadError(event) {
  if (!event || event.payload == null || event.payload === '') return false;
  const payload = event.payload;
  const message = typeof payload === 'string' ? payload : `${payload.message || ''}`;
  if (message.includes('Unable to preload CSS')) return false;
  return isChunkLoadError(payload);
}

// window "error" also fires for <link rel="modulepreload"> and other
// subresources. Those are prefetches, not a stale dynamic import. The target
// of a runtime exception is the object the listener is attached to.
export function shouldReloadForWindowError(event, listeningTarget) {
  if (!event) return false;
  const node = event.target;
  if (node && listeningTarget && node !== listeningTarget && typeof node.tagName === 'string') return false;
  const candidate = event.error || event.message || '';
  return isChunkLoadError(candidate);
}

function storageOf(options) {
  if (options && options.storage) return options.storage;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function hasChunkReloadGuard(storage) {
  const store = storage || storageOf();
  if (!store) return false;
  try {
    return store.getItem(CHUNK_RELOAD_KEY) === '1';
  } catch {
    return false;
  }
}

function pageOrigin() {
  try {
    return window.location.origin;
  } catch {
    return 'https://tradeoslive.web.app';
  }
}

// location.reload() is not enough on iOS: the PWA can restore the same
// document from memory and request the removed chunks again. A new URL forces
// a real navigation; the query is stripped on the next boot.
export function hardReload(location = window.location) {
  const url = new URL(location.href, pageOrigin());
  url.searchParams.delete(CHUNK_RELOAD_QUERY);
  url.searchParams.set(CHUNK_RELOAD_QUERY, String(Date.now()));
  if (typeof location.replace === 'function') {
    location.replace(url.toString());
    return;
  }
  location.href = url.toString();
}

export function urlHasChunkReload(location) {
  if (!location) return false;
  try {
    return new URL(location.href, pageOrigin()).searchParams.has(CHUNK_RELOAD_QUERY);
  } catch {
    return false;
  }
}

// The reload navigation can drop sessionStorage (Safari has done this around
// location.replace). The query is the proof this document is already the
// one-shot reload, so put the guard back BEFORE the query is stripped.
export function noteChunkReloadQuery(location, storage) {
  if (!urlHasChunkReload(location)) return false;
  const store = storage || storageOf();
  if (!store) return false;
  try {
    store.setItem(CHUNK_RELOAD_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

function locationOf(options) {
  if (options && Object.prototype.hasOwnProperty.call(options, 'location')) return options.location;
  try {
    return window.location;
  } catch {
    return null;
  }
}

export function stripChunkReloadQuery(location = window.location, history = window.history) {
  let url;
  try {
    url = new URL(location.href, pageOrigin());
  } catch {
    return false;
  }
  if (!url.searchParams.has(CHUNK_RELOAD_QUERY)) return false;
  url.searchParams.delete(CHUNK_RELOAD_QUERY);
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (history && typeof history.replaceState === 'function') {
    history.replaceState(history.state, '', next);
  }
  return true;
}

export function reloadOnceForChunkError(options = {}) {
  const store = storageOf(options);
  const go = options.reload || (() => hardReload(options.location));
  if (!store) return false;
  const location = locationOf(options);
  // Already on the reloaded document. Restore the guard (the query may be
  // the only copy left) and do not navigate again.
  if (urlHasChunkReload(location)) {
    try { store.setItem(CHUNK_RELOAD_KEY, '1'); } catch { /* private mode */ }
    return false;
  }
  try {
    if (store.getItem(CHUNK_RELOAD_KEY) === '1') return false;
    store.setItem(CHUNK_RELOAD_KEY, '1');
  } catch {
    return false;
  }
  reloadingNow = true;
  try {
    go();
  } catch {
    reloadingNow = false;
    try { store.removeItem(CHUNK_RELOAD_KEY); } catch { /* storage gone */ }
    return false;
  }
  return true;
}

function hang() {
  return new Promise(() => {});
}

function settleModule(mod) {
  // Vite swallows the import error when vite:preloadError is cancelled, and
  // the promise resolves empty while the document is already navigating away.
  if (reloadingNow) return hang();
  return mod;
}

function settleError(error, options) {
  if (isChunkLoadError(error) && (reloadOnceForChunkError(options) || reloadingNow)) {
    return hang();
  }
  throw error;
}

export function loadWithChunkReload(factory, options) {
  return Promise.resolve().then(factory).then(
    (mod) => settleModule(mod),
    (error) => settleError(error, options),
  );
}

export function lazyWithChunkReload(factory) {
  return lazy(() => loadWithChunkReload(factory));
}

export function installChunkLoadRecovery(options = {}) {
  const target = options.target || window;
  if (!target || installedTargets.has(target)) return () => {};
  installedTargets.add(target);

  // Arm the guard from ?__reload= before replaceState removes it. Stripping
  // must not clear the sessionStorage flag.
  noteChunkReloadQuery(options.location, options.storage);
  stripChunkReloadQuery(options.location, options.history);

  const onPreloadError = (event) => {
    if (!shouldReloadForPreloadError(event)) return;
    if (reloadOnceForChunkError(options)) event.preventDefault();
  };
  const onRejection = (event) => {
    if (!isChunkLoadError(event && event.reason)) return;
    if (reloadOnceForChunkError(options)) event.preventDefault();
  };
  const onError = (event) => {
    if (!shouldReloadForWindowError(event, target)) return;
    if (reloadOnceForChunkError(options)) event.preventDefault();
  };

  target.addEventListener('vite:preloadError', onPreloadError);
  target.addEventListener('unhandledrejection', onRejection);
  target.addEventListener('error', onError);

  return () => {
    target.removeEventListener('vite:preloadError', onPreloadError);
    target.removeEventListener('unhandledrejection', onRejection);
    target.removeEventListener('error', onError);
    installedTargets.delete(target);
  };
}
