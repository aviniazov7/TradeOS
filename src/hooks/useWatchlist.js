import { useState, useEffect } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/dataProvider';
import { useAuth } from '../contexts/AuthContext';

// Per-user coin watchlist — coins a trader is tracking for a potential setup.
export function useWatchlist() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setItems([]); setLoading(false); return; }
    return subscribeToUserCollection(
      user.uid,
      'watchlist',
      {},
      (data) => { setItems(data); setLoading(false); },
      (error) => { console.error('Watchlist listener error:', error); setLoading(false); }
    );
  }, [user]);

  const addItem = async (data) => {
    if (!user) return;
    await addToUserCollection(user.uid, 'watchlist', { ...data, createdAt: timestamp() });
  };
  const updateItem = async (id, data) => {
    if (!user) return;
    await updateUserDocument(user.uid, 'watchlist', id, { ...data, updatedAt: timestamp() });
  };
  const removeItem = async (id) => {
    if (!user) return;
    await deleteUserDocument(user.uid, 'watchlist', id);
  };

  return { items, loading, addItem, updateItem, removeItem };
}
