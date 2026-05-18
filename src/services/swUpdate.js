// Controlled service-worker update flow.
//
// The SW intentionally does NOT skipWaiting on its own, so a new version
// never reloads the app mid-use. Instead we detect the waiting worker and
// let the UI prompt the user; only when the user opts in do we activate it
// and reload exactly once.

let waitingWorker = null;
let updateCb = null;
let userTriggered = false;
let refreshing = false;

export function onUpdateAvailable(cb) {
  updateCb = cb;
  // If a waiting worker was already detected before the UI subscribed.
  if (waitingWorker) cb();
}

export function applyUpdate() {
  if (!waitingWorker) return;
  userTriggered = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        const notify = (worker) => {
          waitingWorker = worker;
          if (updateCb) updateCb();
        };

        // A new version finished installing during a previous visit.
        if (reg.waiting && navigator.serviceWorker.controller) {
          notify(reg.waiting);
        }

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            // `controller` exists only when this is an update to an already
            // running app — not the very first install.
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              notify(nw);
            }
          });
        });
      })
      .catch(() => {});

    // Reload once, but only for a user-initiated update — never on first
    // install or a natural activation (this is what caused iOS reload loops).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!userTriggered || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    // Check for a new version when the app regains focus. This only surfaces
    // the prompt — it never auto-applies or reloads.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r && r.update())
        .catch(() => {});
    });
  });
}
