// Admin mailbox documents. Pure builders plus the Firestore REST create the
// Worker uses. Feedback, churn, the weekly digest, coupon redemptions and
// purchase requests land here — never on the trade Web Push channel.
import { encodeFields } from './firestoreValues.js';

export const INBOX_COLLECTION = 'adminInbox';

const TYPES = new Set(['feedback', 'churn', 'digest', 'coupon', 'signup', 'payment', 'error', 'system']);

export function inboxPreview(body, max = 140) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

// Purchase requests share the /contact endpoint with support messages.
// They belong with system notices; everything else is feedback.
export function classifyContact(message) {
  const text = String(message || '').trim();
  if (text.startsWith('בקשת רכישת Premium')) return { kind: 'system', type: 'payment' };
  return { kind: 'feedback', type: 'feedback' };
}

// A contact attempt succeeded once the mailbox or the email copy landed.
// Push is not a delivery channel for these messages.
export function contactDelivered({ inboxOk = false, emailOk = false } = {}) {
  return !!(inboxOk || emailOk);
}

export function buildInboxMessage(input, now = new Date()) {
  const kind = input?.kind === 'system' ? 'system' : 'feedback';
  const requested = String(input?.type || '').slice(0, 40);
  const type = TYPES.has(requested) ? requested : (kind === 'system' ? 'system' : 'feedback');
  const title = String(input?.title || '').trim().slice(0, 160);
  const body = String(input?.body || '').trim().slice(0, 4000);
  if (!title || !body) {
    const err = new Error('inbox message needs a title and a body');
    err.code = 'invalid-inbox';
    throw err;
  }
  const createdAt = input?.createdAt instanceof Date ? input.createdAt : now;
  return {
    kind,
    type,
    title,
    body,
    preview: inboxPreview(input?.preview || body),
    userId: input?.userId ? String(input.userId).slice(0, 128) : null,
    userName: input?.userName ? String(input.userName).trim().slice(0, 120) : null,
    userEmail: input?.userEmail ? String(input.userEmail).trim().slice(0, 200) : null,
    source: String(input?.source || 'worker').slice(0, 40),
    read: false,
    archived: false,
    readAt: null,
    archivedAt: null,
    createdAt,
  };
}

export async function createAdminInboxDocument({ fetchFn, base, token, message, now }) {
  const doc = buildInboxMessage(message, now);
  const res = await fetchFn(`${String(base).replace(/\/$/, '')}/documents/${INBOX_COLLECTION}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: encodeFields(doc) }),
  });
  return { ok: !!res?.ok, status: res?.status ?? 0 };
}
