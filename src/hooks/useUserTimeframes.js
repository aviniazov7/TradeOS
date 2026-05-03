import { useState, useEffect, useMemo, useCallback } from 'react';
import { subscribeToUserSetting, setUserSetting } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import { TIMEFRAMES } from '../utils/constants';

function toMinutes(tf) {
  const num = parseFloat(tf);
  if (tf.endsWith('m')) return num;
  if (tf.endsWith('H') || tf.endsWith('h')) return num * 60;
  if (tf.endsWith('D') || tf.endsWith('d')) return num * 1440;
  if (tf.endsWith('W') || tf.endsWith('w')) return num * 10080;
  if (tf.endsWith('M')) return num * 43200;
  return Infinity;
}

export function useUserTimeframes() {
  const { user } = useAuth();
  const [customItems, setCustomItems] = useState([]);
  const [removedDefaults, setRemovedDefaults] = useState([]);
  const [loading, setLoading] = useState(true);

  const docId = 'userTimeframes';

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

  const allTimeframes = useMemo(() => {
    const combined = [
      ...TIMEFRAMES.filter((t) => !removedDefaults.includes(t)),
      ...customItems.filter((t) => !TIMEFRAMES.includes(t)),
    ];
    return combined.sort((a, b) => toMinutes(a) - toMinutes(b));
  }, [customItems, removedDefaults]);

  const save = useCallback(async (custom, removed) => {
    if (!user) return;
    await setUserSetting(user.uid, docId, { custom, removedDefaults: removed });
  }, [user]);

  const addTimeframe = useCallback(async (name) => {
    if (!user || !name?.trim()) return;
    const trimmed = name.trim();
    if (allTimeframes.includes(trimmed)) return;
    if (TIMEFRAMES.includes(trimmed)) {
      await save(customItems, removedDefaults.filter((t) => t !== trimmed));
    } else {
      await save([...customItems, trimmed], removedDefaults);
    }
  }, [user, customItems, removedDefaults, allTimeframes, save]);

  const removeTimeframe = useCallback(async (name) => {
    if (!user) return;
    if (TIMEFRAMES.includes(name)) {
      await save(customItems, [...removedDefaults, name]);
    } else {
      await save(customItems.filter((t) => t !== name), removedDefaults);
    }
  }, [user, customItems, removedDefaults, save]);

  return { allTimeframes, addTimeframe, removeTimeframe, loading };
}
