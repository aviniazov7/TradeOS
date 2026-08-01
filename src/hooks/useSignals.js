import { useState, useEffect } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/dataProvider';
import { useAuth } from '../contexts/AuthContext';

export function useSignals() {
  const { user } = useAuth();
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setSignals([]); setLoading(false); return; }
    return subscribeToUserCollection(
      user.uid, 'signals', {},
      (data) => { setSignals(data); setLoading(false); },
      (error) => { console.error('Signals listener error:', error); setLoading(false); }
    );
  }, [user]);

  const addSignal = async (data) => {
    if (!user) return;
    await addToUserCollection(user.uid, 'signals', { ...data, createdAt: timestamp() });
  };

  const updateSignal = async (id, data) => {
    if (!user) return;
    await updateUserDocument(user.uid, 'signals', id, { ...data, updatedAt: timestamp() });
  };

  const deleteSignal = async (id) => {
    if (!user) return;
    await deleteUserDocument(user.uid, 'signals', id);
  };

  return { signals, loading, addSignal, updateSignal, deleteSignal };
}
