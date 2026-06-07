import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.aviniazov7.workers.dev';

async function authHeader() {
  const user = getAuth().currentUser;
  if (!user) throw new Error('לא מחובר');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Ask the worker to produce a structured AI report on a stats summary.
// depth: 'short' (free) | 'deep' (premium).
export async function generateCoachReport(stats, depth = 'short') {
  const res = await fetch(`${WORKER_BASE}/ai-coach`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ stats, depth }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || 'הניתוח נכשל');
    if (data.quotaExceeded) err.quotaExceeded = true;
    throw err;
  }
  return data.text || '';
}
