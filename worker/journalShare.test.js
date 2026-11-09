import { describe, expect, it } from 'vitest';
import { encodeFields } from './firestoreValues.js';
import { memoryFirestore } from './memoryFirestore.js';
import {
  SHARE_MESSAGE, NO_DATA, endOfJerusalemDay, handleJournalShare,
} from './journalShare.js';

const PROJECT = 'tradeos-test';
const OWNER = 'owneruid123456789012345678';
const OTHER = 'otheruid123456789012345678';
const VIEWER = 'vieweruid12345678901234567';
const SECRET_NOTE = 'SECRET-NOTE';
const SECRET_LINK = 'https://www.tradingview.com/chart/SECRET-LINK';
const SECRET_ADDRESS = '0xSECRETADDRESS';
const LIVE_BALANCE = 99999;
const OPENING = 424242;
const NOW = Date.parse('2026-06-15T12:00:00.000Z');

function memoryKv() {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      if (!store.has(key)) return null;
      const raw = store.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key, value) { store.set(key, String(value)); },
    async delete(key) { store.delete(key); },
    async list({ prefix } = {}) {
      const keys = [...store.keys()].filter((key) => !prefix || key.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

function seedJournal(db) {
  db.put(`users/${OWNER}/journals/j1`, encodeFields({
    initialBalance: OPENING,
    liveBalance: LIVE_BALANCE,
    exchangeAddress: SECRET_ADDRESS,
    propFirm: { accountSize: 515151, apiKey: 'tos_secret' },
  }));
  db.put(`users/${OWNER}/trades/t1`, encodeFields({
    journalId: 'j1',
    pair: 'BTCUSDT',
    direction: 'long',
    status: 'closed',
    result: 'loss',
    netPnl: -50,
    pnl: -49,
    notes: SECRET_NOTE,
    entryReason: 'SECRET-REASON',
    emotionBefore: 'SECRET-FEAR',
    tradingViewUrls: [SECRET_LINK],
    apiKey: 'tos_on_trade',
    address: SECRET_ADDRESS,
  }));
  db.put(`users/${OWNER}/trades/t2`, encodeFields({
    journalId: 'j2',
    pair: 'ETHUSDT',
    direction: 'short',
    status: 'closed',
    result: 'loss',
    netPnl: -1000,
    notes: 'FOREIGN-NOTE',
  }));
}

function harness(extra = {}) {
  const db = memoryFirestore(PROJECT);
  seedJournal(db);
  const kv = memoryKv();
  const clock = { ms: NOW };
  const accounts = new Map([
    ['viewer@example.com', VIEWER],
    ['owner@example.com', OWNER],
    ...(extra.accounts || []),
  ]);
  const bumps = [];
  const deps = {
    projectId: PROJECT,
    cors: { 'Access-Control-Allow-Origin': 'https://tradeos.test' },
    fetchFn: db.fetchFn,
    verifyFirebaseToken: async (token) => ({ owner: OWNER, other: OTHER })[token] || null,
    getAdminToken: async () => 'admin-token',
    lookupAccountByEmail: async (email) => (accounts.has(email) ? accounts.get(email) : null),
    durableBump: async (objectName, key) => {
      bumps.push({ objectName, key });
      if (extra.bump === 'down') return null;
      if (extra.bump === 'hot' && key === 'jshare:write') return 31;
      return 1;
    },
    now: () => new Date(clock.ms),
    ...extra.deps,
  };
  const env = { ALERTS_KV: kv };
  const call = (path, { method = 'GET', token = 'owner', body, headers = {} } = {}) => handleJournalShare(
    new Request(`https://tradeos.test${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.8',
        ...headers,
      },
      body: body == null ? undefined : JSON.stringify(body),
    }),
    env,
    deps,
  );
  return { db, kv, clock, bumps, call };
}

async function createShare(call, body = {}) {
  const res = await call('/api/journal-shares', {
    method: 'POST',
    body: { journalId: 'j1', email: 'viewer@example.com', days: 7, fields: { trades: true }, ...body },
  });
  const payload = await res.json();
  return { res, payload };
}

describe('journal share worker', () => {
  it('answers a missing account with the generic sentence and stores nothing', async () => {
    const { kv, call } = harness();
    const { res, payload } = await createShare(call, { email: 'missing@example.com' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(payload).toEqual({ ok: true, message: SHARE_MESSAGE });
    expect(JSON.stringify(payload)).not.toMatch(/לא נמצא|אינו רשום|not found|missing@example.com/i);
    expect([...kv.store.keys()].some((key) => key.startsWith('jshare:'))).toBe(false);
  });

  it('does not reveal the owner address either, and keeps the same sentence', async () => {
    const { call } = harness();
    const { payload } = await createShare(call, { email: 'owner@example.com' });
    expect(payload).toEqual({ ok: true, message: SHARE_MESSAGE });
  });

  it('creates a share for a real account, audits only the owner, and filters the viewer copy', async () => {
    const { kv, call } = harness();
    const { res, payload } = await createShare(call);
    expect(res.status).toBe(200);
    expect(payload.message).toBe(SHARE_MESSAGE);
    expect(payload.token).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.share).toMatchObject({
      journalId: 'j1',
      viewerEmail: 'viewer@example.com',
      status: 'active',
      fields: { trades: true, notes: false, emotions: false, balances: false, tradingView: false },
    });
    expect(payload.share.viewerUid).toBeUndefined();
    expect(payload.share.tokenHash).toBeUndefined();
    expect([...kv.store.values()].some((value) => value.includes(payload.token))).toBe(false);
    const audit = [...kv.store.keys()].filter((key) => key.startsWith(`jshare-audit:${OWNER}:`));
    expect(audit).toHaveLength(1);
    expect([...kv.store.keys()].some((key) => key.startsWith('audit:'))).toBe(false);
    const auditBody = JSON.parse(kv.store.get(audit[0]));
    expect(auditBody).toMatchObject({ ownerUid: OWNER, action: 'create', journalId: 'j1' });
    expect(JSON.stringify(auditBody)).not.toContain('viewer@example.com');

    const view = await call(`/api/journal-shares/view/${payload.token}`, { token: '' });
    expect(view.status).toBe(200);
    expect(view.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await view.json();
    expect(body.share.trades.map((row) => row.pair)).toEqual(['BTCUSDT']);
    expect(body.share.stats.net).toBe(-50);
    const text = JSON.stringify(body);
    expect(text).not.toContain(SECRET_NOTE);
    expect(text).not.toContain('SECRET-FEAR');
    expect(text).not.toContain(SECRET_LINK);
    expect(text).not.toContain(SECRET_ADDRESS);
    expect(text).not.toContain('FOREIGN-NOTE');
    expect(text).not.toContain('ETHUSDT');
    expect(text).not.toContain(String(LIVE_BALANCE));
    expect(text).not.toContain(String(OPENING));
    expect(text).not.toContain('tos_secret');
  });

  it('returns no trade fields when trades are off, and no data after revoke or expiry', async () => {
    const { clock, call } = harness();
    const hidden = await createShare(call, { fields: {} });
    const quiet = await call(`/api/journal-shares/view/${hidden.payload.token}`, { token: '' });
    expect(await quiet.json()).toEqual({
      share: { journalId: 'j1' },
      expiresAt: hidden.payload.share.expiresAt,
    });

    const { payload } = await createShare(call);
    const revoked = await call(`/api/journal-shares/${payload.share.id}/revoke`, { method: 'POST' });
    expect(revoked.status).toBe(200);
    const afterRevoke = await call(`/api/journal-shares/view/${payload.token}`, { token: '' });
    expect(afterRevoke.status).toBe(404);
    expect(await afterRevoke.json()).toEqual({ error: NO_DATA });
    expect(afterRevoke.headers.get('Cache-Control')).toBe('private, no-store');

    const second = await createShare(call);
    clock.ms = NOW + 8 * 24 * 60 * 60 * 1000;
    const expired = await call(`/api/journal-shares/view/${second.payload.token}`, { token: '' });
    expect(expired.status).toBe(404);
    expect(await expired.json()).toEqual({ error: NO_DATA });
    const junk = await call('/api/journal-shares/view/abcd', { token: '' });
    expect(await junk.json()).toEqual({ error: NO_DATA });
  });

  it('extends by 30 days or a manual Jerusalem date, and lists only the owner', async () => {
    const { kv, call } = harness();
    const { payload } = await createShare(call);
    const extended = await call(`/api/journal-shares/${payload.share.id}`, {
      method: 'PATCH',
      body: { days: 30 },
    });
    expect(extended.status).toBe(200);
    const extendedBody = await extended.json();
    expect(Date.parse(extendedBody.share.expiresAt)).toBe(NOW + 30 * 24 * 60 * 60 * 1000);

    const manual = await call(`/api/journal-shares/${payload.share.id}`, {
      method: 'PATCH',
      body: { expiresOn: '2026-06-20' },
    });
    expect(Date.parse((await manual.json()).share.expiresAt)).toBe(endOfJerusalemDay('2026-06-20'));

    const stranger = await call('/api/journal-shares', { token: 'other' });
    expect(await stranger.json()).toEqual({ shares: [] });
    const mine = await call('/api/journal-shares');
    const listed = await mine.json();
    expect(listed.shares).toHaveLength(1);
    expect(listed.shares[0].id).toBe(payload.share.id);
    expect(JSON.stringify(listed)).not.toContain(payload.token);
    expect([...kv.store.keys()].some((key) => key.startsWith(`jshare-own:${OTHER}:`))).toBe(false);
  });

  it('rejects an open-ended share, a bad range, and another owner', async () => {
    const { call } = harness();
    const missing = await createShare(call, { days: undefined, expiresOn: undefined });
    expect(missing.res.status).toBe(400);
    const both = await createShare(call, { days: 7, expiresOn: '2026-06-20' });
    expect(both.res.status).toBe(400);
    const odd = await createShare(call, { days: 14 });
    expect(odd.res.status).toBe(400);
    const { payload } = await createShare(call);
    const stolen = await call(`/api/journal-shares/${payload.share.id}/revoke`, { method: 'POST', token: 'other' });
    expect(stolen.status).toBe(404);
    expect(await stolen.json()).toEqual({ error: NO_DATA });
    const anon = await call('/api/journal-shares', { method: 'POST', token: '', body: { journalId: 'j1', email: 'viewer@example.com', days: 7 } });
    expect(anon.status).toBe(401);
  });

  it('stops when the durable counter is hot or unavailable, and does not write', async () => {
    const hot = harness({ bump: 'hot' });
    const limited = await createShare(hot.call);
    expect(limited.res.status).toBe(429);
    expect([...hot.kv.store.keys()]).toEqual([]);

    const down = harness({ bump: 'down' });
    const unavailable = await createShare(down.call);
    expect(unavailable.res.status).toBe(503);
    expect([...down.kv.store.keys()]).toEqual([]);
    expect(down.bumps[0].key).toBe('jshare:write');
  });
});
