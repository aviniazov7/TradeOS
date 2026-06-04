import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  getUserProfile,
  setUserProfile,
  getRawCollectionSnapshot,
  batchUpdateFromSnapshot,
  batchDeleteByFilter,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from './AuthContext';
import { FREE_LIMITS } from '../utils/constants';

const JournalContext = createContext(null);

export function JournalProvider({ children }) {
  const { user, isPremium } = useAuth();
  const [journals, setJournals] = useState([]);
  const [activeJournalId, setActiveJournalId] = useState(
    () => localStorage.getItem('tradeos_activeJournal') || null
  );
  const [loading, setLoading] = useState(true);

  // Real-time listener for journals
  useEffect(() => {
    if (!user) {
      setJournals([]);
      setLoading(false);
      return;
    }

    return subscribeToUserCollection(
      user.uid,
      'journals',
      { orderDir: 'asc' },
      (data) => {
        setJournals(data);
        setLoading(false);
      },
      (error) => {
        console.error('Journals listener error:', error);
        setLoading(false);
      }
    );
  }, [user]);

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
          await setUserProfile(user.uid, { settings: { journalMigrated: true } });
          return;
        }

        // Create default journal
        const journalRef = await addToUserCollection(user.uid, 'journals', {
          name: 'היומן שלי',
          exchange: 'other',
          initialBalance: 0,
          currency: 'USDT',
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

        // Mark migration complete
        await setUserProfile(user.uid, { settings: { journalMigrated: true } });
        if (cancelledRef.current) return;

        // Auto-select the created journal
        setActiveJournalId(journalRef.id);
      } catch (error) {
        if (!cancelledRef.current) console.error('Journal migration error:', error);
      }
    }

    migrate();
  }, [user, loading]);

  // Persist activeJournalId
  useEffect(() => {
    if (activeJournalId) {
      localStorage.setItem('tradeos_activeJournal', activeJournalId);
    }
  }, [activeJournalId]);

  // Sort: starred first, then by creation order
  const sortedJournals = [...journals].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return 0;
  });

  // Split into active and archived
  const activeJournals = sortedJournals.filter((j) => !j.archived);
  const archivedJournals = sortedJournals.filter((j) => j.archived);

  // Auto-select first active journal if none selected
  useEffect(() => {
    const active = journals.filter((j) => !j.archived);
    if (active.length > 0 && !active.find((j) => j.id === activeJournalId)) {
      setActiveJournalId(active[0].id);
    }
  }, [journals, activeJournalId]);

  const activeJournal = activeJournals.find((j) => j.id === activeJournalId) || activeJournals[0] || null;

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
    await batchDeleteByFilter(tradesSnap.docs, (d) => d.data().journalId === journalId);
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

  return (
    <JournalContext.Provider
      value={{
        journals: activeJournals,
        archivedJournals,
        activeJournal,
        activeJournalId,
        setActiveJournalId,
        addJournal,
        updateJournal,
        deleteJournal,
        archiveJournal,
        unarchiveJournal,
        toggleStarJournal,
        loading,
      }}
    >
      {children}
    </JournalContext.Provider>
  );
}

export function useJournalContext() {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournalContext must be inside JournalProvider');
  return ctx;
}
