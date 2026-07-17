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
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

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

/** Handle redirect result (call once on app init) */
export function handleRedirectResult() {
  return getRedirectResult(auth);
}

/** Sign in with Google — redirect in PWA, popup otherwise */
export function loginWithGoogle() {
  if (isStandalone) {
    return signInWithRedirect(auth, googleProvider);
  }
  return signInWithPopup(auth, googleProvider);
}

/** Register with email and password */
export async function registerWithEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred;
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

/** Reauthenticate user before destructive operations */
export async function reauthenticate(currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('No user');
  const isEmailUser = user.providerData.some((p) => p.providerId === 'password');
  if (isEmailUser && currentPassword) {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
  } else if (!isEmailUser) {
    // Google accounts: Firebase's deleteUser() demands a RECENT sign-in
    // (~5 minutes) and throws auth/requires-recent-login otherwise. Skipping
    // reauth here meant a Google user signed in longer than that could NEVER
    // delete their account — the wipe ran, then the auth deletion failed.
    await reauthenticateWithPopup(user, googleProvider);
  }
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
