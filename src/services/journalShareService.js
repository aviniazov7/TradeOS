// Owner calls for the journal-share Worker. The default token is loaded only
// when a request runs, so tests can pass their own client and never touch Firebase.

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

async function defaultToken() {
  const { auth } = await import('./firebase');
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('נדרשת התחברות');
  return token;
}

export function createJournalShareClient({
  fetchFn = fetch,
  getToken = defaultToken,
  base = WORKER_BASE,
} = {}) {
  async function call(path, { method = 'GET', body } = {}) {
    const token = await getToken();
    const res = await fetchFn(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'הבקשה נכשלה');
    return data;
  }

  return {
    list: () => call('/api/journal-shares'),
    create: (body) => call('/api/journal-shares', { method: 'POST', body }),
    update: (id, body) => call(`/api/journal-shares/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    revoke: (id) => call(`/api/journal-shares/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: {} }),
  };
}

export const SHARE_VIEW_MISSING = 'אין נתונים';
export const SHARE_VIEW_UNAVAILABLE = 'השירות אינו זמין זמנית. נסה שוב מאוחר יותר.';

// Public read. No Authorization header: the Worker accepts the token alone,
// and this call must not carry the viewer's session into the share body.
export async function fetchSharedJournal(token, { fetchFn = fetch, base = WORKER_BASE } = {}) {
  let res;
  try {
    res = await fetchFn(`${base}/api/journal-shares/view/${encodeURIComponent(token)}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { ok: false, unavailable: true };
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) return { ok: false, unavailable: false };
  if (!res.ok) return { ok: false, unavailable: true, message: typeof data.error === 'string' ? data.error : '' };
  const share = data.share && typeof data.share === 'object' ? data.share : {};
  return { ok: true, share, expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : '' };
}

export const journalShareClient = createJournalShareClient();
