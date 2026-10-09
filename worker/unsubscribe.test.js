import { describe, it, expect } from 'vitest';
import { unsubscribeToken, verifyUnsubscribe, unsubscribeUrl, unsubscribePage } from './unsubscribe';

const SECRET = 'test-secret-value';
const UID = 'AbC123xyz987QWERTY';

describe('unsubscribe tokens', () => {
  it('is deterministic and uid-specific', async () => {
    const a = await unsubscribeToken(SECRET, UID);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await unsubscribeToken(SECRET, UID)).toBe(a);
    expect(await unsubscribeToken(SECRET, 'OtherUid123456789')).not.toBe(a);
    expect(await unsubscribeToken('another-secret', UID)).not.toBe(a);
  });

  it('verifies only the matching uid + token', async () => {
    const t = await unsubscribeToken(SECRET, UID);
    expect(await verifyUnsubscribe(SECRET, UID, t)).toBe(true);
    expect(await verifyUnsubscribe(SECRET, 'OtherUid123456789', t)).toBe(false);
    expect(await verifyUnsubscribe(SECRET, UID, t.replace(/.$/, (c) => (c === '0' ? '1' : '0')))).toBe(false);
    expect(await verifyUnsubscribe(SECRET, UID, '')).toBe(false);
    expect(await verifyUnsubscribe('wrong', UID, t)).toBe(false);
  });

  it('refuses to sign without a secret or with a malformed uid', async () => {
    expect(await unsubscribeToken('', UID)).toBeNull();
    expect(await unsubscribeToken(undefined, UID)).toBeNull();
    expect(await unsubscribeToken(SECRET, 'short')).toBeNull();
    expect(await unsubscribeToken(SECRET, 'bad/uid/with/slashes')).toBeNull();
    expect(await verifyUnsubscribe('', UID, 'x')).toBe(false);
  });

  it('builds a link on the worker that round-trips', async () => {
    const url = await unsubscribeUrl('https://w.example', SECRET, UID);
    const u = new URL(url);
    expect(u.pathname).toBe('/email/unsubscribe');
    expect(await verifyUnsubscribe(SECRET, u.searchParams.get('u'), u.searchParams.get('t'))).toBe(true);
    expect(await unsubscribeUrl('https://w.example', '', UID)).toBeNull();
  });
});

describe('unsubscribePage', () => {
  it('renders both outcomes in Hebrew RTL', () => {
    expect(unsubscribePage(true)).toContain('הוסרת מרשימת התפוצה');
    expect(unsubscribePage(false)).toContain('הקישור לא תקין');
    expect(unsubscribePage(true)).toContain('dir="rtl"');
  });
});
