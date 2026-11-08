import { useState, useEffect, useMemo } from 'react';
import {
  subscribeToUserCollection,
  seedUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

export function useBacktests(backtestJournalId) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [seenUid, setSeenUid] = useState(uid);
  const [allBacktests, setAllBacktests] = useState(() => seedUserCollection(uid, 'backtests').data);
  const [loading, setLoading] = useState(() => seedUserCollection(uid, 'backtests').loading);

  // Clear the previous account before paint. The listener below is per uid;
  // until it runs, state would still be the other account's trades.
  if (uid !== seenUid) {
    const seeded = uid ? seedUserCollection(uid, 'backtests') : { data: [], loading: false };
    setSeenUid(uid);
    setAllBacktests(seeded.data);
    setLoading(seeded.loading);
  }

  useEffect(() => {
    // The signed-out / account-switch state is applied during render above.
    // This effect only subscribes; snapshots land in the listener callback.
    if (!uid) return undefined;

    let cancelled = false;
    const unsub = subscribeToUserCollection(
      uid,
      'backtests',
      {},
      (data) => {
        if (cancelled) return;
        setAllBacktests(data);
        setLoading(false);
      },
      (error) => {
        if (cancelled) return;
        console.error('Firestore backtests listener error:', error);
        setLoading(false); // permission/network error must not leave an eternal skeleton
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  // Filter by journal client-side. No journal id means "every journal" — the
  // dashboard reads the account that way. It does not mean "write a trade
  // with no journal", which would vanish once a journal is selected.
  const backtests = useMemo(() => {
    if (!backtestJournalId) return allBacktests;
    return allBacktests.filter((b) => b.backtestJournalId === backtestJournalId);
  }, [allBacktests, backtestJournalId]);

  const addBacktest = async (data) => {
    if (!user?.uid) throw new Error('No user');
    if (!backtestJournalId) throw new Error('No journal');
    await addToUserCollection(user.uid, 'backtests', {
      ...data,
      backtestJournalId,
      createdAt: timestamp(),
    });
  };

  const updateBacktest = async (id, data) => {
    if (!user?.uid) throw new Error('No user');
    await updateUserDocument(user.uid, 'backtests', id, {
      ...data,
      updatedAt: timestamp(),
    });
  };

  const deleteBacktest = async (id) => {
    if (!user?.uid) throw new Error('No user');
    await deleteUserDocument(user.uid, 'backtests', id);
  };

  return { backtests, loading, addBacktest, updateBacktest, deleteBacktest };
}
