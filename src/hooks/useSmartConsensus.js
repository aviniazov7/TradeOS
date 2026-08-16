import { useState, useEffect, useMemo } from 'react';
import { fetchPositions } from '../services/polymarketService';
import { usePolymarketLeaderboard } from './usePolymarketLeaderboard';
import { POLYMARKET as C } from '../config/polymarket';

const TOP_WALLETS = 20;   // fan-out cap — one positions call per wallet
const CONCURRENCY = 4;    // be polite to the public API
const MIN_HOLDERS = 2;    // a "consensus" needs at least two independent wallets

// Consensus is expensive (N positions calls) — cache the aggregate per session.
// `inflight` dedups concurrent callers (the page and the tab both mount it).
let cache = { at: 0, data: null };
let inflight = null;

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Aggregate the open books of the top smart-money wallets into one picture:
 * which market+outcome the sharp money is crowding into right now.
 * Also returns `countByMarket` — how many of those wallets hold each market —
 * which the strategy engine uses for its "smart money required" filter.
 */
export function useSmartConsensus({ enabled = true } = {}) {
  const { rows } = usePolymarketLeaderboard('overall');
  const [raw, setRaw] = useState(() => cache.data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  // Stable identity for the wallet cohort we aggregate.
  const cohort = useMemo(
    () => rows.filter((r) => r.eligible).slice(0, TOP_WALLETS),
    [rows],
  );
  const cohortKey = cohort.map((r) => r.wallet).join(',');

  useEffect(() => {
    if (!enabled || !cohortKey) return undefined;
    const fresh = nonce === 0 && cache.data && Date.now() - cache.at < C.CACHE_TTL_MS;
    if (fresh) { setRaw(cache.data); return undefined; }

    let stop = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const wallets = cohortKey.split(',');
        const byWallet = new Map(cohort.map((r) => [r.wallet, r]));
        // Share one fan-out between concurrent mounts instead of firing 2×N.
        if (!inflight) {
          inflight = (async () => {
            let failed = 0;
            const books = await mapLimit(wallets, CONCURRENCY, async (w) => {
              try { return { wallet: w, positions: await fetchPositions(w, { limit: 60 }) }; }
              catch { failed += 1; return { wallet: w, positions: [] }; }
            });
            return { books, byWallet, failed, total: wallets.length, at: Date.now() };
          })().finally(() => { inflight = null; });
        }
        const data = await inflight;
        if (stop) return;
        // Most of the cohort failing means we know nothing — say so instead of
        // rendering an empty list as "no consensus in the market right now".
        if (data.failed > data.total / 2) {
          setError('טעינת התיקים נכשלה — לא ניתן לחשב קונסנזוס כרגע.');
          setRaw(null);
        } else {
          cache = { at: Date.now(), data };
          setRaw(data);
        }
      } catch {
        if (!stop) setError('חישוב הקונסנזוס נכשל.');
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [enabled, cohortKey, nonce, cohort]);

  // Fold the books into per-market/outcome consensus rows.
  const { consensus, countByMarket } = useMemo(() => {
    if (!raw?.books) return { consensus: [], countByMarket: {} };
    const agg = new Map();
    const perMarket = {};
    const seenPerMarket = new Map(); // conditionId → Set(wallet) so a wallet counts once
    for (const { wallet, positions } of raw.books) {
      for (const p of positions) {
        if (!p.conditionId || p.currentValue <= 0) continue;
        const key = `${p.conditionId}|${p.outcome}`;
        const cur = agg.get(key) || {
          conditionId: p.conditionId, outcome: p.outcome, title: p.title,
          icon: p.icon, eventSlug: p.eventSlug, slug: p.slug,
          holders: 0, valueUsd: 0, pnlUsd: 0, curPrice: p.curPrice, wallets: [],
        };
        cur.holders += 1;
        cur.valueUsd += p.currentValue;
        cur.pnlUsd += p.cashPnl || 0;
        cur.curPrice = p.curPrice || cur.curPrice;
        const row = raw.byWallet.get(wallet);
        cur.wallets.push({ wallet, name: row?.name || null, profileImage: row?.profileImage || null, valueUsd: p.currentValue });
        agg.set(key, cur);

        let set = seenPerMarket.get(p.conditionId);
        if (!set) { set = new Set(); seenPerMarket.set(p.conditionId, set); }
        set.add(wallet);
      }
    }
    for (const [cid, set] of seenPerMarket) perMarket[cid] = set.size;

    const list = [...agg.values()]
      .filter((x) => x.holders >= MIN_HOLDERS)
      .map((x) => ({ ...x, wallets: x.wallets.sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 6) }))
      .sort((a, b) => b.valueUsd - a.valueUsd);

    return { consensus: list, countByMarket: perMarket };
  }, [raw]);

  return {
    consensus,
    countByMarket,
    cohortSize: cohort.length,
    loading,
    error,
    refetch: () => setNonce((n) => n + 1),
  };
}
