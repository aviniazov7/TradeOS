import { useState, useEffect, useMemo } from 'react';
import { localDayKey } from '../utils/calculations';
import { findEntryForDay } from '../utils/mentalityJournalForm';
import {
  subscribeToUserCollection,
  addToUserCollection,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

export function useMentalityJournals() {
  const { user } = useAuth();
  const [morningEntries, setMorningEntries] = useState([]);
  const [eveningEntries, setEveningEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMorningEntries([]);
      setEveningEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let morningDone = false;
    let eveningDone = false;

    const checkDone = () => {
      if (morningDone && eveningDone) setLoading(false);
    };

    const unsubMorning = subscribeToUserCollection(
      user.uid,
      'morningJournals',
      {},
      (data) => {
        setMorningEntries(data);
        morningDone = true;
        checkDone();
      },
      (error) => {
        console.error('Morning journals listener error:', error);
        morningDone = true;
        checkDone();
      }
    );

    const unsubEvening = subscribeToUserCollection(
      user.uid,
      'eveningJournals',
      {},
      (data) => {
        setEveningEntries(data);
        eveningDone = true;
        checkDone();
      },
      (error) => {
        console.error('Evening journals listener error:', error);
        eveningDone = true;
        checkDone();
      }
    );

    return () => {
      unsubMorning();
      unsubEvening();
    };
  }, [user]);

  const [todayStr, setTodayStr] = useState(() => localDayKey());

  // Update todayStr when date changes (midnight crossing)
  useEffect(() => {
    const checkDate = () => {
      const now = localDayKey();
      if (now !== todayStr) setTodayStr(now);
    };
    const interval = setInterval(checkDate, 60000);
    return () => clearInterval(interval);
  }, [todayStr]);

  // Today's entry by LOCAL day (see findEntryForDay: `date` first, else the
  // local day of createdAt; the newest edit wins over a duplicate).
  const todayMorning = useMemo(
    () => findEntryForDay(morningEntries, todayStr),
    [morningEntries, todayStr]
  );

  const todayEvening = useMemo(
    () => findEntryForDay(eveningEntries, todayStr),
    [eveningEntries, todayStr]
  );

  // Create-or-update for one local day. `id` (the entry being edited) wins;
  // otherwise the day's existing doc is updated, so saving twice never makes a
  // duplicate. Resolves with the doc id.
  const saveEntry = async (collectionName, entries, data, id) => {
    if (!user) throw new Error('No user');
    const existingId = id || findEntryForDay(entries, data.date)?.id;
    if (existingId) {
      await updateUserDocument(user.uid, collectionName, existingId, {
        ...data,
        updatedAt: timestamp(),
      });
      return existingId;
    }
    const ref = await addToUserCollection(user.uid, collectionName, {
      ...data,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    return ref?.id || null;
  };

  const saveMorningEntry = (data, id) => saveEntry('morningJournals', morningEntries, data, id);
  const saveEveningEntry = (data, id) => saveEntry('eveningJournals', eveningEntries, data, id);

  const deleteMorningEntry = async (id) => {
    if (!user) throw new Error('No user');
    await deleteUserDocument(user.uid, 'morningJournals', id);
  };

  const deleteEveningEntry = async (id) => {
    if (!user) throw new Error('No user');
    await deleteUserDocument(user.uid, 'eveningJournals', id);
  };

  return {
    morningEntries,
    eveningEntries,
    todayMorning,
    todayEvening,
    loading,
    saveMorningEntry,
    saveEveningEntry,
    deleteMorningEntry,
    deleteEveningEntry,
  };
}
