import { useState, useEffect, useMemo, useCallback } from 'react';
import { subscribeToUserSetting, setUserSetting } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import { STRATEGIES } from '../utils/constants';

/**
 * @param {'journal' | 'backtest'} context
 */
export function useUserStrategies(context = 'journal') {
  const { user } = useAuth();
  const [customStrategies, setCustomStrategies] = useState([]);
  const [removedDefaults, setRemovedDefaults] = useState([]);
  const [loading, setLoading] = useState(true);

  const docId = context === 'backtest' ? 'backtestStrategies' : 'journalStrategies';

  useEffect(() => {
    if (!user) { setCustomStrategies([]); setRemovedDefaults([]); setLoading(false); return; }

    const unsub = subscribeToUserSetting(user.uid, docId, (data) => {
      if (data) {
        setCustomStrategies(data.custom || []);
        setRemovedDefaults(data.removedDefaults || []);
      } else {
        setCustomStrategies([]);
        setRemovedDefaults([]);
      }
      setLoading(false);
    });

    return unsub;
  }, [user, docId]);

  const allStrategies = useMemo(
    () => [
      ...STRATEGIES.filter((s) => !removedDefaults.includes(s)),
      ...customStrategies.filter((s) => !STRATEGIES.includes(s)),
    ],
    [customStrategies, removedDefaults]
  );

  const save = useCallback(async (custom, removed) => {
    if (!user) return;
    await setUserSetting(user.uid, docId, {
      custom,
      removedDefaults: removed,
    });
  }, [user, docId]);

  const addStrategy = useCallback(async (name) => {
    if (!user || !name?.trim()) return;
    const trimmed = name.trim();
    if (allStrategies.includes(trimmed)) return;
    // If it's a previously removed default, restore it
    if (STRATEGIES.includes(trimmed)) {
      await save(customStrategies, removedDefaults.filter((s) => s !== trimmed));
    } else {
      await save([...customStrategies, trimmed], removedDefaults);
    }
  }, [user, customStrategies, removedDefaults, allStrategies, save]);

  const removeStrategy = useCallback(async (name) => {
    if (!user) return;
    if (STRATEGIES.includes(name)) {
      // Hide a default strategy
      await save(customStrategies, [...removedDefaults, name]);
    } else {
      // Remove a custom strategy
      await save(customStrategies.filter((s) => s !== name), removedDefaults);
    }
  }, [user, customStrategies, removedDefaults, save]);

  return { customStrategies, allStrategies, addStrategy, removeStrategy, loading };
}
