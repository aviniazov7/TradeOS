import { useState, useEffect } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/dataProvider';
import { useAuth } from '../contexts/AuthContext';

export function useProcesses() {
  const { user } = useAuth();
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProcesses([]);
      setLoading(false);
      return;
    }

    return subscribeToUserCollection(
      user.uid,
      'processes',
      {},
      (data) => {
        setProcesses(data);
        setLoading(false);
      },
      (error) => {
        console.error('Firestore processes listener error:', error);
        setLoading(false);
      }
    );
  }, [user]);

  const addProcess = async (data) => {
    if (!user) return;
    await addToUserCollection(user.uid, 'processes', {
      ...data,
      createdAt: timestamp(),
    });
  };

  const updateProcess = async (id, data) => {
    if (!user) return;
    await updateUserDocument(user.uid, 'processes', id, {
      ...data,
      updatedAt: timestamp(),
    });
  };

  const deleteProcess = async (id) => {
    if (!user) return;
    await deleteUserDocument(user.uid, 'processes', id);
  };

  return { processes, loading, addProcess, updateProcess, deleteProcess };
}
