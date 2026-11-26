import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { setUserSetting, subscribeToUserSetting } from '../services/firestoreService';
import {
  MORNING_ROUTINE_SETTING,
  normalizeRoutineDoc,
  storedRoutineDoc,
} from '../utils/morningRoutine';

function sameDoc(a, b) {
  if (!a || !b || a.seq !== b.seq) return false;
  if (a.items.length !== b.items.length || a.retired.length !== b.retired.length) return false;
  for (let i = 0; i < a.items.length; i += 1) {
    if (a.items[i].id !== b.items[i].id || a.items[i].label !== b.items[i].label) return false;
  }
  for (let i = 0; i < a.retired.length; i += 1) {
    if (a.retired[i].id !== b.retired[i].id || a.retired[i].label !== b.retired[i].label) return false;
  }
  return true;
}

// The signed-in trader's routine list. No document yet reads as the built-in
// six, and the first edit is what writes users/{uid}/settings/morningRoutine.
export function useMorningRoutine() {
  const { user } = useAuth();
  const [remote, setRemote] = useState(undefined);
  const [optimistic, setOptimistic] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setRemote(null);
      setOptimistic(null);
      return undefined;
    }
    setRemote(undefined);
    return subscribeToUserSetting(user.uid, MORNING_ROUTINE_SETTING, (data) => {
      setRemote(data);
    });
  }, [user]);

  const normalizedRemote = useMemo(
    () => (remote === undefined ? null : normalizeRoutineDoc(remote)),
    [remote],
  );

  useEffect(() => {
    if (!optimistic || !normalizedRemote) return;
    if (sameDoc(optimistic, normalizedRemote)) setOptimistic(null);
  }, [optimistic, normalizedRemote]);

  const shown = optimistic || normalizedRemote;
  const doc = useMemo(() => (shown ? storedRoutineDoc(shown) : null), [shown]);

  const replace = useCallback(async (next) => {
    const clean = storedRoutineDoc(next);
    setOptimistic(normalizeRoutineDoc(clean));
    if (!user) return;
    setSaving(true);
    try {
      await setUserSetting(user.uid, MORNING_ROUTINE_SETTING, clean);
    } catch (err) {
      setOptimistic(null);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [user]);

  return {
    ready: remote !== undefined,
    saving,
    items: doc?.items || [],
    retired: doc?.retired || [],
    doc,
    replace,
  };
}
