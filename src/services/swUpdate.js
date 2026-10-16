// Silent service-worker update flow ("update on next open", #220).
//
// No prompt, no button: sw.js skipWaiting()s on install and clients.claim()s on
// activate. A page that was already controlled reloads once when the new worker
// takes over, so the document that just refreshed cannot keep executing the
// previous bundle (that is what left the ticker on Parqet's zest mark). A first
// visit has no previous controller and does not reload.

// A page that already had a worker keeps its old scripts until the next
// document load. controllerchange fires when the new worker claims the page
// (including the one that arrives just after a refresh). Reload once so that
// visit cannot keep painting a ticker logo from the previous bundle.
export function shouldReloadOnControllerChange({ hadController, refreshing }) {
  return !!hadController && !refreshing;
}

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!shouldReloadOnControllerChange({ hadController, refreshing })) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // A worker that installed during a PREVIOUS visit but never took over
        // (rare, since sw.js skipWaiting()s on install). Nudge it to activate
        // so this open lands on the new version rather than the one after.
        if (reg.waiting && navigator.serviceWorker.controller) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      })
      .catch(() => {});

    // Poll for a new deploy when the app regains focus (PWA resume / tab
    // switch). Installing it claims the page, and controllerchange reloads once.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r && r.update())
        .catch(() => {});
    });
  });
}
