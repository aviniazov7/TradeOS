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

export const journalShareClient = createJournalShareClient();
