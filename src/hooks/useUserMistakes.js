import { useState, useEffect, useMemo, useCallback } from 'react';
import { subscribeToUserSetting, setUserSetting } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import { MISTAKES } from '../utils/constants';

export function useUserMistakes() {
  const { user } = useAuth();
  const [customItems, setCustomItems] = useState([]);
  const [removedDefaults, setRemovedDefaults] = useState([]);
  const [loading, setLoading] = useState(true);

  const docId = 'userMistakes';

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

  const allMistakes = useMemo(
    () => [
      ...MISTAKES.filter((m) => !removedDefaults.includes(m)),
      ...customItems.filter((m) => !MISTAKES.includes(m)),
    ],
    [customItems, removedDefaults]
  );

  const save = useCallback(async (custom, removed) => {
    if (!user) return;
    await setUserSetting(user.uid, docId, { custom, removedDefaults: removed });
  }, [user]);

  const addMistake = useCallback(async (name) => {
    if (!user || !name?.trim()) return;
    const trimmed = name.trim();
    if (allMistakes.includes(trimmed)) return;
    if (MISTAKES.includes(trimmed)) {
      await save(customItems, removedDefaults.filter((m) => m !== trimmed));
    } else {
      await save([...customItems, trimmed], removedDefaults);
    }
  }, [user, customItems, removedDefaults, allMistakes, save]);

  const removeMistake = useCallback(async (name) => {
    if (!user) return;
    if (MISTAKES.includes(name)) {
      await save(customItems, [...removedDefaults, name]);
    } else {
      await save(customItems.filter((m) => m !== name), removedDefaults);
    }
  }, [user, customItems, removedDefaults, save]);

  return { allMistakes, addMistake, removeMistake, loading };
}
