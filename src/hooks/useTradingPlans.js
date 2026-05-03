import { useState, useEffect } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

export function useTradingPlans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPlans([]);
      setLoading(false);
      return;
    }

    return subscribeToUserCollection(
      user.uid,
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
  }, [user]);

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
