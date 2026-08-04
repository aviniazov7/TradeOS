import { useState, useEffect, useMemo, useCallback } from 'react';
import { localDayKey } from '../utils/calculations';
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

  const todayMorning = useMemo(
    () => morningEntries.find((e) => e.date === todayStr) || null,
    [morningEntries, todayStr]
  );

  const todayEvening = useMemo(
    () => eveningEntries.find((e) => e.date === todayStr) || null,
    [eveningEntries, todayStr]
  );

  const saveMorningEntry = async (data) => {
    if (!user) throw new Error('No user');
    const existing = morningEntries.find((e) => e.date === data.date);
    if (existing) {
      await updateUserDocument(user.uid, 'morningJournals', existing.id, {
        ...data,
        updatedAt: timestamp(),
      });
    } else {
      await addToUserCollection(user.uid, 'morningJournals', {
        ...data,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });
    }
  };

  const saveEveningEntry = async (data) => {
    if (!user) throw new Error('No user');
    const existing = eveningEntries.find((e) => e.date === data.date);
    if (existing) {
      await updateUserDocument(user.uid, 'eveningJournals', existing.id, {
        ...data,
        updatedAt: timestamp(),
      });
    } else {
      await addToUserCollection(user.uid, 'eveningJournals', {
        ...data,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });
    }
  };

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
