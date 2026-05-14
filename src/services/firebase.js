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

// Firebase web client config is intentionally public — Google's docs are
// explicit about this. The actual security boundary is Firestore Rules
// + App Check, not the apiKey. We hardcode it as a fallback so the app
// never breaks when a deploy environment forgets to set the env vars,
// and still allow override via VITE_FIREBASE_* if needed.
const DEFAULTS = {
  apiKey: 'AIzaSyAL7ni8lEqSmd5i6BfA9P3cvlBWEtOgcQ8',
  authDomain: 'tradeos-91a58.firebaseapp.com',
  projectId: 'tradeos-91a58',
  storageBucket: 'tradeos-91a58.firebasestorage.app',
  messagingSenderId: '80529278454',
  appId: '1:80529278454:web:957e19da0d1bd049ff33d7',
};

const pickEnv = (key, fallback) => {
  const v = import.meta.env[key];
  if (!v || typeof v !== 'string' || v.startsWith('your_')) return fallback;
  return v;
};

const firebaseConfig = {
  apiKey: pickEnv('VITE_FIREBASE_API_KEY', DEFAULTS.apiKey),
  authDomain: pickEnv('VITE_FIREBASE_AUTH_DOMAIN', DEFAULTS.authDomain),
  projectId: pickEnv('VITE_FIREBASE_PROJECT_ID', DEFAULTS.projectId),
  storageBucket: pickEnv('VITE_FIREBASE_STORAGE_BUCKET', DEFAULTS.storageBucket),
  messagingSenderId: pickEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', DEFAULTS.messagingSenderId),
  appId: pickEnv('VITE_FIREBASE_APP_ID', DEFAULTS.appId),
};

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
