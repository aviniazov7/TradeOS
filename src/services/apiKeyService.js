import { auth } from './firebase';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

async function authHeaders() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('נדרשת התחברות');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'הבקשה נכשלה');
  return data;
}

/** Create a key. The full secret is only in this response. */
export async function createApiKey(name) {
  const res = await fetch(`${WORKER_BASE}/api/v1/keys`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ name: name || '' }),
  });
  return parse(res);
}

/** Revoke a key. The hash index is removed server-side. */
export async function revokeApiKey(id) {
  const res = await fetch(`${WORKER_BASE}/api/v1/keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  return parse(res);
}
