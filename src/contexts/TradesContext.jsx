import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { subscribeToUserCollection } from '../services/firestoreService';
import { useAuth } from './AuthContext';

// ONE Firestore listener on the trades collection for the whole app.
//
// useTrades deliberately subscribes to every trade and filters by journal on
// the client, so switching journals is instant. But the subscription lived
// inside the hook, and the hook is called from five places — the dashboard, the
// journal, the mentality stats, the AI page and the exchange import — so every
// mounted consumer opened its OWN full-collection onSnapshot, and every
// navigation between them tore those down and re-created them. Firestore's
// local cache softened the cost but did not remove it.
//
// This mirrors what JournalContext already does correctly for journals: hold
// the subscription once, and let useTrades become a selector over it.

const TradesContext = createContext(null);

const SIGNED_OUT = { allTrades: [], loading: false };
const AWAITING = { allTrades: [], loading: true };
const EMPTY = { uid: null, allTrades: [], loading: true };

// A listener that errors out used to heal on the next navigation, because each
// consumer re-subscribed on mount. There is only one listener now, so a single
// failure would leave the whole app without trades until a reload.
const RETRY_MS = 5000;

export function TradesProvider({ children }) {
  const { user } = useAuth();
  // The snapshot is stamped with the uid it came from, and the exposed value is
  // derived from that. That keeps the effect free of synchronous setState and
  // guarantees one account's trades are never served to the next.
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!user) return undefined;
    const uid = user.uid;
    let retryTimer = null;

    const unsubscribe = subscribeToUserCollection(
      uid,
      'trades',
      {},
      (data) => setSnapshot({ uid, allTrades: data, loading: false }),
      (error) => {
        console.error('Firestore trades listener error:', error);
        // Only ever touch state belonging to THIS listener — a late error from a
        // previous user's listener must not stamp their uid back over the
        // current one and pin the app on "awaiting".
        setSnapshot((prev) => (prev.uid === uid ? { ...prev, loading: false } : prev));
        retryTimer = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
      }
    );

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe?.();
      // Drop the cached rows with the subscription. Without this a sign-out
      // left the previous session's trades in state, and signing back in as the
      // SAME account served them as fresh — loading:false over stale data —
      // until the new snapshot arrived.
      setSnapshot(EMPTY);
    };
  }, [user, retry]);

  const value = useMemo(() => {
    if (!user) return SIGNED_OUT;
    if (snapshot.uid !== user.uid) return AWAITING;
    return { allTrades: snapshot.allTrades, loading: snapshot.loading };
  }, [user, snapshot]);

  return <TradesContext.Provider value={value}>{children}</TradesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAllTrades() {
  const ctx = useContext(TradesContext);
  // Throw rather than hand back an empty default, matching every other context
  // here: a consumer mounted outside the provider would otherwise render a
  // permanent "no trades" state that looks like real data.
  if (!ctx) throw new Error('useAllTrades must be used within a TradesProvider');
  return ctx;
}
