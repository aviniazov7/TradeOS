// Silent service-worker update flow ("update on next open", #220).
//
// No prompt, no button: sw.js skipWaiting()s on install and clients.claim()s on
// activate, so a freshly deployed worker takes control and caches the new shell
// as soon as the browser fetches sw.js. We deliberately do NOT reload the page
// mid-session — that would interrupt a user typing a trade. The new assets are
// served the next time the app is opened/reloaded, which is exactly the
// behavior the owner chose: users on old versions update automatically on their
// next open, with zero interaction.

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

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
    // switch). This only downloads + installs the new worker in the background;
    // it never reloads the page. The fresh assets appear on the next open.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r && r.update())
        .catch(() => {});
    });
  });
}
