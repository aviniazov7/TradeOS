// Controlled service-worker update flow.
//
// The SW intentionally does NOT skipWaiting on its own, so a new version
// never reloads the app mid-use. Instead we detect the waiting worker and
// let the UI prompt the user; only when the user opts in do we activate it
// and reload exactly once.

let waitingWorker = null;
let waitingVersion = null;
let updateCb = null;
let userTriggered = false;
let refreshing = false;

// Persist which CACHE_NAME the user already dismissed, so the prompt
// doesn't re-surface for the same version on every focus/reload. A new
// deploy bumps CACHE_NAME, won't match the stored value, and the prompt
// shows again exactly once.
const DISMISSED_KEY = 'sw:dismissedVersion';

function getDismissedVersion() {
  try { return localStorage.getItem(DISMISSED_KEY); } catch { return null; }
}

function setDismissedVersion(v) {
  try { localStorage.setItem(DISMISSED_KEY, v); } catch {}
}

function askVersion(worker) {
  return new Promise((resolve) => {
    if (!worker) return resolve(null);
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data && e.data.cacheName ? e.data.cacheName : null);
    };
    try { worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]); }
    catch { clearTimeout(timer); resolve(null); }
  });
}

async function notifyIfNew(worker) {
  waitingWorker = worker;
  waitingVersion = await askVersion(worker);
  if (waitingVersion && getDismissedVersion() === waitingVersion) return;
  if (updateCb) updateCb();
}

export function onUpdateAvailable(cb) {
  updateCb = cb;
  if (waitingWorker && !(waitingVersion && getDismissedVersion() === waitingVersion)) {
    cb();
  }
}

export function applyUpdate() {
  if (!waitingWorker) return;
  userTriggered = true;
  // Mark this version handled so the prompt never re-surfaces for it after the
  // reload. Without this, if a waiting worker for the same CACHE_NAME was still
  // detected on the reloaded page, the banner came back. A genuinely newer
  // deploy bumps CACHE_NAME, so it will still prompt for real updates.
  if (waitingVersion) setDismissedVersion(waitingVersion);
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  // Fallback: Safari does not always fire `controllerchange` after skipWaiting,
  // which left the button stuck spinning and the banner never dismissed. Force
  // the one-time reload if the controllerchange handler hasn't already done it.
  setTimeout(() => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  }, 2000);
}

export function dismissUpdate() {
  if (waitingVersion) setDismissedVersion(waitingVersion);
}

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // A new version finished installing during a previous visit.
        if (reg.waiting && navigator.serviceWorker.controller) {
          notifyIfNew(reg.waiting);
        }

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            // `controller` exists only when this is an update to an already
            // running app — not the very first install.
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              notifyIfNew(nw);
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
