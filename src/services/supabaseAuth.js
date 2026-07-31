import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Parallel auth layer over Supabase, mirroring authService's API so the app can
// switch behind the USE_SUPABASE flag (Firestore → Supabase migration, Phase 3
// — see docs/redesign/supabase-migration-plan.md).
//
// The app expects a FIREBASE-shaped user (user.uid, user.getIdToken(),
// user.displayName, …). Supabase's user/session shape is different, so we
// normalize it into that shape here — the rest of the app stays unchanged.
//
// ⚠️ NOT wired into the live app (gated by USE_SUPABASE). WIP — validate once
// the Google provider is configured in the Supabase dashboard and the live
// users have been migrated.
// ─────────────────────────────────────────────────────────────────────────────

export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true);

// Normalize a Supabase user (+ optional session) into the Firebase-ish shape
// the app relies on. Crucially: `uid` (not `id`) and an async `getIdToken()`
// that returns the session JWT (used as the Worker Authorization bearer).
function shapeUser(user, session) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    uid: user.id,
    email: user.email || meta.email || '',
    displayName: meta.display_name || meta.full_name || meta.name || null,
    photoURL: meta.avatar_url || meta.picture || null,
    providerData: (user.identities || []).map((i) => ({ providerId: i.provider })),
    getIdToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || session?.access_token || '';
    },
    _supabase: user,
  };
}

// Cached current user, kept in sync so getCurrentUser() can stay SYNCHRONOUS
// like Firebase's auth.currentUser (several callers use it synchronously).
let _currentUser = null;
supabase.auth.getSession().then(({ data }) => {
  _currentUser = shapeUser(data?.session?.user || null, data?.session);
});
supabase.auth.onAuthStateChange((_event, session) => {
  _currentUser = shapeUser(session?.user || null, session);
});

/** Get the current authenticated user (synchronous, like Firebase). */
export function getCurrentUser() {
  return _currentUser;
}

/** Listen for auth-state changes. Returns an unsubscribe function. */
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(shapeUser(session?.user || null, session));
  });
  return () => data?.subscription?.unsubscribe?.();
}

/** Sign in with email + password. */
export async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return shapeUser(data.user, data.session);
}

/** Register with email + password (+ display name). */
export async function registerWithEmail(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: displayName ? { display_name: displayName } : {} },
  });
  if (error) throw error;
  return shapeUser(data.user, data.session);
}

/** Sign in with Google — redirects to Google then back to the app origin. */
export function loginWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
  });
}

/** Exchange a Google ID token (from GIS) for a Supabase session — the
 *  equivalent of Firebase's loginWithGoogleIdToken (used by the popup flow). */
export async function loginWithGoogleIdToken(idToken) {
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  return shapeUser(data.user, data.session);
}

/** Firebase-parity no-op: Supabase auto-detects the OAuth session from the URL
 *  (detectSessionInUrl in the client config), so there's nothing to handle. */
export function handleRedirectResult() {
  return Promise.resolve(null);
}

/** Firebase-parity no-op: Supabase doesn't use password reauth the same way,
 *  and account deletion runs server-side — so the shared deleteAccount flow
 *  just resolves here. */
export function reauthenticate() {
  return Promise.resolve();
}

/** Deleting the auth user needs the service-role key → must run in the Worker /
 *  Edge Function (Phase 6). The client cannot self-delete in Supabase. */
export function deleteAuthUser() {
  return Promise.reject(new Error('מחיקת חשבון ב-Supabase תטופל בצד השרת (טרם מומש)'));
}

/** Sign out. */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Send a password-reset email. */
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

/** Change the signed-in user's password. Same (currentPassword, newPassword)
 *  signature as the Firebase version for facade parity — Supabase updates the
 *  password within the active session and doesn't need the current one. */
export async function changePassword(_currentPassword, newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// NOTE: deleting the auth user (Firebase's deleteAuthUser) requires the
// service-role key and must run server-side (Worker / Edge Function), never
// from the client. Handled in the Worker rewrite (Phase 6), not here.
