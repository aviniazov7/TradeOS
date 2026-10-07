import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

async function authHeader() {
  const user = getAuth().currentUser;
  if (!user) throw new Error('לא מחובר');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Ask the worker to produce a structured AI report on a stats summary.
// depth: 'short' (free) | 'deep' (premium).
// mode: 'journal' (default) | 'backtest' (swaps the worker's system prompt).
export async function generateCoachReport(stats, depth = 'short', mode = 'journal') {
  let res;
  try {
    res = await fetch(`${WORKER_BASE}/ai-coach`, {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ stats, depth, mode }),
      // A report can take a while, but never forever: past this, say so.
      signal: AbortSignal.timeout(75000),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error('הניתוח לוקח יותר מדי זמן. נסה שוב בעוד רגע.');
    throw new Error('בעיית תקשורת עם השרת. בדוק את החיבור ונסה שוב.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || 'הניתוח נכשל');
    if (data.quotaExceeded) err.quotaExceeded = true;
    throw err;
  }
  return data.text || '';
}
