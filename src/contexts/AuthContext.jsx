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
// Profile + settings, plus the account-deletion wipe (all subcollections +
// leaderboard + user doc).
import {
  getUserProfile,
  setUserProfile,
  setUserSetting,
  subscribeToUserProfile,
  touchLastActive,
  timestamp,
  deleteUserProfile,
  deleteUserSubcollection,
  deleteLeaderboardEntry,
  USER_SUBCOLLECTIONS,
} from '../services/firestoreService';
import { logAccountDeletion } from '../services/pushService';

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

        // Bind the live subscription IMMEDIATELY — binding it inside the
        // getUserProfile .then() ran AFTER the next auth-change's cleanup,
        // which is exactly how the listener leaked. The generation guard
        // keeps a late snapshot from writing a stale user's profile, and the
        // error callback swallows the expected permission-denied after
        // sign-out.
        profileUnsub = subscribeToUserProfile(
          firebaseUser.uid,
          (data) => { if (gen === generation) setProfile(data); },
          () => { /* permission-denied after sign-out — expected, not an error */ }
        );

        // Load the profile doc in the background (also creates it on first
        // sign-in). Used for the `role` field that gates the admin panel.
        const defaultProfile = {
          displayName: pendingNameRef.current || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          createdAt: timestamp(),
          lastActive: timestamp(),
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
        getUserProfile(firebaseUser.uid)
          .then(({ exists, data }) => {
            // Superseded by a logout/user switch while the fetch was in
            // flight — touching state here is exactly the race we're fixing.
            if (gen !== generation) return;
            if (exists) {
              setProfile(data);
              // Stamp activity at most once an hour so the admin panel can show
              // who's active and flag churning Premium users. Throttled to
              // avoid a Firestore write on every page refresh.
              if (Date.now() - toMillis(data.lastActive) > 60 * 60 * 1000) {
                touchLastActive(firebaseUser.uid).catch(() => {});
              }
            } else {
              setProfile(defaultProfile);
              // On first sign-in: also pre-create the notifications setting so
              // the toggle defaults to ON (the user still has to grant browser
              // permission before pushes actually deliver, but the intent is
              // set).
              Promise.all([
                setUserProfile(firebaseUser.uid, defaultProfile, false),
                setUserSetting(firebaseUser.uid, 'notifications', { pushEnabled: true, tradeOpenAlerts: true }, true),
              ]).catch(() => {});
            }
          })
          .catch(() => {});
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

  const registerWithEmail = useCallback(async (email, password, displayName) => {
    pendingNameRef.current = displayName?.trim() || null;
    try {
      return await authRegisterWithEmail(email, password, displayName);
    } finally {
      pendingNameRef.current = null;
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

    // Wipe ALL user data: the shared USER_SUBCOLLECTIONS list covers every
    // subcollection the app writes (a hard-coded copy here kept orphaning
    // backtestJournals/processes/signals/watchlist), plus the PUBLIC
    // leaderboard entry — displayName + photo readable by any signed-in user,
    // which must not survive an account deletion.
    const results = await Promise.allSettled([
      ...USER_SUBCOLLECTIONS.map((sub) => deleteUserSubcollection(currentUser.uid, sub)),
      deleteLeaderboardEntry(currentUser.uid),
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
    await deleteUserProfile(currentUser.uid);

    // Audit trail (admin panel shows who deleted their account and when) —
    // must run while the ID token is still valid. Never throws.
    await logAccountDeletion({ email: currentUser.email, displayName: currentUser.displayName });

    // Delete auth account
    localStorage.removeItem('tradeos_activeJournal');
    await deleteAuthUser();
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
