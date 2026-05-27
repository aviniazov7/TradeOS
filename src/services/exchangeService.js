const WORKER_URL =
  import.meta.env.VITE_WORKER_URL || 'https://trade-os.aviniazov7.workers.dev';

export async function syncExchangeTrades(exchange, apiKey, apiSecret, passphrase, limit = 50) {
  const res = await fetch(`${WORKER_URL}/exchange/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchange, apiKey, apiSecret, passphrase, limit }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'הסנכרון נכשל');
  return data.trades || [];
}

export async function syncOpenPositions(exchange, apiKey, apiSecret) {
  const res = await fetch(`${WORKER_URL}/exchange/open-positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchange, apiKey, apiSecret }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'שגיאה בטעינת הפוזיציות הפתוחות');
  return data.positions || [];
}
