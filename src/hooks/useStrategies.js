import { useState, useEffect } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/dataProvider';
import { useAuth } from '../contexts/AuthContext';

export function useStrategies() {
  const { user } = useAuth();
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStrategies([]);
      setLoading(false);
      return;
    }

    return subscribeToUserCollection(
      user.uid,
      'strategies',
      {},
      (data) => {
        setStrategies(data);
        setLoading(false);
      },
      (error) => {
        console.error('Firestore strategies listener error:', error);
        setLoading(false); // permission/network error must not leave an eternal skeleton
      }
    );
  }, [user]);

  const addStrategy = async (data) => {
    if (!user) return;
    await addToUserCollection(user.uid, 'strategies', {
      ...data,
      isActive: true,
      createdAt: timestamp(),
    });
  };

  const updateStrategy = async (id, data) => {
    if (!user) return;
    await updateUserDocument(user.uid, 'strategies', id, data);
  };

  const deleteStrategy = async (id) => {
    if (!user) return;
    await deleteUserDocument(user.uid, 'strategies', id);
  };

  return { strategies, loading, addStrategy, updateStrategy, deleteStrategy };
}
