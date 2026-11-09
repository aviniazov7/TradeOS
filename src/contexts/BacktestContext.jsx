import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  getUserProfile,
  patchUserSettings,
  getRawCollectionSnapshot,
  batchUpdateFromSnapshot,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from './AuthContext';
import {
  readStoredBacktestJournalId,
  rememberBacktestJournalId,
  resolveBacktestJournalId,
} from '../utils/backtestSelection';

const BacktestContext = createContext(null);

export function BacktestProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // Read from async writes (create journal, migration) after an account switch.
  // Updated in an effect so a late write can see the uid that is signed in now.
  const uidRef = useRef(uid);
  const migrationGenRef = useRef(0);

  const [boundUid, setBoundUid] = useState(uid);
  const [journals, setJournals] = useState([]);
  const [activeJournalId, setActiveJournalIdState] = useState(
    () => readStoredBacktestJournalId(localStorage, uid),
  );
  // Set when this account creates a journal the listener has not echoed yet.
  const [pendingJournalId, setPendingJournalId] = useState(null);
  const [loading, setLoading] = useState(Boolean(uid));
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

  // Drop the previous account before paint. A shared journal id used to stay
  // selected across the switch, and the next account's snapshot then saved
  // that foreign id over this account's pointer.
  if (uid !== boundUid) {
    setBoundUid(uid);
    setJournals([]);
    setPendingJournalId(null);
    setLoadError(false);
    setLoading(Boolean(uid));
    setActiveJournalIdState(readStoredBacktestJournalId(localStorage, uid));
  }

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    const unsub = subscribeToUserCollection(
      uid,
      'backtestJournals',
      { orderDir: 'asc' },
      (data) => {
        if (cancelled) return;
        setJournals(data);
        setLoadError(false);
        setLoading(false);
      },
      (error) => {
        if (cancelled) return;
        console.error('Backtest journals listener error:', error);
        // Keep whatever this account already loaded. A failed listen must not
        // replace the stored journal with a default or with another account.
        setLoadError(true);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  // One-time move of backtests that predate journals. Writes use `runUid`
  // (the account that started the run). Selection is applied only if that
  // account is still signed in — a late finish must not point the next account
  // at this journal.
  useEffect(() => {
    if (!uid || loading) return undefined;
    const runUid = uid;
    const gen = ++migrationGenRef.current;
    let cancelled = false;

    async function migrate() {
      try {
        const { data: userData } = await getUserProfile(runUid);
        if (cancelled || gen !== migrationGenRef.current) return;
        if (userData?.settings?.backtestMigrated) return;

        const journalsSnap = await getRawCollectionSnapshot(runUid, 'backtestJournals');
        if (cancelled || gen !== migrationGenRef.current) return;
        if (!journalsSnap.empty) {
          await patchUserSettings(runUid, { backtestMigrated: true });
          return;
        }

        const journalRef = await addToUserCollection(runUid, 'backtestJournals', {
          name: 'בקטסט ראשי',
          description: '',
          isDefault: true,
          createdAt: timestamp(),
          updatedAt: timestamp(),
        });
        if (cancelled || gen !== migrationGenRef.current) return;

        const backtestsSnap = await getRawCollectionSnapshot(runUid, 'backtests');
        if (cancelled || gen !== migrationGenRef.current) return;
        if (backtestsSnap.docs.length > 0) {
          await batchUpdateFromSnapshot(backtestsSnap.docs, (btDoc) => {
            if (!btDoc.data().backtestJournalId) {
              return { backtestJournalId: journalRef.id };
            }
            return null;
          });
          if (cancelled || gen !== migrationGenRef.current) return;
        }

        await patchUserSettings(runUid, { backtestMigrated: true });
        if (cancelled || gen !== migrationGenRef.current) return;

        setPendingJournalId(journalRef.id);
        setActiveJournalIdState(journalRef.id);
      } catch (error) {
        if (!cancelled && gen === migrationGenRef.current) {
          console.error('Backtest migration error:', error);
        }
      }
    }

    migrate();
    return () => { cancelled = true; };
  }, [uid, loading]);

  const setActiveJournalId = useCallback((id) => {
    setPendingJournalId(id || null);
    setActiveJournalIdState(id || null);
  }, []);

  const ownedIds = useMemo(() => journals.map((j) => j.id), [journals]);
  // A create has returned, and this snapshot does not contain that journal yet.
  const waitingForJournal = Boolean(
    pendingJournalId
    && pendingJournalId === activeJournalId
    && !ownedIds.includes(pendingJournalId),
  );
  const resolvedJournalId = (!uid || loading || loadError)
    ? activeJournalId
    : resolveBacktestJournalId(
      journals,
      activeJournalId,
      waitingForJournal ? pendingJournalId : null,
    );
  // Same adjustment as an account change: the stored id is not one of this
  // account's journals, so show the oldest one. Doing it here keeps the
  // listener effect from setting state again.
  if (uid && !loading && !loadError && resolvedJournalId !== activeJournalId) {
    setActiveJournalIdState(resolvedJournalId);
  }

  useEffect(() => {
    if (!uid || loading || loadError) return;
    const confirmed = ownedIds.includes(activeJournalId) ? activeJournalId : null;
    rememberBacktestJournalId(
      localStorage,
      uid,
      journals.length === 0 ? null : confirmed,
      ownedIds,
    );
  }, [uid, loading, loadError, journals, activeJournalId, ownedIds]);

  const activeJournal = useMemo(() => {
    if (!uid || loading) return null;
    const match = journals.find((j) => j.id === activeJournalId);
    if (match) return match;
    // A just-created journal is not in the snapshot yet. Don't show the
    // oldest journal's settings in its place.
    if (waitingForJournal) return null;
    return journals[0] || null;
  }, [uid, loading, journals, activeJournalId, waitingForJournal]);

  const effectiveJournalId = activeJournal?.id ?? (waitingForJournal ? activeJournalId : null);

  const addJournal = useCallback(async (data) => {
    if (!uid) throw new Error('No user');
    const writeUid = uid;
    const ref = await addToUserCollection(writeUid, 'backtestJournals', {
      ...data,
      isDefault: false,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    if (uidRef.current === writeUid) {
      setPendingJournalId(ref.id);
      setActiveJournalIdState(ref.id);
    }
    return ref.id;
  }, [uid]);

  const updateJournal = useCallback(async (journalId, data) => {
    if (!uid) throw new Error('No user');
    // The journal list is this account's loaded documents. Refusing an id that
    // is not in it stops a stale screen from writing defaults, or the previous
    // account's journal id, onto this account before the load finishes.
    if (!journals.some((j) => j.id === journalId)) {
      throw new Error('Journal is not loaded for this account');
    }
    await updateUserDocument(uid, 'backtestJournals', journalId, {
      ...data,
      updatedAt: timestamp(),
    });
  }, [uid, journals]);

  const deleteJournal = useCallback(async (journalId) => {
    if (!uid) throw new Error('No user');
    if (!journals.some((j) => j.id === journalId)) {
      throw new Error('Journal is not loaded for this account');
    }
    await deleteUserDocument(uid, 'backtestJournals', journalId);
    if (activeJournalId === journalId) {
      const remaining = journals.filter((j) => j.id !== journalId);
      setPendingJournalId(null);
      setActiveJournalIdState(remaining[0]?.id || null);
    }
  }, [uid, activeJournalId, journals]);

  const value = useMemo(() => ({
    journals,
    activeJournal,
    activeJournalId: effectiveJournalId,
    setActiveJournalId,
    addJournal,
    updateJournal,
    deleteJournal,
    loading,
  }), [journals, activeJournal, effectiveJournalId, setActiveJournalId, addJournal, updateJournal, deleteJournal, loading]);

  return (
    <BacktestContext.Provider value={value}>
      {children}
    </BacktestContext.Provider>
  );
}

export function useBacktestContext() {
  const ctx = useContext(BacktestContext);
  if (!ctx) throw new Error('useBacktestContext must be inside BacktestProvider');
  return ctx;
}
