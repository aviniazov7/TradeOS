import { useEffect, useState } from 'react';
import { getConnectedExchanges } from '../services/exchangeService';

// null while the worker call is in flight, then a boolean. Callers must not
// treat "unknown" as "not connected" — that flashed the empty-account home
// at people whose exchange was already linked.
export function useExchangeConnected() {
  const [connected, setConnected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getConnectedExchanges()
      .then((list) => { if (!cancelled) setConnected(Array.isArray(list) && list.length > 0); })
      .catch(() => { if (!cancelled) setConnected(false); });
    return () => { cancelled = true; };
  }, []);

  return connected;
}
