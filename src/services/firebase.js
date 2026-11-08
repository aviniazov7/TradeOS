import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  GoogleAuthProvider,
  browserSessionPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { clearSharedAuthUsers } from '../utils/authTabIsolation';

// Firebase web client config is intentionally public — Google's docs are
// explicit about this. The actual security boundary is Firestore Rules
// + App Check, not the apiKey. We hardcode it as a fallback so the app
// never breaks when a deploy environment forgets to set the env vars,
// and still allow override via VITE_FIREBASE_* if needed.
const DEFAULTS = {
  apiKey: 'AIzaSyAL7ni8lEqSmd5i6BfA9P3cvlBWEtOgcQ8',
  // Same origin as the site. The Google OAuth web client allows
  // https://tradeoslive.web.app and .../__/auth/handler, so the consent
  // screen shows tradeoslive. Hosting serves /__/auth/* itself (reserved
  // namespace); the SPA rewrite does not claim those paths.
  authDomain: 'tradeoslive.web.app',
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

// One tab, one account. browserLocalPersistence writes the user to
// localStorage and applies other tabs' storage events, so a sign-in in tab B
// replaced tab A. browserSessionPersistence uses this tab's sessionStorage:
// a reload of this tab stays signed in, and another tab does not see the user.
// It does not use IndexedDB (that store hangs signInWithCustomToken in an
// iOS standalone PWA). Do not add browserLocalPersistence as a fallback —
// Firebase would migrate the shared user back and the tabs would sync again.
//
// Closing the tab ends the session. A new tab or a restarted browser starts
// signed out. That is the stay-signed-in change required for two accounts.
//
// Google popup and same-tab redirect are unchanged. The popup resolver
// already keeps redirect state in sessionStorage, and authDomain is this
// origin, so the redirect returns to the same tab.
//
// No popupRedirectResolver here. Passing it makes Firebase inject the
// same-origin /__/auth iframe (and its gapi script) during the first paint
// of /login. LoginPage warms that iframe after paint. The tap still passes
// the browserPopupRedirectResolver class into signInWithPopup and
// signInWithRedirect — Firebase rejects an instance ("Expected a class
// definition").
clearSharedAuthUsers(typeof localStorage !== 'undefined' ? localStorage : null);

export const auth = initializeAuth(app, {
  persistence: browserSessionPersistence,
});

export const googleProvider = new GoogleAuthProvider();

// Firestore lives in firebaseDb.js and is imported only after sign-in, so the
// login route does not download it. The auth emulator is the only one this
// module knows about.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

export default app;
