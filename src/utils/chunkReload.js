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
  'MIME type',
];

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
  if (typeof error === 'string') {
    return CHUNK_MESSAGE_SNIPPETS.some((snippet) => error.includes(snippet));
  }
  if (error.name === 'ChunkLoadError') return true;
  const message = `${error.message || ''}`;
  return CHUNK_MESSAGE_SNIPPETS.some((snippet) => message.includes(snippet));
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

  stripChunkReloadQuery(options.location, options.history);

  const onPreloadError = (event) => {
    if (reloadOnceForChunkError(options)) event.preventDefault();
  };
  const onRejection = (event) => {
    if (!isChunkLoadError(event && event.reason)) return;
    if (reloadOnceForChunkError(options)) event.preventDefault();
  };
  const onError = (event) => {
    const candidate = (event && (event.error || event.message)) || '';
    if (!isChunkLoadError(candidate)) return;
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
