import { useState, useEffect, useMemo, useCallback } from 'react';
import { subscribeToUserSetting, setUserSetting } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

const PROCESS_CATEGORY_PRESETS = ['דוגמת כניסה', 'ניהול עסקה', 'ניתוח שוק', 'Setup', 'יציאה', 'אסטרטגיה'];

export function useProcessCategories() {
  const { user } = useAuth();
  const [customCategories, setCustomCategories] = useState([]);
  const [removedDefaults, setRemovedDefaults] = useState([]);
  const [loading, setLoading] = useState(true);

  const docId = 'processCategories';

  useEffect(() => {
    if (!user) { setCustomCategories([]); setRemovedDefaults([]); setLoading(false); return; }

    const unsub = subscribeToUserSetting(user.uid, docId, (data) => {
      if (data) {
        setCustomCategories(data.custom || []);
        setRemovedDefaults(data.removedDefaults || []);
      } else {
        setCustomCategories([]);
        setRemovedDefaults([]);
      }
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const allCategories = useMemo(
    () => [
      ...PROCESS_CATEGORY_PRESETS.filter((c) => !removedDefaults.includes(c)),
      ...customCategories.filter((c) => !PROCESS_CATEGORY_PRESETS.includes(c)),
    ],
    [customCategories, removedDefaults]
  );

  const save = useCallback(async (custom, removed) => {
    if (!user) return;
    await setUserSetting(user.uid, docId, {
      custom,
      removedDefaults: removed,
    });
  }, [user]);

  const addCategory = useCallback(async (name) => {
    if (!user || !name?.trim()) return;
    const trimmed = name.trim();
    if (allCategories.includes(trimmed)) return;
    // If it's a previously removed default, restore it
    if (PROCESS_CATEGORY_PRESETS.includes(trimmed)) {
      await save(customCategories, removedDefaults.filter((c) => c !== trimmed));
    } else {
      await save([...customCategories, trimmed], removedDefaults);
    }
  }, [user, customCategories, removedDefaults, allCategories, save]);

  const removeCategory = useCallback(async (name) => {
    if (!user) return;
    if (PROCESS_CATEGORY_PRESETS.includes(name)) {
      // Hide a default category
      await save(customCategories, [...removedDefaults, name]);
    } else {
      // Remove a custom category
      await save(customCategories.filter((c) => c !== name), removedDefaults);
    }
  }, [user, customCategories, removedDefaults, save]);

  return { allCategories, addCategory, removeCategory, loading };
}
