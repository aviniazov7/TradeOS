import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { planExpiresMs } from '../utils/premium';
import { APP_VERSION } from '../utils/constants';
// Firebase Auth operations (login/logout/register/reset…).
import {
  onAuthChange,
  handleRedirectResult,
  loginWithGoogle as authLoginWithGoogle,
  loginWithGoogleIdToken as authLoginWithGoogleIdToken,
  registerWithEmail as authRegisterWithEmail,
  loginWithEmail as authLoginWithEmail,
  logout as authLogout,
  resetPassword as authResetPassword,
  changePassword as authChangePassword,
  reauthenticate,
  deleteAuthUser,
  sendVerificationEmail as authSendVerificationEmail,
  refreshEmailVerified as authRefreshEmailVerified,
} from '../services/authService';

// Profile, the account wipe, and the local cache clear all touch Firestore.
// Loaded on demand once a session exists — a logged-out /login must not
// download the Firestore SDK.
let accountDataPromise;
function accountData() {
  accountDataPromise ??= import('../services/accountData');
  return accountDataPromise;
}

// Read a Firestore Timestamp / ISO / millis into epoch millis (0 if absent).
function toMillis(v) {
  if (!v) return 0;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v === 'number') return v;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Name typed on the signup form. onAuthStateChanged fires as soon as the
  // account is created — BEFORE updateProfile sets the Auth displayName — so
  // the first profile doc used to get the email prefix instead of the name.
  const pendingNameRef = useRef(null);
  // The "send me updates by email" box ticked on the signup form (opt-in,
  // unticked by default). Same timing as the name: captured when the account
  // appears, written to the profile once it exists.
  const pendingConsentRef = useRef(false);

  useEffect(() => {
    // Handle redirect result from PWA Google Sign-In
    handleRedirectResult().catch(() => {});

    // Live profile subscription so admin-side updates (e.g. plan changes) show
    // up in the user's UI within seconds. Re-bound on every auth change.
    let profileUnsub = null;
    // Every auth change invalidates the previous generation, so async work
    // that was in flight for the PREVIOUS user can never touch state after a
    // logout/user switch. Without this, user A's stale getUserProfile used to
    // bind a LEAKED listener after the switch and overwrite user B's profile
    // (wrong isAdmin/isPremium until the next snapshot).
    let generation = 0;

    const unsubscribe = onAuthChange((firebaseUser) => {
      const gen = ++generation;
      // Drop any prior profile listener before opening a new one.
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }
      if (firebaseUser) {
        // Show the app immediately. Firebase already restored the session
        // from local persistence, so don't block the whole UI on a Firestore
        // round-trip — that's what made every refresh feel slow.
        setUser(firebaseUser);
        setLoading(false);

        // Firestore arrives in its own chunk. Bind the listener as soon as
        // that chunk loads — not after getUserProfile — or a logout in
        // between leaks the previous user's snapshot. The generation guard
        // drops a late callback after a user switch.
        const signupConsent = pendingConsentRef.current === true;
        accountData().then((api) => {
          if (gen !== generation) return;
          profileUnsub = api.subscribeToUserProfile(
            firebaseUser.uid,
            (data) => { if (gen === generation) setProfile(data); },
            () => { /* permission-denied after sign-out — expected, not an error */ }
          );
          const defaultProfile = {
            displayName: pendingNameRef.current || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            createdAt: api.timestamp(),
            lastActive: api.timestamp(),
            appVersion: APP_VERSION,
            onboardingCompleted: false,
            settings: {
              defaultLeverage: 10,
              defaultRiskPercent: 1,
              baseCurrency: 'USDT',
              assetClasses: ['crypto'],
              strategies: [
                'SOS (Sign of Strength)',
                'SOW (Sign of Weakness)',
                'Trendline Break',
                'Supply & Demand',
                'Wyckoff',
                'AMD',
                'Order Block',
                'Heikin Ashi',
              ],
              favoriteCoins: ['BTC', 'ETH', 'SOL', 'AVAX', 'BNB', 'DOGE'],
            },
          };
          api.getUserProfile(firebaseUser.uid)
            .then(({ exists, data }) => {
              if (gen !== generation) return;
              if (exists) {
                setProfile(data);
                if (Date.now() - toMillis(data.lastActive) > 60 * 60 * 1000) {
                  api.touchLastActive(firebaseUser.uid).catch(() => {});
                }
              } else {
                setProfile(defaultProfile);
                Promise.all([
                  api.setUserProfile(firebaseUser.uid, defaultProfile, false),
                  api.setUserSetting(firebaseUser.uid, 'notifications', { pushEnabled: true, tradeOpenAlerts: true }, true),
                ])
                  .then(() => (signupConsent
                    ? api.setUserProfile(firebaseUser.uid, { marketingEmails: true, marketingEmailsAt: api.timestamp() })
                    : null))
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }).catch(() => {});
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      generation++; // invalidate any in-flight callbacks on unmount
      if (profileUnsub) profileUnsub();
      unsubscribe();
    };
  }, []);

  const loginWithGoogle = useCallback(() => authLoginWithGoogle(), []);

  const loginWithGoogleIdToken = useCallback((idToken) => authLoginWithGoogleIdToken(idToken), []);

  const registerWithEmail = useCallback(async (email, password, displayName, { marketingEmails = false } = {}) => {
    pendingNameRef.current = displayName?.trim() || null;
    pendingConsentRef.current = marketingEmails === true;
    try {
      return await authRegisterWithEmail(email, password, displayName);
    } finally {
      pendingNameRef.current = null;
      pendingConsentRef.current = false;
    }
  }, []);

  const loginWithEmail = useCallback((email, password) => authLoginWithEmail(email, password), []);

  const logout = useCallback(() => {
    localStorage.removeItem('tradeos_activeJournal');
    return authLogout();
  }, []);

  const resetPassword = useCallback((email) => authResetPassword(email), []);

  const changePassword = useCallback((currentPassword, newPassword) =>
    authChangePassword(currentPassword, newPassword), []);

  const deleteAccount = useCallback(async (currentPassword) => {
    const currentUser = user;
    if (!currentUser) throw new Error('No user');

    // Re-authenticate if needed
    await reauthenticate(currentPassword);

    const api = await accountData();
    // Wipe ALL user data: the shared USER_SUBCOLLECTIONS list covers every
    // subcollection the app writes (a hard-coded copy here kept orphaning
    // backtestJournals/processes/signals/watchlist), plus the PUBLIC
    // leaderboard entry — displayName + photo readable by any signed-in user,
    // which must not survive an account deletion.
    const results = await Promise.allSettled([
      ...api.USER_SUBCOLLECTIONS.map((sub) => api.deleteUserSubcollection(currentUser.uid, sub)),
      api.deleteLeaderboardEntry(currentUser.uid),
    ]);
    // Abort BEFORE deleting the auth account if any wipe failed — once the
    // auth user is gone nobody can re-authenticate to finish the cleanup, so
    // failing loudly here lets the user simply retry.
    const firstFailure = results.find((r) => r.status === 'rejected');
    if (firstFailure) {
      throw firstFailure.reason instanceof Error
        ? firstFailure.reason
        : new Error('מחיקת הנתונים נכשלה — נסה שוב');
    }

    // Delete user doc
    await api.deleteUserProfile(currentUser.uid);

    // Server-side leftovers (encrypted exchange keys, push subscriptions, the
    // admin's note, payment records, coupon markers) plus an audit entry that
    // carries only the uid — no email or name. Must run while the ID token is
    // still valid. Never throws.
    await api.logAccountDeletion();

    // Delete auth account
    await deleteAuthUser();

    // Nothing of the account stays on this device either.
    await api.clearLocalAccountData();
  }, [user]);

  const isEmailUser = user?.providerData?.some((p) => p.providerId === 'password') || false;
  // Email/password accounts that haven't clicked the verification link yet
  // (Google accounts are verified by Google). Shown as a reminder, not a gate.
  // uid confirmed verified in this session (user.reload() mutates the Firebase
  // user in place, which React can't see) — keyed by uid so a user switch resets it.
  const [verifiedUid, setVerifiedUid] = useState(null);
  const needsEmailVerification = isEmailUser && !user?.emailVerified && verifiedUid !== user?.uid;
  const resendVerification = useCallback(() => authSendVerificationEmail(), []);
  const checkEmailVerified = useCallback(async () => {
    const ok = await authRefreshEmailVerified();
    if (ok) setVerifiedUid(user?.uid ?? null);
    return ok;
  }, [user?.uid]);
  const isAdmin = profile?.role === 'admin';
  // Premium gate. Admins are always premium. A plan with an expiry only counts
  // while it hasn't lapsed. planExpires may be a Firestore Timestamp / ISO
  // string / Date — planExpiresMs() normalizes it (a raw new Date(Timestamp)
  // gave NaN and silently kept premium OFF after a coupon redeem).
  const expMs = planExpiresMs(profile?.planExpires);
  const planActive = profile?.plan === 'premium'
    && (expMs == null || expMs > Date.now());
  const isPremium = isAdmin || planActive;
  const plan = isPremium ? 'premium' : 'free';

  const value = useMemo(() => ({
    user, profile, isAdmin, isPremium, plan, loading,
    loginWithGoogle, loginWithGoogleIdToken, registerWithEmail, loginWithEmail,
    logout, changePassword, resetPassword, deleteAccount, isEmailUser,
    needsEmailVerification, resendVerification, checkEmailVerified,
  }), [user, profile, isAdmin, isPremium, plan, loading, isEmailUser,
    loginWithGoogle, loginWithGoogleIdToken, registerWithEmail, loginWithEmail,
    logout, changePassword, resetPassword, deleteAccount,
    needsEmailVerification, resendVerification, checkEmailVerified]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
