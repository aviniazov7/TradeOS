import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserSetting } from '../services/firestoreService';
import { fetchExchangeBalance } from '../services/exchangeService';

const REFRESH_MS = 60_000; // refetch every minute

// Live futures wallet balance for the exchange a journal is linked to, plus
// the API-key problem when the balance call failed because of the key
// (`keyProblem`: key_expired / key_invalid / ip_blocked / no_permission).
// balance is null while loading or when the journal has no exchange / the
// exchange isn't connected.
export function useLinkedExchange(exchangeId) {
  const { user } = useAuth();
  const [state, setState] = useState({ balance: null, keyProblem: null });

  useEffect(() => {
    if (!user || !exchangeId) { setState({ balance: null, keyProblem: null }); return; }
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      try {
        const exchanges = await getUserSetting(user.uid, 'exchanges');
        const conf = exchanges?.[exchangeId];
        // `connected` is the new non-secret marker; the apiKey check keeps
        // legacy (pre-migration) entries working until they migrate.
        if (!conf?.connected && !(conf?.apiKey && conf?.apiSecret)) { if (!cancelled) setState({ balance: null, keyProblem: null }); return; }
        const res = await fetchExchangeBalance(exchangeId);
        if (!cancelled) setState({ balance: res.balance, keyProblem: null });
      } catch (err) {
        if (!cancelled) setState({ balance: null, keyProblem: err?.reason || null });
      }
    };

    tick();
    timer = setInterval(tick, REFRESH_MS);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [user, exchangeId]);

  return state;
}

// Balance only — the shape most callers want.
export function useLinkedExchangeBalance(exchangeId) {
  return useLinkedExchange(exchangeId).balance;
}

// Live balance for every journal that's linked to a connected exchange.
// `balances` is a `{ [journalId]: balance }` map so the dashboard can override
// the computed (initial + PnL) balance with the real wallet figure; `problems`
// is `{ [journalId]: reason }` when the exchange answered with an API-key
// problem (key_expired / key_invalid / ip_blocked / no_permission).
export function useLinkedJournals(journals) {
  const { user } = useAuth();
  const [state, setState] = useState({ balances: {}, problems: {} });

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
    if (!user || !exchangeIdsKey) { setState({ balances: {}, problems: {} }); return; }
    const exchangeIds = exchangeIdsKey.split(',').filter(Boolean);
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      try {
        const allCreds = (await getUserSetting(user.uid, 'exchanges')) || {};
        const balances = {};
        const reasons = {};
        await Promise.all(exchangeIds.map(async (exId) => {
          const conf = allCreds[exId];
          if (!conf?.connected && !(conf?.apiKey && conf?.apiSecret)) return;
          try {
            const res = await fetchExchangeBalance(exId);
            balances[exId] = res.balance;
          } catch (err) {
            if (err?.reason) reasons[exId] = err.reason;
          }
        }));
        if (cancelled) return;
        const next = { balances: {}, problems: {} };
        for (const entry of journalsKey.split('|')) {
          const [jid, exId] = entry.split(':');
          if (balances[exId] != null) next.balances[jid] = balances[exId];
          if (reasons[exId]) next.problems[jid] = reasons[exId];
        }
        setState(next);
      } catch { /* keep last */ }
    };

    tick();
    timer = setInterval(tick, REFRESH_MS);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [user, exchangeIdsKey, journalsKey]);

  return state;
}

// Balances only — the shape the portfolio totals want.
export function useLinkedJournalsBalance(journals) {
  return useLinkedJournals(journals).balances;
}
