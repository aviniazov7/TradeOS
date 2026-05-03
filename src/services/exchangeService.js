const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';

export async function syncExchangeTrades(exchange, apiKey, apiSecret, passphrase, limit = 50) {
  if (!WORKER_URL) throw new Error('Worker URL not configured');
  const res = await fetch(`${WORKER_URL}/exchange/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchange, apiKey, apiSecret, passphrase, limit }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Sync failed');
  return data.trades || [];
}

export async function syncOpenPositions(exchange, apiKey, apiSecret) {
  if (!WORKER_URL) throw new Error('Worker URL not configured');
  const res = await fetch(`${WORKER_URL}/exchange/open-positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchange, apiKey, apiSecret }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Failed to fetch open positions');
  return data.positions || [];
}
