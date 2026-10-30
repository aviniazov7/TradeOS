// Silent service-worker update flow ("update on next open", #220).
//
// sw.js calls skipWaiting() on install and clients.claim() on activate, so a
// freshly deployed worker takes over without a prompt. That takeover must not
// reload the page. Safari reports a controller change for an already-controlled
// document whenever the worker activates — including when sw.js did not
// change — and an in-memory "already refreshing" flag dies with the document,
// so reloading from this module ran on every visit.
//
// A missing hashed chunk reloads once through chunkReload. A normal open,
// a repeated open, and a worker activation do not.

// Activation is not a stale chunk. `hadController`, `refreshing`, and
// `scriptChanged` describe the visit; none of them is allowed to reload.
export function shouldReloadOnControllerChange({
  hadController = false,
  refreshing = false,
  scriptChanged = false,
} = {}) {
  void hadController;
  void refreshing;
  void scriptChanged;
  return false;
}

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    // Stable URL. A cache-busting query would be a different script every
    // load, so skipWaiting() would activate a new worker on every visit.
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // A worker that installed during a PREVIOUS visit but never took over
        // (rare, since sw.js skipWaiting()s on install). Nudge it to activate
        // so this open is controlled by the new version. Do not reload.
        if (reg.waiting && navigator.serviceWorker.controller) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      })
      .catch(() => {});

    // Poll for a new deploy when the app regains focus (PWA resume / tab
    // switch). Installing it claims the page and does not reload.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r && r.update())
        .catch(() => {});
    });
  });
}
