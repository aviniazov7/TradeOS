import { useState, useEffect, useMemo } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/dataProvider';
import { useAuth } from '../contexts/AuthContext';

export function useBacktests(backtestJournalId) {
  const { user } = useAuth();
  const [allBacktests, setAllBacktests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAllBacktests([]);
      setLoading(false);
      return;
    }

    return subscribeToUserCollection(
      user.uid,
      'backtests',
      {},
      (data) => {
        setAllBacktests(data);
        setLoading(false);
      },
      (error) => {
        console.error('Firestore backtests listener error:', error);
        setLoading(false); // permission/network error must not leave an eternal skeleton
      }
    );
  }, [user]);

  // Filter by journal client-side
  const backtests = useMemo(() => {
    if (!backtestJournalId) return allBacktests;
    return allBacktests.filter((b) => b.backtestJournalId === backtestJournalId);
  }, [allBacktests, backtestJournalId]);

  const addBacktest = async (data) => {
    if (!user) return;
    await addToUserCollection(user.uid, 'backtests', {
      ...data,
      backtestJournalId: backtestJournalId || null,
      createdAt: timestamp(),
    });
  };

  const updateBacktest = async (id, data) => {
    if (!user) return;
    await updateUserDocument(user.uid, 'backtests', id, {
      ...data,
      updatedAt: timestamp(),
    });
  };

  const deleteBacktest = async (id) => {
    if (!user) return;
    await deleteUserDocument(user.uid, 'backtests', id);
  };

  return { backtests, loading, addBacktest, updateBacktest, deleteBacktest };
}
