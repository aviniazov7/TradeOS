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

export function useTradingPlans({ suspend = false } = {}) {
  const { user } = useAuth();
  const uid = user?.uid;
  const activeUid = suspend ? null : (uid || null);
  const [plans, setPlans] = useState(() => (activeUid ? seedUserCollection(activeUid, 'tradingPlans').data : []));
  const [loading, setLoading] = useState(() => (activeUid ? seedUserCollection(activeUid, 'tradingPlans').loading : false));
  const [trackedUid, setTrackedUid] = useState(activeUid);

  // Reset when the signed-in user or the demo suspension changes. This stays
  // in render so the effect below only subscribes.
  if (activeUid !== trackedUid) {
    setTrackedUid(activeUid);
    if (!activeUid) {
      setPlans([]);
      setLoading(false);
    } else {
      const cached = seedUserCollection(activeUid, 'tradingPlans');
      setPlans(cached.data);
      setLoading(cached.loading);
    }
  }

  useEffect(() => {
    if (!activeUid) return undefined;

    return subscribeToUserCollection(
      activeUid,
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
  }, [activeUid]);

  const addPlan = async (data) => {
    if (suspend || !user) return;
    await addToUserCollection(user.uid, 'tradingPlans', {
      ...data,
      isActive: true,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
  };

  const updatePlan = async (id, data) => {
    if (suspend || !user) return;
    await updateUserDocument(user.uid, 'tradingPlans', id, {
      ...data,
      updatedAt: timestamp(),
    });
  };

  const deletePlan = async (id) => {
    if (suspend || !user) return;
    await deleteUserDocument(user.uid, 'tradingPlans', id);
  };

  return { plans, loading, addPlan, updatePlan, deletePlan };
}
