import { useState, useEffect } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

// Per-user Polymarket strategies — a saved rule-set (probability band,
// liquidity/volume floors, runway, smart-money requirement) that the scan tab
// runs against the live market board.
export function usePolymarketStrategies() {
  const { user } = useAuth();
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setStrategies([]); setLoading(false); return undefined; }
    return subscribeToUserCollection(
      user.uid, 'polymarketStrategies', {},
      (data) => { setStrategies(data); setLoading(false); },
      (e) => { console.error('polymarketStrategies listener error:', e); setLoading(false); },
    );
  }, [user]);

  const addStrategy = async (data) => {
    if (!user) return;
    await addToUserCollection(user.uid, 'polymarketStrategies', { ...data, createdAt: timestamp() });
  };

  const updateStrategy = async (id, data) => {
    if (!user) return;
    await updateUserDocument(user.uid, 'polymarketStrategies', id, { ...data, updatedAt: timestamp() });
  };

  const deleteStrategy = async (id) => {
    if (!user) return;
    await deleteUserDocument(user.uid, 'polymarketStrategies', id);
  };

  return { strategies, loading, addStrategy, updateStrategy, deleteStrategy };
}
