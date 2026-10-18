import { clearLocalFirestoreCache } from './firestoreService';
import { clearResponseCaches } from './responseCache';

/**
 * Remove everything the app keeps on this device for the signed-in account:
 * Firestore's offline cache, local and session storage (preferences, drafts,
 * cached exchange markers). Each step is best-effort — a blocked IndexedDB must
 * not stop the rest. Firestore is left terminated, so reload afterwards.
 */
export async function clearLocalAccountData() {
  try { await clearLocalFirestoreCache(); } catch { /* blocked / unsupported */ }
  try { await clearResponseCaches(); } catch { /* private mode / unsupported */ }
  try { localStorage.clear(); } catch { /* private mode */ }
  try { sessionStorage.clear(); } catch { /* private mode */ }
}
