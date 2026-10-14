import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  signInWithCustomToken,
  GoogleAuthProvider,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { emailReauthMissingPassword, displayNameProblem } from '../utils/profileAccount';
import { startGoogleSignIn } from '../utils/googleSignInFlow';

/** Detect standalone PWA mode */
export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true);

/** Proxy the Google ID token through a Cloudflare Worker that calls Firebase's
 * signInWithIdp server-side and mints a custom token the client can use with
 * signInWithCustomToken (iOS does not block that endpoint).
 * Retries up to 3 times — iOS network may need a moment to recover after the
 * Google sign-in overlay closes. */
async function signInViaWorker(googleIdToken) {
  const workerUrl = import.meta.env.VITE_GOOGLE_AUTH_WORKER_URL;
  if (!workerUrl) throw new Error('VITE_GOOGLE_AUTH_WORKER_URL not set');

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: googleIdToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || `Worker error ${response.status}`);
      }
      if (!data.customToken) throw new Error('Worker returned no custom token');
      return data;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Exchange a Google ID token (from GIS) for a Firebase session.
 * On desktop/regular browser uses the Firebase SDK directly.
 * On iOS PWA standalone the SDK's signInWithIdp call is blocked by iOS;
 * we fall back to a Cloudflare Worker that mints a custom token, then call
 * signInWithCustomToken which iOS does not block. */
export async function loginWithGoogleIdToken(idToken) {
  if (!isStandalone) {
    const credential = GoogleAuthProvider.credential(idToken);
    return signInWithCredential(auth, credential);
  }

  // iOS PWA: wait for network to stabilize after GIS auth overlay closes
  await new Promise(r => setTimeout(r, 1200));

  // Try SDK first (works on some iOS versions)
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    return await signInWithCredential(auth, credential);
  } catch (err) {
    const isNetworkErr =
      err?.code === 'auth/network-request-failed' ||
      err?.code === 'auth/internal-error' ||
      /network/i.test(err?.message || '');
    if (!isNetworkErr) throw err;
  }

  // Fallback: Worker mints custom token → signInWithCustomToken (not blocked on iOS)
  const { customToken } = await signInViaWorker(idToken);
  return await signInWithCustomToken(auth, customToken);
}

/** Listen for auth state changes */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// Set only when a Google redirect is about to start. getRedirectResult loads
// the auth iframe, so a normal visit to /login must not call it.
const GOOGLE_REDIRECT_FLAG = 'tradeos-google-redirect';

// True only after the auth iframe was warmed on Firebase's cached instance of
// browserPopupRedirectResolver. signInWithPopup's third argument is that
// class — _getInstance() asserts `cls instanceof Function` and throws
// "Expected a class definition" if it receives an instance, a module
// namespace, or a Promise. Awaiting a dynamic import inside the tap is what
// made Safari drop window.open, so the class is imported statically (it does
// not load the iframe) and the iframe is warmed after first paint.
let resolverReady = false;
let warmPromise = null;

export function preloadPopupResolver() {
  if (!warmPromise) {
    warmPromise = import('@firebase/auth/internal').then(async (mod) => {
      try {
        // Same class, same module cache as signInWithPopup, so this is the
        // instance the tap will reuse. A separately `new`'d resolver is not.
        const instance = mod._getInstance(browserPopupRedirectResolver);
        if (typeof instance?._initialize === 'function') await instance._initialize(auth);
        resolverReady = true;
      } catch {
        // Leave resolverReady false. The tap redirects instead of opening a
        // popup after a warm-up that did not finish.
      }
      return browserPopupRedirectResolver;
    }).catch(() => browserPopupRedirectResolver);
  }
  return warmPromise;
}

function markGoogleRedirect() {
  try { sessionStorage.setItem(GOOGLE_REDIRECT_FLAG, '1'); } catch { /* private mode */ }
}

function withPopupResolver(run) {
  if (resolverReady) return run(browserPopupRedirectResolver);
  return preloadPopupResolver().then(run);
}

/** Handle redirect result (call once on app init). No-ops unless this tab
 *  just returned from a Google redirect, so the auth iframe stays unloaded. */
export function handleRedirectResult() {
  let pending = false;
  try { pending = sessionStorage.getItem(GOOGLE_REDIRECT_FLAG) === '1'; } catch { /* private mode */ }
  if (!pending) return Promise.resolve(null);
  return withPopupResolver((resolver) => getRedirectResult(auth, resolver))
    .finally(() => { try { sessionStorage.removeItem(GOOGLE_REDIRECT_FLAG); } catch { /* ignore */ } });
}

/** Sign in with Google — popup in a browser, redirect in a standalone PWA.
 *  The popup runs in the tap's turn when the resolver was preloaded. If it
 *  is not ready yet, this redirects instead of opening a popup after an
 *  await (Safari blocks that and the UI showed "הדפדפן חסם את חלון ההתחברות"). */
export function loginWithGoogle() {
  return startGoogleSignIn({
    standalone: isStandalone,
    resolver: resolverReady ? browserPopupRedirectResolver : null,
    popup: (resolver) => signInWithPopup(auth, googleProvider, resolver),
    redirect: (resolver) => signInWithRedirect(auth, googleProvider, resolver),
    loadResolver: preloadPopupResolver,
    markRedirect: markGoogleRedirect,
  });
}

/** Register with email and password */
export async function registerWithEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  // From here the account exists and the user is signed in, so a failure
  // below must not surface as a failed signup (it used to, as "שגיאה
  // בהתחברות"). The name also lands on the Firestore profile via AuthContext.
  if (displayName) {
    try {
      await updateProfile(cred.user, { displayName });
    } catch {
      // non-fatal: the profile doc already carries the chosen name
    }
  }
  // Ask the new user to confirm the address. Non-fatal — the in-app banner
  // offers a resend if this one didn't go out.
  try {
    await sendVerificationEmail();
  } catch {
    // ignore
  }
  return cred;
}

/** Email the signed-in user a verification link (Firebase template, Hebrew). */
export function sendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) return Promise.reject(new Error('No user'));
  auth.languageCode = 'he';
  return sendEmailVerification(user);
}

/** Re-fetch the signed-in user so emailVerified reflects a click on the link. */
export async function refreshEmailVerified() {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  return Boolean(auth.currentUser?.emailVerified);
}

/** Sign in with email and password */
export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Sign out */
export function logout() {
  return signOut(auth);
}

/** Send password reset email */
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/** Change password (requires reauthentication) */
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('No email user');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

/** Reauthenticate user before destructive operations.
 *  Email accounts must pass the current password. Skipping that used to
 *  no-op, wipe Firestore, and only then fail deleteUser with
 *  auth/requires-recent-login — the data was already gone and the dialog
 *  closed, so the failure looked silent. */
export async function reauthenticate(currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('No user');
  if (emailReauthMissingPassword(user, currentPassword)) {
    const err = new Error('Recent login required');
    err.code = 'auth/requires-recent-login';
    throw err;
  }
  const isEmailUser = user.providerData.some((p) => p.providerId === 'password');
  if (isEmailUser) {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    return;
  }
  // Google accounts: Firebase's deleteUser() demands a RECENT sign-in
  // (~5 minutes) and throws auth/requires-recent-login otherwise.
  // The popup resolver is loaded here, same as the login button — not at startup.
  await withPopupResolver((resolver) => reauthenticateWithPopup(user, googleProvider, resolver));
}

/** Rename the signed-in user. Firestore profile is updated by the caller. */
export async function updateDisplayName(displayName) {
  const user = auth.currentUser;
  if (!user) throw new Error('No user');
  const problem = displayNameProblem(displayName);
  if (problem) {
    const err = new Error(problem);
    err.code = 'auth/invalid-display-name';
    throw err;
  }
  const name = String(displayName).trim();
  await updateProfile(user, { displayName: name });
  return name;
}

/** Delete the authenticated user account */
export async function deleteAuthUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('No user');
  return deleteUser(user);
}

/** Get current authenticated user */
export function getCurrentUser() {
  return auth.currentUser;
}
