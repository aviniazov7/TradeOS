import { useState, useEffect } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

// Labeled Wyckoff setups — the owner's ground-truth dataset the scanner calibrates
// against (mark setups → the engine learns your judgment). Mirrors useSignals.
export function useWyckoffSetups() {
  const { user } = useAuth();
  const [setups, setSetups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setSetups([]); setLoading(false); return undefined; }
    return subscribeToUserCollection(
      user.uid, 'wyckoffSetups', {},
      (data) => { setSetups(data); setLoading(false); },
      (error) => { console.error('Wyckoff setups listener error:', error); setLoading(false); }
    );
  }, [user]);

  const addSetup = async (data) => {
    if (!user) return;
    await addToUserCollection(user.uid, 'wyckoffSetups', { ...data, createdAt: timestamp() });
  };

  const updateSetup = async (id, data) => {
    if (!user) return;
    await updateUserDocument(user.uid, 'wyckoffSetups', id, { ...data, updatedAt: timestamp() });
  };

  const deleteSetup = async (id) => {
    if (!user) return;
    await deleteUserDocument(user.uid, 'wyckoffSetups', id);
  };

  return { setups, loading, addSetup, updateSetup, deleteSetup };
}
