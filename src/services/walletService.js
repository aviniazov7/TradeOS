import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

async function authHeader() {
  const user = getAuth().currentUser;
  if (!user) throw new Error('לא מחובר');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Fetch on-chain net worth + token holdings for an EVM address (via Moralis,
// proxied through the worker so the API key stays server-side).
export async function fetchWalletData(address) {
  const res = await fetch(`${WORKER_BASE}/wallet`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ address }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'שגיאה בטעינת הארנק');
  return data; // { totalUsd, chains: [{chain, usd}], tokens: [{symbol,name,usd,amount,chain,logo}] }
}
