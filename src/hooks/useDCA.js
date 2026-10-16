import { useState, useEffect } from 'react';
import {
  subscribeToUserCollection,
  seedUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  getUserDocument,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

export function useDCA() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [dcaPlans, setDcaPlans] = useState(() => seedUserCollection(uid, 'dca').data);
  const [loading, setLoading] = useState(() => seedUserCollection(uid, 'dca').loading);

  useEffect(() => {
    if (!uid) {
      setDcaPlans([]);
      setLoading(false);
      return undefined;
    }

    const cached = seedUserCollection(uid, 'dca');
    if (!cached.loading) {
      setDcaPlans(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    return subscribeToUserCollection(
      uid,
      'dca',
      {},
      (data) => {
        setDcaPlans(data);
        setLoading(false);
      },
      (error) => {
        // Without this, a listener error (permissions/offline) would leave
        // `loading` stuck true and spin the DCA screen forever.
        console.error('DCA listener error:', error);
        setLoading(false);
      }
    );
  }, [uid]);

  const addPlan = async (data) => {
    if (!user) return;
    await addToUserCollection(user.uid, 'dca', {
      ...data,
      entries: [],
      totalInvested: 0,
      totalCoins: 0,
      avgPrice: 0,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
  };

  const addEntry = async (planId, entry) => {
    if (!user) return;
    // Read fresh from Firestore to avoid race conditions with stale state
    const plan = await getUserDocument(user.uid, 'dca', planId);
    if (!plan) return;

    const newEntries = [...(plan.entries || []), entry];
    const totalInvested = newEntries.reduce((s, e) => s + e.amount, 0);
    const totalCoins = newEntries.reduce((s, e) => s + e.coins, 0);
    const avgPrice = totalCoins > 0 ? totalInvested / totalCoins : 0;

    await updateUserDocument(user.uid, 'dca', planId, {
      entries: newEntries,
      totalInvested,
      totalCoins,
      avgPrice,
      updatedAt: timestamp(),
    });
  };

  const updatePlan = async (id, data) => {
    if (!user) return;
    await updateUserDocument(user.uid, 'dca', id, {
      ...data,
      updatedAt: timestamp(),
    });
  };

  const deletePlan = async (id) => {
    if (!user) return;
    await deleteUserDocument(user.uid, 'dca', id);
  };

  return { dcaPlans, loading, addPlan, addEntry, updatePlan, deletePlan };
}
