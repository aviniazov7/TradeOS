import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  subscribeToUserCollection,
  seedUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  getUserProfile,
  patchUserSettings,
  getRawCollectionSnapshot,
  batchUpdateFromSnapshot,
  batchDeleteByFilter,
  timestamp,
} from '../services/firestoreService';
import { deleteImagesForTrades } from '../services/tradeImageService';
import { useAuth } from './AuthContext';
import { FREE_LIMITS } from '../utils/constants';

const JournalContext = createContext(null);

const JOURNAL_QUERY = { orderDir: 'asc' };

export function JournalProvider({ children }) {
  const { user, isPremium } = useAuth();
  const uid = user?.uid;
  const [journals, setJournals] = useState(() => seedUserCollection(uid, 'journals', JOURNAL_QUERY).data);
  const [activeJournalId, setActiveJournalId] = useState(
    () => localStorage.getItem('tradeos_activeJournal') || null
  );
  const [loading, setLoading] = useState(() => seedUserCollection(uid, 'journals', JOURNAL_QUERY).loading);

  // Real-time listener for journals
  useEffect(() => {
    if (!uid) {
      setJournals([]);
      setLoading(false);
      return undefined;
    }

    const cached = seedUserCollection(uid, 'journals', JOURNAL_QUERY);
    if (!cached.loading) {
      setJournals(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    return subscribeToUserCollection(
      uid,
      'journals',
      JOURNAL_QUERY,
      (data) => {
        setJournals(data);
        setLoading(false);
      },
      (error) => {
        console.error('Journals listener error:', error);
        setLoading(false);
      }
    );
  }, [uid]);

  // Auto-migration for existing users
  const migratingRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  useEffect(() => {
    if (!user || loading) return;

    async function migrate() {
      if (migratingRef.current) return;
      migratingRef.current = true;
      try {
        const { data: userData } = await getUserProfile(user.uid);
        if (cancelledRef.current) return;
        if (userData?.settings?.journalMigrated) return;

        const journalsSnap = await getRawCollectionSnapshot(user.uid, 'journals');
        if (cancelledRef.current) return;
        if (!journalsSnap.empty) {
          // Journals already exist, just mark as migrated
          await patchUserSettings(user.uid, { journalMigrated: true });
          return;
        }

        // Create default journal
        const journalRef = await addToUserCollection(user.uid, 'journals', {
          name: 'יומן ידני',
          // Blank until a real venue is connected. `other` is not an exchange
          // and used to make the dashboard say there was no live value.
          exchange: '',
          initialBalance: 0,
          currency: 'USDT',
          assetClass: 'crypto',
          isDefault: true,
          createdAt: timestamp(),
          updatedAt: timestamp(),
        });
        if (cancelledRef.current) return;

        // Batch update all existing trades
        const tradesSnap = await getRawCollectionSnapshot(user.uid, 'trades');
        if (cancelledRef.current) return;
        if (tradesSnap.docs.length > 0) {
          await batchUpdateFromSnapshot(tradesSnap.docs, (tradeDoc) => {
            if (!tradeDoc.data().journalId) {
              return { journalId: journalRef.id };
            }
            return null;
          });
          if (cancelledRef.current) return;
        }

        // Mark migration complete. Dotted path — does not replace the settings map.
        await patchUserSettings(user.uid, { journalMigrated: true });
        if (cancelledRef.current) return;

        // Auto-select the created journal
        setActiveJournalId(journalRef.id);
      } catch (error) {
        if (!cancelledRef.current) console.error('Journal migration error:', error);
      } finally {
        // Reset so a later legitimate mount can retry if this run bailed early.
        migratingRef.current = false;
      }
    }

    migrate();
  }, [user, loading]);

  // Persist activeJournalId
  useEffect(() => {
    if (activeJournalId) {
      localStorage.setItem('tradeos_activeJournal', activeJournalId);
    } else {
      // Clear it when no journal is active (e.g. last journal deleted) so a
      // reload doesn't restore a pointer to a journal that no longer exists.
      localStorage.removeItem('tradeos_activeJournal');
    }
  }, [activeJournalId]);

  // Sort: starred first, then by creation order. Memoized so consumers don't get
  // a fresh array identity (and a needless re-render) on every provider render.
  const sortedJournals = useMemo(() => [...journals].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return 0;
  }), [journals]);

  // Split into active and archived
  const activeJournals = useMemo(() => sortedJournals.filter((j) => !j.archived), [sortedJournals]);
  const archivedJournals = useMemo(() => sortedJournals.filter((j) => j.archived), [sortedJournals]);

  // Auto-select first active journal if none selected
  useEffect(() => {
    const active = journals.filter((j) => !j.archived);
    if (active.length > 0 && !active.find((j) => j.id === activeJournalId)) {
      setActiveJournalId(active[0].id);
    }
  }, [journals, activeJournalId]);

  const activeJournal = useMemo(
    () => activeJournals.find((j) => j.id === activeJournalId) || activeJournals[0] || null,
    [activeJournals, activeJournalId],
  );
  // The id of the journal we're actually showing. When the selected journal is
  // archived/deleted, `activeJournal` falls back to activeJournals[0] this
  // render, but the raw `activeJournalId` state only catches up on the next
  // tick (auto-select effect). Exposing the derived id keeps consumers like
  // useTrades(activeJournalId) from filtering by a stale id for one render.
  const effectiveJournalId = activeJournal?.id ?? null;

  const addJournal = useCallback(async (data) => {
    if (!user) throw new Error('No user');
    // Single enforcement point for the free-tier journal cap — covers every
    // path that creates a journal, not just the switcher button.
    const activeCount = journals.filter((j) => !j.archived).length;
    if (!isPremium && activeCount >= FREE_LIMITS.journals) {
      const err = new Error('free-limit');
      err.code = 'free-limit';
      throw err;
    }
    const ref = await addToUserCollection(user.uid, 'journals', {
      ...data,
      isDefault: false,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    setActiveJournalId(ref.id);
    return ref.id;
  }, [user, isPremium, journals]);

  const updateJournal = useCallback(async (journalId, data) => {
    if (!user) throw new Error('No user');
    await updateUserDocument(user.uid, 'journals', journalId, {
      ...data,
      updatedAt: timestamp(),
    });
  }, [user]);

  const toggleStarJournal = useCallback(async (journalId) => {
    if (!user) throw new Error('No user');
    const journal = journals.find((j) => j.id === journalId);
    if (!journal) return;
    await updateUserDocument(user.uid, 'journals', journalId, {
      starred: !journal.starred,
      updatedAt: timestamp(),
    });
  }, [user, journals]);

  const deleteJournal = useCallback(async (journalId) => {
    if (!user) throw new Error('No user');
    // Guard: verify the journal actually belongs to this user before deleting
    // Prevents accidental cross-journal deletion in concurrent-tab scenarios
    if (!journals.find((j) => j.id === journalId)) {
      console.error('deleteJournal: journalId not found in user journals', journalId);
      return;
    }
    // Batch delete all trades belonging to this journal
    const tradesSnap = await getRawCollectionSnapshot(user.uid, 'trades');
    const inJournal = (d) => d.data().journalId === journalId;
    await batchDeleteByFilter(tradesSnap.docs, inJournal);
    // Best-effort: their chart screenshots too (not awaited — never blocks
    // or fails the journal delete).
    deleteImagesForTrades(user.uid, tradesSnap.docs.filter(inJournal).map((d) => d.id))
      .catch((e) => console.warn('Journal screenshot cleanup failed:', e));
    await deleteUserDocument(user.uid, 'journals', journalId);
    if (activeJournalId === journalId) {
      const remaining = journals.filter((j) => j.id !== journalId);
      setActiveJournalId(remaining[0]?.id || null);
    }
  }, [user, activeJournalId, journals]);

  const archiveJournal = useCallback(async (journalId) => {
    if (!user) throw new Error('No user');
    await updateUserDocument(user.uid, 'journals', journalId, {
      archived: true,
      archivedAt: timestamp(),
      updatedAt: timestamp(),
    });
    if (activeJournalId === journalId) {
      const remaining = journals.filter((j) => j.id !== journalId && !j.archived);
      setActiveJournalId(remaining[0]?.id || null);
    }
  }, [user, activeJournalId, journals]);

  const unarchiveJournal = useCallback(async (journalId) => {
    if (!user) throw new Error('No user');
    await updateUserDocument(user.uid, 'journals', journalId, {
      archived: false,
      archivedAt: null,
      updatedAt: timestamp(),
    });
  }, [user]);

  const value = useMemo(() => ({
    journals: activeJournals,
    archivedJournals,
    activeJournal,
    activeJournalId: effectiveJournalId,
    setActiveJournalId,
    addJournal,
    updateJournal,
    deleteJournal,
    archiveJournal,
    unarchiveJournal,
    toggleStarJournal,
    loading,
  }), [activeJournals, archivedJournals, activeJournal, effectiveJournalId,
    addJournal, updateJournal, deleteJournal, archiveJournal, unarchiveJournal, toggleStarJournal, loading]);

  return (
    <JournalContext.Provider value={value}>
      {children}
    </JournalContext.Provider>
  );
}

export function useJournalContext() {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournalContext must be inside JournalProvider');
  return ctx;
}
