import { describe, expect, it } from 'vitest';
import { fetchSharedJournal, SHARE_VIEW_MISSING } from './journalShareService';

function responder(status, body) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchFn, calls };
}

describe('fetchSharedJournal', () => {
  it('uses the token alone, does not send a session, and does not store the response', async () => {
    const { fetchFn, calls } = responder(200, {
      share: { journalId: 'j1', trades: [] },
      expiresAt: '2026-07-01T00:00:00.000Z',
    });
    const result = await fetchSharedJournal('ab'.repeat(32), { fetchFn, base: 'https://worker.test' });
    expect(result.ok).toBe(true);
    expect(result.share.journalId).toBe('j1');
    expect(calls[0].url).toBe(`https://worker.test/api/journal-shares/view/${'ab'.repeat(32)}`);
    expect(calls[0].init.cache).toBe('no-store');
    expect(calls[0].init.headers.Authorization).toBeUndefined();
  });

  it('maps revoked, expired and unknown links to the same missing result', async () => {
    for (const body of [
      { error: SHARE_VIEW_MISSING },
      { error: 'revoked' },
      { error: 'expired' },
      { error: 'not found' },
    ]) {
      const { fetchFn } = responder(404, body);
      const result = await fetchSharedJournal('tok', { fetchFn, base: 'https://worker.test' });
      expect(result).toEqual({ ok: false, unavailable: false });
    }
  });

  it('keeps an outage distinct from a dead link', async () => {
    const { fetchFn } = responder(503, { error: 'השירות אינו זמין זמנית. נסה שוב מאוחר יותר.' });
    const result = await fetchSharedJournal('tok', { fetchFn, base: 'https://worker.test' });
    expect(result.ok).toBe(false);
    expect(result.unavailable).toBe(true);
  });
});
