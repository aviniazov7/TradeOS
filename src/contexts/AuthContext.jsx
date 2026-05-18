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
  deleteUserProfile,
  deleteUserSubcollection,
  timestamp,
} from '../services/firestoreService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle redirect result from PWA Google Sign-In
    handleRedirectResult().catch(() => {});

    const unsubscribe = onAuthChange((firebaseUser) => {
      if (firebaseUser) {
        // Show the app immediately. Firebase already restored the session
        // from local persistence, so don't block the whole UI on a Firestore
        // round-trip — that's what made every refresh feel slow.
        setUser(firebaseUser);
        setLoading(false);

        // Ensure the user profile doc exists (create on first sign-in).
        // Runs in the background; failure is non-fatal.
        getUserProfile(firebaseUser.uid)
          .then(({ exists }) => {
            if (exists) return;
            return setUserProfile(firebaseUser.uid, {
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              email: firebaseUser.email,
              photoURL: firebaseUser.photoURL,
              createdAt: timestamp(),
              onboardingCompleted: false,
              settings: {
                defaultLeverage: 10,
                defaultRiskPercent: 1,
                baseCurrency: 'USDT',
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
            }, false);
          })
          .catch(() => {});
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return unsubscribe;
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

  const value = { user, loading, loginWithGoogle, loginWithGoogleIdToken, registerWithEmail, loginWithEmail, logout, changePassword, resetPassword, deleteAccount, isEmailUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
