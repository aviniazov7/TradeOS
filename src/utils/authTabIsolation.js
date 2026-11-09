// Firebase's browserLocalPersistence stores the signed-in user at
// firebase:authUser:<apiKey>:<app> in localStorage and notifies every other
// tab through the storage event. That is why signing into account B in one
// tab replaced account A in the others. Session persistence does not use this
// key. Anything left here is the previous shared session; drop it so a reload
// cannot revive that user, and so an old tab still listening signs out of it.
// Journal selection and other preferences are different keys and stay.

export const SHARED_AUTH_USER_PREFIX = 'firebase:authUser:';

export function clearSharedAuthUsers(storage) {
  if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function') return;
  const shared = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(SHARED_AUTH_USER_PREFIX)) shared.push(key);
    }
  } catch {
    return;
  }
  for (const key of shared) {
    try { storage.removeItem(key); } catch { /* private mode */ }
  }
}
