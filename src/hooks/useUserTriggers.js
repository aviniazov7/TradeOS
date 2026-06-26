import { useState, useEffect, useMemo, useCallback } from 'react';
import { subscribeToUserSetting, setUserSetting } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import { TRIGGERS } from '../utils/constants';

/**
 * Manages the user's entry-trigger list for the backtest tracker.
 * Mirrors useUserStrategies: default triggers + custom additions,
 * with the ability to hide defaults the user doesn't use.
 */
export function useUserTriggers() {
  const { user } = useAuth();
  const [customTriggers, setCustomTriggers] = useState([]);
  const [removedDefaults, setRemovedDefaults] = useState([]);
  const [loading, setLoading] = useState(true);

  const docId = 'backtestTriggers';

  useEffect(() => {
    if (!user) { setCustomTriggers([]); setRemovedDefaults([]); setLoading(false); return; }

    const unsub = subscribeToUserSetting(user.uid, docId, (data) => {
      if (data) {
        setCustomTriggers(data.custom || []);
        setRemovedDefaults(data.removedDefaults || []);
      } else {
        setCustomTriggers([]);
        setRemovedDefaults([]);
      }
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const allTriggers = useMemo(
    () => [
      ...TRIGGERS.filter((t) => !removedDefaults.includes(t)),
      ...customTriggers.filter((t) => !TRIGGERS.includes(t)),
    ],
    [customTriggers, removedDefaults]
  );

  const save = useCallback(async (custom, removed) => {
    if (!user) return;
    await setUserSetting(user.uid, docId, {
      custom,
      removedDefaults: removed,
    });
  }, [user]);

  const addTrigger = useCallback(async (name) => {
    if (!user || !name?.trim()) return;
    const trimmed = name.trim();
    if (allTriggers.includes(trimmed)) return;
    // If it's a previously removed default, restore it
    if (TRIGGERS.includes(trimmed)) {
      await save(customTriggers, removedDefaults.filter((t) => t !== trimmed));
    } else {
      await save([...customTriggers, trimmed], removedDefaults);
    }
  }, [user, customTriggers, removedDefaults, allTriggers, save]);

  const removeTrigger = useCallback(async (name) => {
    if (!user) return;
    if (TRIGGERS.includes(name)) {
      // Hide a default trigger
      await save(customTriggers, [...removedDefaults, name]);
    } else {
      // Remove a custom trigger
      await save(customTriggers.filter((t) => t !== name), removedDefaults);
    }
  }, [user, customTriggers, removedDefaults, save]);

  return { customTriggers, allTriggers, addTrigger, removeTrigger, loading };
}
