import { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  subscribeToUserCollection,
  addToUserCollection,
  deleteUserDocument,
  timestamp,
} from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

// Per-user watched Polymarket wallets — persisted in Firestore so the tracked
// set follows the user across sessions/devices. Stores a snapshot of the
// wallet's stats too, so a tracked wallet still renders even when it drops out
// of this month's top-200 leaderboard.
export function usePolymarketWatch() {
  const { user } = useAuth();
  const [watched, setWatched] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setWatched([]); setLoading(false); return undefined; }
    return subscribeToUserCollection(
      user.uid, 'polymarketWatch', {},
      (data) => { setWatched(data); setLoading(false); },
      (e) => { console.error('polymarketWatch listener error:', e); setLoading(false); },
    );
  }, [user]);

  const watchedSet = useMemo(() => new Set(watched.map((w) => w.wallet)), [watched]);
  // Dedup relies on `watched` state, which lags a fast second click — without
  // this guard a double-click writes two docs for the same wallet.
  const pending = useRef(new Set());

  // Toggle tracking for a wallet-row object. Client-side dedup (we hold the full
  // set) prevents duplicate docs since we use auto-ids. Always reports the
  // outcome — a silent failure here (e.g. rules not deployed) looks like a
  // dead button.
  const toggle = async (row) => {
    if (!user || !row?.wallet) return;
    if (pending.current.has(row.wallet)) return;
    pending.current.add(row.wallet);
    const existing = watched.find((w) => w.wallet === row.wallet);
    try {
      if (existing) {
        await deleteUserDocument(user.uid, 'polymarketWatch', existing.id);
        toast.success('הוסר מהמעקב');
        return;
      }
      await addToUserCollection(user.uid, 'polymarketWatch', {
        wallet: row.wallet,
        name: row.name || null,
        profileImage: row.profileImage || null,
        snapshot: {
          pnl: row.pnl ?? null,
          roi: row.roi ?? null,
          volume: row.volume ?? null,
          smartScore: row.smartScore ?? null,
        },
        createdAt: timestamp(),
      });
      toast.success('נוסף למעקב ⭐');
    } catch (e) {
      const denied = e?.code === 'permission-denied';
      toast.error(denied
        ? 'אין הרשאה לשמור — יש לפרוס את חוקי ה-Firestore (firebase deploy --only firestore:rules)'
        : 'שמירת המעקב נכשלה');
      console.error('polymarketWatch toggle failed:', e);
    } finally {
      pending.current.delete(row.wallet);
    }
  };

  return { watched, watchedSet, toggle, loading };
}
