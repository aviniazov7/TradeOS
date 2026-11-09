import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { setUserSetting, subscribeToUserSetting } from '../services/firestoreService';
import {
  CUSTOM_FIELDS_SETTING,
  normalizeCustomFieldsDoc,
} from '../utils/customTradeFields';

const EMPTY = { fields: [], seq: 0 };

// The signed-in user's field list. Signed out, the list is empty and not
// ready, so a trade save does not wipe answers that were never loaded.
export function useCustomTradeFields() {
  const { user } = useAuth();
  const [doc, setDoc] = useState(EMPTY);
  const [loadedUid, setLoadedUid] = useState(null);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const uid = user.uid;
    return subscribeToUserSetting(uid, CUSTOM_FIELDS_SETTING, (data) => {
      setDoc(normalizeCustomFieldsDoc(data));
      setLoadedUid(uid);
    }, () => setLoadedUid(uid));
  }, [user]);

  const saveDoc = useCallback(async (next) => {
    if (!user?.uid) throw new Error('no user');
    const clean = normalizeCustomFieldsDoc(next);
    await setUserSetting(user.uid, CUSTOM_FIELDS_SETTING, clean);
    setDoc(clean);
    setLoadedUid(user.uid);
    return clean;
  }, [user]);

  if (!user?.uid) return { fields: [], seq: 0, doc: EMPTY, ready: false, saveDoc };
  const ready = loadedUid === user.uid;
  return { fields: doc.fields, seq: doc.seq, doc, ready, saveDoc };
}
