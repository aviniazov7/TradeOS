import { useState, useEffect } from 'react';
import {
  subscribeToUserCollection,
  seedUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

export function useTradingPlans() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [plans, setPlans] = useState(() => seedUserCollection(uid, 'tradingPlans').data);
  const [loading, setLoading] = useState(() => seedUserCollection(uid, 'tradingPlans').loading);

  useEffect(() => {
    if (!uid) {
      setPlans([]);
      setLoading(false);
      return undefined;
    }

    const cached = seedUserCollection(uid, 'tradingPlans');
    if (!cached.loading) {
      setPlans(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    return subscribeToUserCollection(
      uid,
      'tradingPlans',
      {},
      (data) => {
        setPlans(data);
        setLoading(false);
      },
      (error) => {
        console.error('Firestore plans listener error:', error);
        setLoading(false);
      }
    );
  }, [uid]);

  const addPlan = async (data) => {
    if (!user) return;
    await addToUserCollection(user.uid, 'tradingPlans', {
      ...data,
      isActive: true,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
  };

  const updatePlan = async (id, data) => {
    if (!user) return;
    await updateUserDocument(user.uid, 'tradingPlans', id, {
      ...data,
      updatedAt: timestamp(),
    });
  };

  const deletePlan = async (id) => {
    if (!user) return;
    await deleteUserDocument(user.uid, 'tradingPlans', id);
  };

  return { plans, loading, addPlan, updatePlan, deletePlan };
}
