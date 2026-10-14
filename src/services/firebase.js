import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Firebase web client config is intentionally public — Google's docs are
// explicit about this. The actual security boundary is Firestore Rules
// + App Check, not the apiKey. We hardcode it as a fallback so the app
// never breaks when a deploy environment forgets to set the env vars,
// and still allow override via VITE_FIREBASE_* if needed.
const DEFAULTS = {
  apiKey: 'AIzaSyAL7ni8lEqSmd5i6BfA9P3cvlBWEtOgcQ8',
  // Same domain as the site (not firebaseapp.com): Firebase Hosting serves
  // /__/auth/handler here too, making Google OAuth same-origin so iOS Safari
  // (incl. installed PWA) doesn't block it. Requires the matching redirect
  // URI to be registered in the Google Cloud OAuth client.
  authDomain: 'tradeos-91a58.web.app',
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
//
// No popupRedirectResolver here. Passing it makes Firebase inject the
// same-origin /__/auth iframe (and its gapi script) on every page, including
// the logged-out login screen. The resolver is loaded only when the user
// actually starts a Google sign-in — see authService.loginWithGoogle.
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
});

export const googleProvider = new GoogleAuthProvider();

// Firestore lives in firebaseDb.js and is imported only after sign-in, so the
// login route does not download it. The auth emulator is the only one this
// module knows about.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

export default app;
