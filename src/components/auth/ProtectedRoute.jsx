import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../shared/LoadingSpinner';
import OfflineScreen from '../shared/OfflineScreen';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showSplash, setShowSplash] = useState(true);
  const [offlineTimedOut, setOfflineTimedOut] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // When loading finishes, delay hiding splash for smooth exit
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowSplash(false), 300);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // Don't get stuck on the offline screen: Firebase auth restores the session
  // from local persistence and Firestore serves cached data offline, so after a
  // short grace period fall through to the cached app instead of blocking.
  useEffect(() => {
    if (isOffline && loading) {
      const t = setTimeout(() => setOfflineTimedOut(true), 2500);
      return () => clearTimeout(t);
    }
    setOfflineTimedOut(false);
  }, [isOffline, loading]);

  if (isOffline && loading && !offlineTimedOut) return <OfflineScreen />;

  // Remember where the user was headed — LoginPage honours ?redirect= (same-app
  // relative paths only) and sends them back there after signing in.
  if (!loading && !user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return (
    <>
      {(loading || showSplash) && (
        <div className="fixed inset-0 z-[9999]">
          <LoadingSpinner fullScreen />
        </div>
      )}
      {!loading && user && children}
    </>
  );
}
