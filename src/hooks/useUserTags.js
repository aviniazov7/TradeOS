import { useState, useEffect, useMemo, useCallback } from 'react';
import { subscribeToUserSetting, setUserSetting } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import { TRADE_TAGS } from '../utils/constants';

export function useUserTags() {
  const { user } = useAuth();
  const [customItems, setCustomItems] = useState([]);
  const [removedDefaults, setRemovedDefaults] = useState([]);
  const [loading, setLoading] = useState(true);

  const docId = 'userTags';

  useEffect(() => {
    if (!user) { setCustomItems([]); setRemovedDefaults([]); setLoading(false); return; }

    const unsub = subscribeToUserSetting(user.uid, docId, (data) => {
      if (data) {
        setCustomItems(data.custom || []);
        setRemovedDefaults(data.removedDefaults || []);
      } else {
        setCustomItems([]);
        setRemovedDefaults([]);
      }
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const allTags = useMemo(
    () => [
      ...TRADE_TAGS.filter((t) => !removedDefaults.includes(t)),
      ...customItems.filter((t) => !TRADE_TAGS.includes(t)),
    ],
    [customItems, removedDefaults]
  );

  const save = useCallback(async (custom, removed) => {
    if (!user) return;
    await setUserSetting(user.uid, docId, { custom, removedDefaults: removed });
  }, [user]);

  const addTag = useCallback(async (name) => {
    if (!user || !name?.trim()) return;
    const trimmed = name.trim();
    if (allTags.includes(trimmed)) return;
    if (TRADE_TAGS.includes(trimmed)) {
      await save(customItems, removedDefaults.filter((t) => t !== trimmed));
    } else {
      await save([...customItems, trimmed], removedDefaults);
    }
  }, [user, customItems, removedDefaults, allTags, save]);

  const removeTag = useCallback(async (name) => {
    if (!user) return;
    if (TRADE_TAGS.includes(name)) {
      await save(customItems, [...removedDefaults, name]);
    } else {
      await save(customItems.filter((t) => t !== name), removedDefaults);
    }
  }, [user, customItems, removedDefaults, save]);

  return { allTags, addTag, removeTag, loading };
}
