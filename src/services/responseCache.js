// Drop every Cache Storage bucket on this origin. Logout and account deletion
// call this so the service worker cannot serve the previous account's
// authenticated Worker responses (open orders, positions, fills) offline.
export async function clearResponseCaches() {
  try {
    if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return;
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch { /* private mode / unsupported */ }
}
