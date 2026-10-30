// View model for the admin mailbox. No Firebase. The Worker writes
// adminInbox docs; Cloud Functions still write signup / premium events into
// adminNotifications. Both show up in one list.

export const OPERATIONAL_NOTICE_TYPES = ['signup', 'premium_upgrade', 'premium_cancel'];

const OPERATIONAL = new Set(OPERATIONAL_NOTICE_TYPES);

export const INBOX_TYPE_LABELS = {
  feedback: 'משוב',
  churn: 'נטישה',
  digest: 'דוח שבועי',
  coupon: 'קופון',
  signup: 'הרשמה',
  payment: 'תשלום',
  error: 'שגיאה',
  system: 'מערכת',
  premium_upgrade: 'שדרוג',
  premium_cancel: 'ביטול מנוי',
};

export function inboxPreview(body, max = 140) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

export function inboxCreatedMs(value) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime() || 0;
  if (typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date ? d.getTime() || 0 : 0;
  }
  if (typeof value === 'object') {
    const s = value.seconds ?? value._seconds;
    if (typeof s === 'number') return s * 1000;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function inboxDocToItem(doc) {
  if (!doc?.id) return null;
  const kind = doc.kind === 'system' ? 'system' : 'feedback';
  const body = String(doc.body || '');
  return {
    id: `inbox:${doc.id}`,
    ref: { store: 'adminInbox', id: doc.id },
    kind,
    type: doc.type || (kind === 'system' ? 'system' : 'feedback'),
    title: doc.title || INBOX_TYPE_LABELS[doc.type] || 'הודעה',
    body,
    preview: doc.preview || inboxPreview(body || doc.title),
    userId: doc.userId || null,
    userName: doc.userName || null,
    userEmail: doc.userEmail || null,
    read: doc.read === true,
    archived: doc.archived === true,
    createdAt: doc.createdAt ?? null,
  };
}

export function noticeToInboxItem(note) {
  if (!note?.id || !OPERATIONAL.has(note.type)) return null;
  const type = note.type === 'signup' ? 'signup' : 'payment';
  const body = String(note.body || '');
  return {
    id: `notif:${note.id}`,
    ref: { store: 'adminNotifications', id: note.id },
    kind: 'system',
    type,
    subtype: note.type,
    title: note.title || INBOX_TYPE_LABELS[note.type] || 'הודעת מערכת',
    body,
    preview: inboxPreview(body || note.title),
    userId: note.userId || null,
    userName: note.userName || null,
    userEmail: note.userEmail || null,
    read: note.read === true,
    archived: note.archived === true,
    createdAt: note.createdAt ?? null,
  };
}

export function mergeInbox(inboxDocs, notices) {
  const items = [];
  for (const doc of inboxDocs || []) {
    const item = inboxDocToItem(doc);
    if (item) items.push(item);
  }
  for (const note of notices || []) {
    const item = noticeToInboxItem(note);
    if (item) items.push(item);
  }
  items.sort((a, b) => inboxCreatedMs(b.createdAt) - inboxCreatedMs(a.createdAt));
  return items;
}

export function filterInbox(items, { kind, archived = false } = {}) {
  return (items || []).filter((item) => item.kind === kind && item.archived === archived);
}

export function unreadInboxCount(items) {
  return (items || []).filter((item) => !item.read && !item.archived).length;
}

export function unreadByKind(items, kind) {
  return (items || []).filter((item) => item.kind === kind && !item.read && !item.archived).length;
}
