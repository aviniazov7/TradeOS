import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Detect missing/placeholder env vars at module load — `initializeAuth`
// silently accepts a bad apiKey and only fails later inside an async auth
// call, leaving the user staring at a blank screen. Throwing here lets the
// React ErrorBoundary surface a clear setup message.
const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missing = REQUIRED_KEYS.filter((k) => {
  const v = firebaseConfig[k];
  return !v || typeof v !== 'string' || v.startsWith('your_');
});
if (missing.length) {
  const err = new Error(
    `Firebase configuration missing: ${missing
      .map((k) => `VITE_FIREBASE_${k.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()}`)
      .join(', ')}`
  );
  err.code = 'tradeos/firebase-config-missing';
  err.missing = missing;
  throw err;
}

const app = initializeApp(firebaseConfig);

// App Check — blocks requests not originating from the real app
// Must be initialized before auth/firestore
try {
  if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
} catch (e) {
  console.warn('App Check initialization failed:', e);
}

// iOS standalone PWA: IndexedDB hangs silently, causing signInWithCustomToken
// to never resolve. Use only localStorage to avoid the hang.
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
