import { useEffect, useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.aviniazov7.workers.dev';

// Tracks the signed-in user's daily AI quota (used / limit). Resets at Israel
// midnight on the worker side. Call refresh() after every AI request so the
// progress bar updates immediately.
export function useAiUsage() {
  const [usage, setUsage] = useState({ used: 0, limit: 20, unlimited: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) { setLoading(false); return; }
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${WORKER_BASE}/ai-usage`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const data = await r.json();
      setUsage({ used: data.used ?? 0, limit: data.limit ?? 20, unlimited: !!data.unlimited });
    } catch { /* keep last value */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...usage, loading, refresh };
}

// Admin-only — fetch another user's AI usage.
export async function fetchUserAiUsage(uid) {
  const user = getAuth().currentUser;
  if (!user) return null;
  const token = await user.getIdToken();
  const r = await fetch(`${WORKER_BASE}/admin/ai-usage/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}
