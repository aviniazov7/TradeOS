import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import app from './firebase';

// Persistent local cache (IndexedDB): on reload, listeners emit the
// last-known data instantly and the network syncs in the background,
// instead of every refresh blocking on a cold network fetch. Falls back
// to an in-memory cache automatically if IndexedDB is unavailable.
//
// This module is the Firestore entry. Nothing on the login route may import
// it — AuthContext loads account data only after a user is signed in.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
