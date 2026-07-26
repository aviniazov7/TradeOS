import { useEffect, useState, useCallback } from 'react';
import { getCurrentUser } from '../services/authService';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

// Tracks the signed-in user's daily AI quota (used / limit). Resets at Israel
// midnight on the worker side. Call refresh() after every AI request so the
// progress bar updates immediately.
export function useAiUsage() {
  const [usage, setUsage] = useState({ used: 0, limit: 20, unlimited: false, premium: false, imageUsed: 0, imageLimit: 0 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const user = getCurrentUser();
    if (!user) { setLoading(false); return; }
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${WORKER_BASE}/ai-usage`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const data = await r.json();
      setUsage({
        used: data.used ?? 0,
        limit: data.limit ?? 20,
        unlimited: !!data.unlimited,
        premium: !!data.premium,
        imageUsed: data.imageUsed ?? 0,
        imageLimit: data.imageLimit ?? 0,
      });
    } catch { /* keep last value */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...usage, loading, refresh };
}

// Admin-only — fetch another user's AI usage.
export async function fetchUserAiUsage(uid) {
  const user = getCurrentUser();
  if (!user) return null;
  const token = await user.getIdToken();
  const r = await fetch(`${WORKER_BASE}/admin/ai-usage/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

// Admin-only — aggregate today's AI usage across ALL users (text + image),
// with a per-user breakdown. Returns { date, totalText, totalImage, perUser }.
export async function fetchGlobalAiUsage() {
  const user = getCurrentUser();
  if (!user) return null;
  const token = await user.getIdToken();
  const r = await fetch(`${WORKER_BASE}/admin/ai-usage-global`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

// Admin-only — daily AI stats (counts + real tokens) for the last N days.
// Returns { days, stats: [{ date, text, image, tokIn, tokOut }] }.
export async function fetchAiStats(days = 30) {
  const user = getCurrentUser();
  if (!user) return null;
  const token = await user.getIdToken();
  const r = await fetch(`${WORKER_BASE}/admin/ai-stats?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

// Admin-only — system health (cron heartbeat, bot, push/AI configured).
// Returns only booleans / public info / timestamps — never secrets.
export async function fetchSystemHealth() {
  const user = getCurrentUser();
  if (!user) return null;
  const token = await user.getIdToken();
  const r = await fetch(`${WORKER_BASE}/admin/health`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

// Admin-only — live connectivity test of the AI providers. Returns each
// provider's real HTTP status + error snippet so a "המערכת עמוסה" can be
// pinned to the actual cause. Never returns keys.
export async function testAiProviders() {
  const user = getCurrentUser();
  if (!user) return { error: 'לא מחובר' };
  const token = await user.getIdToken();
  const r = await fetch(`${WORKER_BASE}/admin/ai-test`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { error: `שגיאה ${r.status}` };
  return r.json();
}
