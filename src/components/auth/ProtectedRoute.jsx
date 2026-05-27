import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../shared/LoadingSpinner';
import OfflineScreen from '../shared/OfflineScreen';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
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

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <>
      <AnimatePresence>
        {(loading || showSplash) && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.03 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="fixed inset-0 z-[9999]"
          >
            <LoadingSpinner fullScreen />
          </motion.div>
        )}
      </AnimatePresence>
      {!loading && user && children}
    </>
  );
}
