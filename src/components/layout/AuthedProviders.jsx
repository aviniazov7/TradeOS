import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { JournalProvider } from '../../contexts/JournalContext';
import { BacktestProvider } from '../../contexts/BacktestContext';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToUserCollection } from '../../services/firestoreService';

// Home reads these on first paint. Start the listeners while the dashboard
// chunk is still downloading so the snapshot is often already cached.
const WARM_COLLECTIONS = ['trades', 'backtests', 'tradingPlans', 'dca', 'morningJournals', 'eveningJournals'];

function DashboardWarmup() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return undefined;
    const unsubs = WARM_COLLECTIONS.map((name) => subscribeToUserCollection(
      user.uid,
      name,
      {},
      () => {},
      () => {},
    ));
    return () => unsubs.forEach((unsub) => unsub());
  }, [user]);
  return null;
}

// Journals and backtests subscribe to Firestore. They wrap the signed-in
// shell only, so opening /login does not import them.
export default function AuthedProviders() {
  return (
    <JournalProvider>
      <BacktestProvider>
        <DashboardWarmup />
        <Outlet />
      </BacktestProvider>
    </JournalProvider>
  );
}
