import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserSetting } from '../services/firestoreService';
import { fetchExchangeBalance } from '../services/exchangeService';

const REFRESH_MS = 60_000; // refetch every minute

// Live futures wallet balance for the exchange a journal is linked to.
// Returns null while loading or when the journal has no exchange / the
// exchange isn't connected; otherwise returns the balance number.
export function useLinkedExchangeBalance(exchangeId) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!user || !exchangeId) { setBalance(null); return; }
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      try {
        const exchanges = await getUserSetting(user.uid, 'exchanges');
        const conf = exchanges?.[exchangeId];
        // `connected` is the new non-secret marker; the apiKey check keeps
        // legacy (pre-migration) entries working until they migrate.
        if (!conf?.connected && !(conf?.apiKey && conf?.apiSecret)) { setBalance(null); return; }
        const res = await fetchExchangeBalance(exchangeId);
        if (!cancelled) setBalance(res.balance);
      } catch {
        if (!cancelled) setBalance(null);
      }
    };

    tick();
    timer = setInterval(tick, REFRESH_MS);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [user, exchangeId]);

  return balance;
}

// Live balance for every journal that's linked to a connected exchange.
// Returns a `{ [journalId]: balance }` map so the dashboard can override the
// computed (initial + PnL) balance with the real wallet figure.
export function useLinkedJournalsBalance(journals) {
  const { user } = useAuth();
  const [byJournal, setByJournal] = useState({});

  // Distinct exchange ids referenced by the journals (string for stable key).
  const exchangeIdsKey = useMemo(() => {
    const ids = new Set();
    for (const j of journals || []) if (j.exchange) ids.add(j.exchange);
    return [...ids].sort().join(',');
  }, [journals]);

  // Journal-id → exchange-id, also stable-keyed for the effect.
  const journalsKey = useMemo(() =>
    (journals || []).filter((j) => j.exchange).map((j) => `${j.id}:${j.exchange}`).sort().join('|'),
    [journals]
  );

  useEffect(() => {
    if (!user || !exchangeIdsKey) { setByJournal({}); return; }
    const exchangeIds = exchangeIdsKey.split(',').filter(Boolean);
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      try {
        const allCreds = (await getUserSetting(user.uid, 'exchanges')) || {};
        const balances = {};
        await Promise.all(exchangeIds.map(async (exId) => {
          const conf = allCreds[exId];
          if (!conf?.connected && !(conf?.apiKey && conf?.apiSecret)) return;
          try {
            const res = await fetchExchangeBalance(exId);
            balances[exId] = res.balance;
          } catch { /* skip this exchange */ }
        }));
        if (cancelled) return;
        const next = {};
        for (const entry of journalsKey.split('|')) {
          const [jid, exId] = entry.split(':');
          if (balances[exId] != null) next[jid] = balances[exId];
        }
        setByJournal(next);
      } catch { /* keep last */ }
    };

    tick();
    timer = setInterval(tick, REFRESH_MS);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [user, exchangeIdsKey, journalsKey]);

  return byJournal;
}
