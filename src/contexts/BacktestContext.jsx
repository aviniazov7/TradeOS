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
  timestamp,
} from '../services/firestoreService';
import { useAuth } from './AuthContext';

const BacktestContext = createContext(null);

export function BacktestProvider({ children }) {
  const { user } = useAuth();
  const [journals, setJournals] = useState([]);
  const [activeJournalId, setActiveJournalId] = useState(
    () => localStorage.getItem('tradeos_activeBacktestJournal') || null
  );
  const [loading, setLoading] = useState(true);

  // Real-time listener for backtest journals
  useEffect(() => {
    if (!user) {
      setJournals([]);
      setLoading(false);
      return;
    }

    return subscribeToUserCollection(
      user.uid,
      'backtestJournals',
      { orderDir: 'asc' },
      (data) => {
        setJournals(data);
        setLoading(false);
      },
      (error) => {
        console.error('Backtest journals listener error:', error);
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
        if (userData?.settings?.backtestMigrated) return;

        const journalsSnap = await getRawCollectionSnapshot(user.uid, 'backtestJournals');
        if (cancelledRef.current) return;
        if (!journalsSnap.empty) {
          await setUserProfile(user.uid, { settings: { backtestMigrated: true } });
          return;
        }

        // Create default backtest journal
        const journalRef = await addToUserCollection(user.uid, 'backtestJournals', {
          name: 'בקטסט ראשי',
          description: '',
          isDefault: true,
          createdAt: timestamp(),
          updatedAt: timestamp(),
        });
        if (cancelledRef.current) return;

        // Batch update all existing backtests
        const backtestsSnap = await getRawCollectionSnapshot(user.uid, 'backtests');
        if (cancelledRef.current) return;
        if (backtestsSnap.docs.length > 0) {
          await batchUpdateFromSnapshot(backtestsSnap.docs, (btDoc) => {
            if (!btDoc.data().backtestJournalId) {
              return { backtestJournalId: journalRef.id };
            }
            return null;
          });
          if (cancelledRef.current) return;
        }

        // Mark migration complete
        await setUserProfile(user.uid, { settings: { backtestMigrated: true } });
        if (cancelledRef.current) return;

        // Auto-select the created journal
        setActiveJournalId(journalRef.id);
      } catch (error) {
        if (!cancelledRef.current) console.error('Backtest migration error:', error);
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
      localStorage.setItem('tradeos_activeBacktestJournal', activeJournalId);
    } else {
      // Clear it when no journal is active (e.g. last journal deleted) so a
      // reload doesn't restore a pointer to a journal that no longer exists.
      localStorage.removeItem('tradeos_activeBacktestJournal');
    }
  }, [activeJournalId]);

  // Auto-select first journal if none selected
  useEffect(() => {
    if (journals.length > 0 && !journals.find((j) => j.id === activeJournalId)) {
      setActiveJournalId(journals[0].id);
    }
  }, [journals, activeJournalId]);

  const activeJournal = journals.find((j) => j.id === activeJournalId) || journals[0] || null;
  // Expose the id of the journal actually shown, so consumers like
  // useBacktests(activeJournalId) never filter by a stale id for the render
  // before the auto-select effect catches up (deleted/archived journal).
  const effectiveJournalId = activeJournal?.id ?? null;

  const addJournal = useCallback(async (data) => {
    if (!user) throw new Error('No user');
    const ref = await addToUserCollection(user.uid, 'backtestJournals', {
      ...data,
      isDefault: false,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    setActiveJournalId(ref.id);
    return ref.id;
  }, [user]);

  const updateJournal = useCallback(async (journalId, data) => {
    if (!user) throw new Error('No user');
    await updateUserDocument(user.uid, 'backtestJournals', journalId, {
      ...data,
      updatedAt: timestamp(),
    });
  }, [user]);

  const deleteJournal = useCallback(async (journalId) => {
    if (!user) throw new Error('No user');
    await deleteUserDocument(user.uid, 'backtestJournals', journalId);
    if (activeJournalId === journalId) {
      const remaining = journals.filter((j) => j.id !== journalId);
      setActiveJournalId(remaining[0]?.id || null);
    }
  }, [user, activeJournalId, journals]);

  return (
    <BacktestContext.Provider
      value={{
        journals,
        activeJournal,
        activeJournalId: effectiveJournalId,
        setActiveJournalId,
        addJournal,
        updateJournal,
        deleteJournal,
        loading,
      }}
    >
      {children}
    </BacktestContext.Provider>
  );
}

export function useBacktestContext() {
  const ctx = useContext(BacktestContext);
  if (!ctx) throw new Error('useBacktestContext must be inside BacktestProvider');
  return ctx;
}
