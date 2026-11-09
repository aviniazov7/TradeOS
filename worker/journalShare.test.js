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
  const identities = extra.identities || {};
  const bumps = [];
  const deps = {
    projectId: PROJECT,
    cors: { 'Access-Control-Allow-Origin': 'https://tradeos.test' },
    fetchFn: db.fetchFn,
    verifyFirebaseToken: async (token) => identities[token]?.uid || ({ owner: OWNER, other: OTHER })[token] || null,
    identity: async (token) => identities[token] || null,
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

function comparable(res, payload) {
  return {
    status: res.status,
    cache: res.headers.get('Cache-Control'),
    message: payload.message,
    root: Object.keys(payload).sort(),
    share: Object.keys(payload.share).sort(),
    shareStatus: payload.share.status,
    fields: payload.share.fields,
    journalId: payload.share.journalId,
    expiresAt: payload.share.expiresAt,
    token: /^[a-f0-9]{64}$/.test(payload.token),
    leaksUid: Object.hasOwn(payload.share, 'viewerUid') || Object.hasOwn(payload.share, 'pending'),
  };
}

function storedShare(kv, email) {
  for (const [key, value] of kv.store) {
    if (!key.startsWith('jshare:') || key.startsWith('jshare-')) continue;
    const row = JSON.parse(value);
    if (row.viewerEmail === email) return row;
  }
  return null;
}

describe('journal share worker', () => {
  it('gives a registered and an unregistered email the same response, and both links work', async () => {
    const { kv, call } = harness();
    const known = await createShare(call, { email: 'viewer@example.com' });
    const unknown = await createShare(call, { email: 'missing@example.com' });
    expect(comparable(known.res, known.payload)).toEqual(comparable(unknown.res, unknown.payload));
    expect(known.payload.message).toBe(SHARE_MESSAGE);
    expect(JSON.stringify(known.payload)).not.toMatch(/לא נמצא|אינו רשום|not found|pending/i);
    expect(JSON.stringify(unknown.payload)).not.toMatch(/לא נמצא|אינו רשום|not found|pending/i);

    const knownRow = storedShare(kv, 'viewer@example.com');
    const pendingRow = storedShare(kv, 'missing@example.com');
    expect(knownRow.viewerUid).toBe(VIEWER);
    expect(knownRow.pending).toBe(false);
    expect(pendingRow.viewerUid).toBeNull();
    expect(pendingRow.pending).toBe(true);
    expect(pendingRow.expiresAt).toBe(knownRow.expiresAt);

    const knownView = await (await call(`/api/journal-shares/view/${known.payload.token}`, { token: '' })).json();
    const pendingView = await (await call(`/api/journal-shares/view/${unknown.payload.token}`, { token: '' })).json();
    expect(pendingView).toEqual(knownView);
    expect(JSON.stringify(pendingView)).not.toContain(SECRET_NOTE);
    expect(JSON.stringify(pendingView)).not.toContain(SECRET_ADDRESS);
  });

  it('returns the same shape for the owner address and does not store a share', async () => {
    const { kv, call } = harness();
    const real = await createShare(call, { email: 'viewer@example.com' });
    const self = await createShare(call, { email: 'owner@example.com' });
    expect(comparable(self.res, self.payload).root).toEqual(comparable(real.res, real.payload).root);
    expect(self.payload.message).toBe(SHARE_MESSAGE);
    expect(storedShare(kv, 'owner@example.com')).toBeNull();
    const view = await call(`/api/journal-shares/view/${self.payload.token}`, { token: '' });
    expect(view.status).toBe(404);
    expect(await view.json()).toEqual({ error: NO_DATA });
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

  it('binds a pending share only when the verified email matches', async () => {
    const identities = {
      viewer: { uid: VIEWER, email: 'missing@example.com', emailVerified: true },
      lookalike: { uid: 'lookalikeuid123456789012345', email: 'missing+x@example.com', emailVerified: true },
      unverified: { uid: 'newuid12345678901234567890', email: 'missing@example.com', emailVerified: false },
    };
    const { kv, call } = harness({ identities });
    const { payload } = await createShare(call, { email: 'Missing@Example.com' });
    const before = storedShare(kv, 'missing@example.com').expiresAt;
    expect(storedShare(kv, 'missing@example.com').viewerUid).toBeNull();

    await call('/api/journal-shares/bind', { method: 'POST', token: 'lookalike' });
    await call('/api/journal-shares/bind', { method: 'POST', token: 'unverified' });
    expect(storedShare(kv, 'missing@example.com')).toMatchObject({ viewerUid: null, pending: true, expiresAt: before });

    const bound = await call('/api/journal-shares/bind', { method: 'POST', token: 'viewer' });
    expect(bound.status).toBe(200);
    expect(await bound.json()).toEqual({ ok: true });
    expect(storedShare(kv, 'missing@example.com')).toMatchObject({
      viewerUid: VIEWER, pending: false, expiresAt: before,
    });
    const view = await call(`/api/journal-shares/view/${payload.token}`, { token: '' });
    expect(view.status).toBe(200);
    expect(JSON.stringify(await view.json())).not.toContain(SECRET_NOTE);
  });

  it('never binds a pending share after it has expired', async () => {
    const identities = {
      viewer: { uid: VIEWER, email: 'later@example.com', emailVerified: true },
    };
    const { kv, clock, call } = harness({ identities });
    await createShare(call, { email: 'later@example.com' });
    clock.ms = NOW + 8 * 24 * 60 * 60 * 1000;
    await call('/api/journal-shares/bind', { method: 'POST', token: 'viewer' });
    expect(storedShare(kv, 'later@example.com')).toMatchObject({ viewerUid: null, pending: true });
    const row = storedShare(kv, 'later@example.com');
    expect(Date.parse(row.expiresAt)).toBe(NOW + 7 * 24 * 60 * 60 * 1000);
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
