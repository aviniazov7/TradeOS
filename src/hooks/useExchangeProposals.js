import { useCallback, useEffect, useRef, useState } from 'react';
import { syncExchangeTrades, syncOpenPositions } from '../services/exchangeService';

// Exchanges the Worker can pull trades from via API (the rest are CSV-only).
const SYNCABLE = new Set(['bybit', 'mexc', 'okx', 'bitget']);

// In-memory cache keyed by exchange id so switching tabs / journals back and
// forth doesn't re-hit the exchange API (and the Worker's KV) every time. A
// manual refresh() bypasses it. Cleared implicitly when the tab is closed.
const CACHE_TTL_MS = 3 * 60_000; // 3 minutes
const cache = new Map(); // exchangeId -> { rows, ts }

async function fetchProposals(exchangeId) {
  const [tradesResult, openResult] = await Promise.allSettled([
    syncExchangeTrades(exchangeId, { days: 0 }),
    syncOpenPositions(exchangeId),
  ]);
  const closedTrades = tradesResult.status === 'fulfilled' ? tradesResult.value : [];
  const openPos = openResult.status === 'fulfilled' ? openResult.value : [];
  // Surface a real error only when BOTH calls failed — a partial result (e.g.
  // open positions unavailable) should still show whatever we did get.
  if (tradesResult.status === 'rejected' && openResult.status === 'rejected') {
    throw tradesResult.reason || openResult.reason || new Error('הסנכרון נכשל');
  }
  const taggedOpen = openPos.map((p) => ({ ...p, _isOpen: true, pnlFromExchange: null }));
  // Open positions first so the freshest, still-running trades sit on top.
  return [...taggedOpen, ...closedTrades];
}

// Auto-fetches the exchange's recent trades + open positions so the trades tab
// can proactively PROPOSE them for import (instead of the user having to open
// the exchange tab and click sync). Returns the raw synced rows; the caller
// dedups against the journal's existing externalIds so already-logged trades
// aren't re-proposed.
export function useExchangeProposals(exchangeId, { enabled = true } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const reqIdRef = useRef(0);

  const active = enabled && !!exchangeId && SYNCABLE.has(exchangeId);

  const load = useCallback(async (force = false) => {
    if (!active) { setRows([]); return; }
    const cached = cache.get(exchangeId);
    // Fresh cache-hit is provided synchronously via the effect below; this
    // guard just avoids a redundant network fetch when nothing forced it.
    if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setRows(cached.rows);
      setLastSyncedAt(cached.ts);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchProposals(exchangeId);
      cache.set(exchangeId, { rows: fresh, ts: Date.now() });
      if (reqId !== reqIdRef.current) return; // a newer request superseded us
      setRows(fresh);
      setLastSyncedAt(Date.now());
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [active, exchangeId]);

  useEffect(() => {
    if (!active) { setRows([]); setError(null); setLastSyncedAt(null); return; }
    // Serve a fresh cache entry immediately (no spinner) on remount; otherwise
    // kick off a background fetch.
    const cached = cache.get(exchangeId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setRows(cached.rows);
      setLastSyncedAt(cached.ts);
    } else {
      load(false);
    }
  }, [active, exchangeId, load]);

  const refresh = useCallback(() => load(true), [load]);

  return { rows, loading, error, lastSyncedAt, refresh, active };
}
