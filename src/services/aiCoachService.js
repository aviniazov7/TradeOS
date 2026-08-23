import { getAuth } from 'firebase/auth';
import { WORKER_BASE } from '../config/workerBase';



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
  const res = await fetch(`${WORKER_BASE}/ai-coach`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ stats, depth, mode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || 'הניתוח נכשל');
    if (data.quotaExceeded) err.quotaExceeded = true;
    throw err;
  }
  return data.text || '';
}
