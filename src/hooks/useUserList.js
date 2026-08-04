import { useState, useEffect, useMemo, useCallback } from 'react';
import { subscribeToUserSetting, setUserSetting } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

// Factory for the "default presets + user custom additions, with hideable
// defaults" list hooks — tags, mistakes, timeframes, triggers, process
// categories and strategies were six byte-identical copies of this shape
// (issue #216). Each of those stays a thin wrapper that maps this generic
// result to its named API, so no consumer changes.
//
// `defaults` must be a stable reference (a module-level constant) and `docId`
// a string (compute it in the wrapper for context-dependent hooks like
// strategies). Returns the raw `custom` array too — some wrappers expose it.
export function useUserList(defaults, docId) {
  const { user } = useAuth();
  const [custom, setCustom] = useState([]);
  const [removedDefaults, setRemovedDefaults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setCustom([]); setRemovedDefaults([]); setLoading(false); return; }

    const unsub = subscribeToUserSetting(user.uid, docId, (data) => {
      if (data) {
        setCustom(data.custom || []);
        setRemovedDefaults(data.removedDefaults || []);
      } else {
        setCustom([]);
        setRemovedDefaults([]);
      }
      setLoading(false);
    });

    return unsub;
  }, [user, docId]);

  const all = useMemo(
    () => [
      ...defaults.filter((x) => !removedDefaults.includes(x)),
      ...custom.filter((x) => !defaults.includes(x)),
    ],
    [defaults, custom, removedDefaults]
  );

  const save = useCallback(async (nextCustom, removed) => {
    if (!user) return;
    await setUserSetting(user.uid, docId, { custom: nextCustom, removedDefaults: removed });
  }, [user, docId]);

  const add = useCallback(async (name) => {
    if (!user || !name?.trim()) return;
    const trimmed = name.trim();
    if (all.includes(trimmed)) return;
    // Re-adding a previously hidden default just un-hides it.
    if (defaults.includes(trimmed)) {
      await save(custom, removedDefaults.filter((x) => x !== trimmed));
    } else {
      await save([...custom, trimmed], removedDefaults);
    }
  }, [user, defaults, custom, removedDefaults, all, save]);

  const remove = useCallback(async (name) => {
    if (!user) return;
    if (defaults.includes(name)) {
      // Hide a default rather than delete it, so it can be restored.
      await save(custom, [...removedDefaults, name]);
    } else {
      await save(custom.filter((x) => x !== name), removedDefaults);
    }
  }, [user, defaults, custom, removedDefaults, save]);

  return { custom, all, add, remove, loading };
}
