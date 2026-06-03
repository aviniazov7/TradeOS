import { useEffect, useState } from 'react';
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
        const creds = exchanges?.[exchangeId];
        if (!creds?.apiKey || !creds?.apiSecret) { setBalance(null); return; }
        const res = await fetchExchangeBalance(exchangeId, creds.apiKey, creds.apiSecret, creds.passphrase);
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
