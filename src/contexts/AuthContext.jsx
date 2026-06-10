import { createContext, useContext, useState, useEffect } from 'react';
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
} from '../services/authService';
import {
  getUserProfile,
  setUserProfile,
  setUserSetting,
  subscribeToUserProfile,
  deleteUserProfile,
  deleteUserSubcollection,
  touchLastActive,
  timestamp,
} from '../services/firestoreService';

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

  useEffect(() => {
    // Handle redirect result from PWA Google Sign-In
    handleRedirectResult().catch(() => {});

    // Live profile subscription so admin-side updates (e.g. plan changes) show
    // up in the user's UI within seconds. Re-bound on every auth change.
    let profileUnsub = null;

    const unsubscribe = onAuthChange((firebaseUser) => {
      // Drop any prior profile listener before opening a new one.
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }
      if (firebaseUser) {
        // Show the app immediately. Firebase already restored the session
        // from local persistence, so don't block the whole UI on a Firestore
        // round-trip — that's what made every refresh feel slow.
        setUser(firebaseUser);
        setLoading(false);

        // Load the profile doc in the background (also creates it on first
        // sign-in). Used for the `role` field that gates the admin panel.
        const defaultProfile = {
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          createdAt: timestamp(),
          lastActive: timestamp(),
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
            // Open a live subscription AFTER the initial load so future writes
            // (e.g. admin granting Premium) refresh the UI without a reload.
            profileUnsub = subscribeToUserProfile(firebaseUser.uid, (data) => {
              setProfile(data);
            });
          })
          .catch(() => {});
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      if (profileUnsub) profileUnsub();
      unsubscribe();
    };
  }, []);

  const loginWithGoogle = () => authLoginWithGoogle();

  const loginWithGoogleIdToken = (idToken) => authLoginWithGoogleIdToken(idToken);

  const registerWithEmail = (email, password, displayName) =>
    authRegisterWithEmail(email, password, displayName);

  const loginWithEmail = (email, password) => authLoginWithEmail(email, password);

  const logout = () => {
    localStorage.removeItem('tradeos_activeJournal');
    return authLogout();
  };

  const resetPassword = (email) => authResetPassword(email);

  const changePassword = (currentPassword, newPassword) =>
    authChangePassword(currentPassword, newPassword);

  const deleteAccount = async (currentPassword) => {
    const currentUser = user;
    if (!currentUser) throw new Error('No user');

    // Re-authenticate if needed
    await reauthenticate(currentPassword);

    // Delete user subcollections
    const subcollections = ['trades', 'journals', 'backtests', 'dca', 'tradingPlans', 'notes', 'strategies', 'morningJournals', 'eveningJournals', 'settings'];
    for (const sub of subcollections) {
      await deleteUserSubcollection(currentUser.uid, sub);
    }

    // Delete user doc
    await deleteUserProfile(currentUser.uid);

    // Delete auth account
    localStorage.removeItem('tradeos_activeJournal');
    await deleteAuthUser();
  };

  const isEmailUser = user?.providerData?.some((p) => p.providerId === 'password') || false;
  const isAdmin = profile?.role === 'admin';
  // Premium gate. Admins are always premium. A plan with an expiry only counts
  // while it hasn't lapsed.
  const planActive = profile?.plan === 'premium'
    && (!profile?.planExpires || new Date(profile.planExpires).getTime() > Date.now());
  const isPremium = isAdmin || planActive;
  const plan = isPremium ? 'premium' : 'free';

  const value = { user, profile, isAdmin, isPremium, plan, loading, loginWithGoogle, loginWithGoogleIdToken, registerWithEmail, loginWithEmail, logout, changePassword, resetPassword, deleteAccount, isEmailUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
