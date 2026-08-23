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

const TradesContext = createContext({ allTrades: [], loading: true });

const SIGNED_OUT = { allTrades: [], loading: false };
const AWAITING = { allTrades: [], loading: true };

export function TradesProvider({ children }) {
  const { user } = useAuth();
  // Snapshot is stamped with the uid it belongs to. Deriving the exposed value
  // from that (rather than clearing state when the user changes) keeps the
  // effect free of synchronous setState AND guarantees one account's trades can
  // never be served for a moment to the next one after a soft account switch.
  const [snapshot, setSnapshot] = useState({ uid: null, allTrades: [], loading: true });

  useEffect(() => {
    if (!user) return undefined;
    const uid = user.uid;
    return subscribeToUserCollection(
      uid,
      'trades',
      {},
      (data) => setSnapshot({ uid, allTrades: data, loading: false }),
      (error) => {
        console.error('Firestore trades listener error:', error);
        setSnapshot((prev) => (prev.uid === uid ? { ...prev, loading: false } : { uid, allTrades: [], loading: false }));
      }
    );
  }, [user]);

  const value = useMemo(() => {
    if (!user) return SIGNED_OUT;
    if (snapshot.uid !== user.uid) return AWAITING;
    return { allTrades: snapshot.allTrades, loading: snapshot.loading };
  }, [user, snapshot]);

  return <TradesContext.Provider value={value}>{children}</TradesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAllTrades() {
  return useContext(TradesContext);
}
