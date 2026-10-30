import { describe, expect, it, vi } from 'vitest';
import {
  buildInboxMessage, classifyContact, contactDelivered, createAdminInboxDocument, inboxPreview,
} from './adminInbox.js';

describe('classifyContact', () => {
  it('keeps support messages as feedback', () => {
    expect(classifyContact('הגרף לא נטען אחרי רענון')).toEqual({ kind: 'feedback', type: 'feedback' });
  });

  it('files a premium purchase request as a system payment notice', () => {
    expect(classifyContact('בקשת רכישת Premium — מסלול חודשי (₪49).'))
      .toEqual({ kind: 'system', type: 'payment' });
  });
});

describe('contactDelivered', () => {
  it('succeeds from the mailbox alone — push is not a channel', () => {
    expect(contactDelivered({ inboxOk: true, emailOk: false })).toBe(true);
    expect(contactDelivered({ inboxOk: false, emailOk: true })).toBe(true);
    expect(contactDelivered({ inboxOk: false, emailOk: false })).toBe(false);
  });
});

describe('buildInboxMessage', () => {
  it('stores an unread, unarchived feedback row with a short preview', () => {
    const now = new Date('2026-10-30T10:00:00Z');
    const doc = buildInboxMessage({
      kind: 'feedback',
      type: 'feedback',
      title: 'משוב מ-דנה',
      body: 'א'.repeat(200),
      userId: 'u1',
      userName: 'דנה',
      userEmail: 'dana@example.com',
      source: 'contact',
    }, now);
    expect(doc.read).toBe(false);
    expect(doc.archived).toBe(false);
    expect(doc.createdAt).toBe(now);
    expect(doc.preview.length).toBeLessThanOrEqual(140);
    expect(doc.preview.endsWith('…')).toBe(true);
    expect(doc.userId).toBe('u1');
  });

  it('rejects an empty body', () => {
    expect(() => buildInboxMessage({ title: 'כותרת', body: '  ' })).toThrow(/title and a body/);
  });
});

describe('inboxPreview', () => {
  it('collapses whitespace', () => {
    expect(inboxPreview('שורה\nשנייה')).toBe('שורה שנייה');
  });
});

describe('createAdminInboxDocument', () => {
  it('posts a Firestore document and does not describe a push', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const result = await createAdminInboxDocument({
      fetchFn,
      base: 'https://firestore.example/v1',
      token: 'admin-token',
      now: new Date('2026-10-30T10:00:00Z'),
      message: {
        kind: 'system',
        type: 'churn',
        title: 'לקוח בסיכון נטישה',
        body: 'דנה לא נכנסה 9 ימים',
        userId: 'u1',
        userName: 'דנה',
        source: 'churn',
      },
    });
    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://firestore.example/v1/documents/adminInbox');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer admin-token');
    const fields = JSON.parse(init.body).fields;
    expect(fields.kind).toEqual({ stringValue: 'system' });
    expect(fields.type).toEqual({ stringValue: 'churn' });
    expect(fields.read).toEqual({ booleanValue: false });
    expect(fields.archived).toEqual({ booleanValue: false });
    expect(fields.createdAt.timestampValue).toBe('2026-10-30T10:00:00.000Z');
    expect(JSON.stringify(fields)).not.toMatch(/push|subscription/i);
  });
});
