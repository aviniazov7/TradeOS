import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getConnectedExchanges, fetchTerminalSnapshot } from '../services/exchangeService';
import { fetchPerpMarks } from '../services/bybitDirect';
import { getOpenTrades } from '../services/firestoreService';
import { TERMINAL_EXCHANGES } from '../utils/terminal';

const POLL_MS = 15_000; // positions + orders from the exchanges
const MARK_MS = 5_000; // public mark prices between polls

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * Live data for the trading terminal: every connected exchange's open
 * positions and resting orders, polled while the page is visible (paused in a
 * background tab, refreshed on return), live mark prices between polls, and
 * the journal's open trades (for each position's original stop).
 *
 * → { connected: string[] | null (null = loading), snapshots: { [ex]: { positions,
 *     orders, ordersPartial, positionsError, ordersError, error, at } },
 *     marks: { PAIR: price }, openTrades, loading, refreshing, lastUpdated, refresh }
 */
export function useTerminalData() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [connected, setConnected] = useState(null);
  const [snapshots, setSnapshots] = useState({});
  const [marks, setMarks] = useState({});
  const [openTrades, setOpenTrades] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const lastPoll = useRef(0);

  // Which exchanges are connected (once per user).
  useEffect(() => {
    if (!uid) { setConnected([]); return undefined; }
    let cancelled = false;
    setConnected(null);
    setSnapshots({});
    getConnectedExchanges()
      .then((list) => { if (!cancelled) setConnected(list.filter((e) => TERMINAL_EXCHANGES.includes(e))); })
      .catch(() => { if (!cancelled) setConnected([]); });
    return () => { cancelled = true; };
  }, [uid]);

  const loadTrades = useCallback(() => {
    if (!uid) return;
    getOpenTrades(uid).then(setOpenTrades).catch(() => { /* R falls back to the live stop */ });
  }, [uid]);
  useEffect(() => { loadTrades(); }, [loadTrades]);

  const exchangesKey = (connected || []).join(',');

  const poll = useCallback(async () => {
    const list = exchangesKey ? exchangesKey.split(',') : [];
    if (!list.length || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      await Promise.all(list.map(async (ex) => {
        try {
          const snap = await fetchTerminalSnapshot(ex);
          setSnapshots((s) => ({ ...s, [ex]: { ...snap, error: null, at: Date.now() } }));
        } catch (e) {
          // Keep the last good rows; just flag the problem.
          setSnapshots((s) => ({ ...s, [ex]: { ...(s[ex] || { positions: [], orders: [] }), error: e?.message || 'שגיאה', reason: e?.reason || null, at: s[ex]?.at || 0 } }));
        }
      }));
    } finally {
      lastPoll.current = Date.now();
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [exchangesKey]);

  // Poll while visible; catch up as soon as the tab comes back.
  useEffect(() => {
    if (!exchangesKey) return undefined;
    poll();
    const timer = setInterval(() => { if (visible()) poll(); }, POLL_MS);
    const onVis = () => { if (visible() && Date.now() - lastPoll.current > POLL_MS) poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [exchangesKey, poll]);

  // Live marks for the open positions' pairs.
  const pairsKey = useMemo(() => {
    const s = new Set();
    for (const snap of Object.values(snapshots)) for (const p of snap.positions || []) if (p.pair) s.add(p.pair);
    return [...s].sort().join(',');
  }, [snapshots]);

  useEffect(() => {
    if (!pairsKey) { setMarks({}); return undefined; }
    let cancelled = false;
    const tick = async () => {
      if (!visible()) return;
      const m = await fetchPerpMarks(pairsKey.split(',')).catch(() => ({}));
      if (!cancelled && Object.keys(m).length) setMarks(m);
    };
    tick();
    const timer = setInterval(tick, MARK_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [pairsKey]);

  const refresh = useCallback(() => { poll(); loadTrades(); }, [poll, loadTrades]);

  const lastUpdated = useMemo(() => Math.max(0, ...Object.values(snapshots).map((s) => s.at || 0)), [snapshots]);
  const loading = connected === null || (connected.length > 0 && Object.keys(snapshots).length === 0);

  return { connected, snapshots, marks, openTrades, loading, refreshing, lastUpdated, refresh };
}
