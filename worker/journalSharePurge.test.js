import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeFields, sha256Hex } from './firestoreValues.js';
import { memoryFirestore } from './memoryFirestore.js';
import { handleJournalShare, NO_DATA, purgeUserJournalShares } from './journalShare.js';

const OWNER = 'uidOwner0001';
const VIEWER = 'uidViewer0001';
const OTHER = 'uidOther0001';
const EMAIL = 'viewer@example.com';
const ID1 = 'a'.repeat(32);
const ID2 = 'b'.repeat(32);
const ID3 = 'c'.repeat(32);
const HASH1 = 'd'.repeat(64);
const HASH2 = 'e'.repeat(64);
const HASH3 = 'f'.repeat(64);

function memoryKv(hooks = {}) {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      if (hooks.failGet?.(key)) throw new Error('get down');
      if (!store.has(key)) return null;
      const raw = store.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    async delete(key) {
      if (hooks.failDelete?.(key)) throw new Error('delete down');
      store.delete(key);
    },
    async list({ prefix, cursor } = {}) {
      if (hooks.failList?.(prefix)) throw new Error('list down');
      const names = [...store.keys()].filter((key) => !prefix || key.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const pageSize = hooks.pageSize || 50;
      const slice = names.slice(start, start + pageSize);
      const next = start + slice.length;
      const done = next >= names.length;
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: done,
        cursor: done ? undefined : String(next),
      };
    },
  };
}

async function seedShare(kv, { uid, id, tokenHash, email = EMAIL, viewerUid = null, audit = true }) {
  const emailHash = await sha256Hex(email);
  const share = {
    id,
    ownerUid: uid,
    journalId: 'j1',
    viewerUid,
    viewerEmail: email,
    pending: !viewerUid,
    tokenHash,
    fields: { trades: false, notes: false, emotions: false, balances: false, tradingView: false },
    status: 'active',
    expiresAt: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-06-15T12:00:00.000Z',
    updatedAt: '2026-06-15T12:00:00.000Z',
  };
  await kv.put(`jshare:${id}`, JSON.stringify(share));
  await kv.put(`jshare-tok:${tokenHash}`, id);
  await kv.put(`jshare-own:${uid}:${id}`, id);
  await kv.put(`jshare-mail:${emailHash}:${id}`, id);
  if (viewerUid) await kv.put(`jshare-to:${viewerUid}:${id}`, id);
  if (audit) await kv.put(`jshare-audit:${uid}:001:${id.slice(0, 4)}`, JSON.stringify({ ownerUid: uid, shareId: id }));
  return { emailHash, share };
}

describe('purgeUserJournalShares', () => {
  it('deletes owned share, token, invite and audit keys across pages, and leaves everyone else', async () => {
    const kv = memoryKv({ pageSize: 1 });
    const { emailHash } = await seedShare(kv, { uid: OWNER, id: ID1, tokenHash: HASH1, viewerUid: VIEWER });
    await seedShare(kv, { uid: OWNER, id: ID2, tokenHash: HASH2, viewerUid: VIEWER });
    await seedShare(kv, { uid: OTHER, id: ID3, tokenHash: HASH3, viewerUid: OWNER });
    await kv.put(`jshare-own:${OWNER}:not-an-id`, 'not-an-id');
    await kv.put('jshare:not-an-id', '{"keep":true}');
    await kv.put(`usettings:${OWNER}`, '{"journal":{"enabled":true}}');
    await kv.put(`jshare-own:${OWNER}x:${ID1}`, ID1);

    const logs = [];
    const result = await purgeUserJournalShares(kv, OWNER, (...parts) => logs.push(parts.join(' ')));

    expect(result).toEqual({ shares: 2, invites: 1, keys: 15, errors: 0 });
    expect(logs).toEqual([]);
    const left = [...kv.store.keys()].sort();
    expect(left).toEqual([
      `jshare-own:${OTHER}:${ID3}`,
      `jshare-own:${OWNER}x:${ID1}`,
      `jshare-audit:${OTHER}:001:${ID3.slice(0, 4)}`,
      `jshare-tok:${HASH3}`,
      `jshare:${ID3}`,
      'jshare:not-an-id',
      `usettings:${OWNER}`,
    ].sort());
    expect(kv.store.has(`jshare-mail:${emailHash}:${ID3}`)).toBe(false);
    expect(kv.store.has(`jshare-to:${OWNER}:${ID3}`)).toBe(false);
  });

  it('is idempotent when the account has nothing left', async () => {
    const kv = memoryKv({ pageSize: 1 });
    await seedShare(kv, { uid: OWNER, id: ID1, tokenHash: HASH1, viewerUid: VIEWER });
    const first = await purgeUserJournalShares(kv, OWNER, () => {});
    const second = await purgeUserJournalShares(kv, OWNER, () => {});
    expect(first.shares).toBe(1);
    expect(first.errors).toBe(0);
    expect(second).toEqual({ shares: 0, invites: 0, keys: 0, errors: 0 });
  });

  it('logs a KV failure and keeps deleting the rest', async () => {
    const kv = memoryKv({
      pageSize: 1,
      failList: (prefix) => prefix.startsWith(`jshare-own:${OWNER}:`),
      failDelete: (key) => key.startsWith('jshare-tok:'),
    });
    await seedShare(kv, { uid: OWNER, id: ID1, tokenHash: HASH1, viewerUid: VIEWER });
    const { emailHash } = await seedShare(kv, { uid: OTHER, id: ID3, tokenHash: HASH3, viewerUid: OWNER });
    const logs = [];
    const result = await purgeUserJournalShares(kv, OWNER, (...parts) => logs.push(parts.join(' ')));

    expect(result.errors).toBeGreaterThan(0);
    expect(logs.some((line) => line.includes('list down'))).toBe(true);
    expect(kv.store.has(`jshare:${ID1}`)).toBe(true);
    expect(kv.store.has(`jshare-tok:${HASH1}`)).toBe(true);
    expect(kv.store.has(`jshare-audit:${OWNER}:001:${ID1.slice(0, 4)}`)).toBe(false);
    expect(kv.store.has(`jshare-to:${OWNER}:${ID3}`)).toBe(false);
    expect(kv.store.has(`jshare-mail:${emailHash}:${ID3}`)).toBe(false);
    expect(kv.store.has(`jshare:${ID3}`)).toBe(true);
    expect(kv.store.has(`jshare-tok:${HASH3}`)).toBe(true);
    expect(logs.join('\n')).not.toContain(EMAIL);
  });

  it('still resolves when delete and the logger both throw', async () => {
    const kv = memoryKv({ failDelete: () => true });
    await seedShare(kv, { uid: OWNER, id: ID1, tokenHash: HASH1, viewerUid: VIEWER });
    const result = await purgeUserJournalShares(kv, OWNER, () => { throw new Error('log down'); });
    expect(result.errors).toBeGreaterThan(0);
    expect(result.shares).toBe(1);
    expect(kv.store.has(`jshare:${ID1}`)).toBe(true);
  });

  it('does nothing without a uid, and logs a missing kv without throwing', async () => {
    const logs = [];
    const log = (...parts) => logs.push(parts.join(' '));
    expect(await purgeUserJournalShares(null, '', log)).toEqual({ shares: 0, invites: 0, keys: 0, errors: 0 });
    expect(await purgeUserJournalShares(null, OWNER, log)).toEqual({ shares: 0, invites: 0, keys: 0, errors: 1 });
    expect(logs).toEqual([`journal share purge ${OWNER} kv unavailable`]);
  });

  it('drops a mismatched owner index and does not delete the other record', async () => {
    const kv = memoryKv();
    await seedShare(kv, { uid: OTHER, id: ID3, tokenHash: HASH3, viewerUid: VIEWER });
    await kv.put(`jshare-own:${OWNER}:${ID3}`, ID3);
    const result = await purgeUserJournalShares(kv, OWNER, () => {});
    expect(result.shares).toBe(0);
    expect(kv.store.has(`jshare-own:${OWNER}:${ID3}`)).toBe(false);
    expect(kv.store.has(`jshare:${ID3}`)).toBe(true);
    expect(kv.store.has(`jshare-tok:${HASH3}`)).toBe(true);
    expect(kv.store.has(`jshare-own:${OTHER}:${ID3}`)).toBe(true);
  });

  it('leaves a record that has no owner index (it cannot be found by uid)', async () => {
    const kv = memoryKv();
    const { emailHash } = await seedShare(kv, { uid: OWNER, id: ID1, tokenHash: HASH1, viewerUid: VIEWER });
    kv.store.delete(`jshare-own:${OWNER}:${ID1}`);
    const result = await purgeUserJournalShares(kv, OWNER, () => {});
    expect(result).toMatchObject({ shares: 0, invites: 0 });
    expect(kv.store.has(`jshare:${ID1}`)).toBe(true);
    expect(kv.store.has(`jshare-tok:${HASH1}`)).toBe(true);
    expect(kv.store.has(`jshare-mail:${emailHash}:${ID1}`)).toBe(true);
    expect(kv.store.has(`jshare-to:${VIEWER}:${ID1}`)).toBe(true);
  });

  it('removes invite keys that name this uid and leaves the owner link in place', async () => {
    const kv = memoryKv();
    const { emailHash } = await seedShare(kv, { uid: OTHER, id: ID3, tokenHash: HASH3, viewerUid: OWNER });
    const result = await purgeUserJournalShares(kv, OWNER, () => {});
    expect(result).toMatchObject({ shares: 0, invites: 1, errors: 0 });
    expect(kv.store.has(`jshare-to:${OWNER}:${ID3}`)).toBe(false);
    expect(kv.store.has(`jshare-mail:${emailHash}:${ID3}`)).toBe(false);
    expect(kv.store.has(`jshare:${ID3}`)).toBe(true);
    expect(kv.store.has(`jshare-tok:${HASH3}`)).toBe(true);
    expect(kv.store.has(`jshare-own:${OTHER}:${ID3}`)).toBe(true);
  });

  it('leaves an older invite mail key when there is no viewer index', async () => {
    const kv = memoryKv();
    const { emailHash } = await seedShare(kv, { uid: OTHER, id: ID3, tokenHash: HASH3, viewerUid: OWNER });
    kv.store.delete(`jshare-to:${OWNER}:${ID3}`);
    const result = await purgeUserJournalShares(kv, OWNER, () => {});
    expect(result.invites).toBe(0);
    expect(kv.store.has(`jshare-mail:${emailHash}:${ID3}`)).toBe(true);
    expect(kv.store.has(`jshare-tok:${HASH3}`)).toBe(true);
  });
});

const PROJECT = 'tradeos-test';
const NOW = Date.parse('2026-06-15T12:00:00.000Z');

function harness() {
  const db = memoryFirestore(PROJECT);
  db.put(`users/${OWNER}/journals/j1`, encodeFields({ initialBalance: 10 }));
  db.put(`users/${OTHER}/journals/j1`, encodeFields({ initialBalance: 20 }));
  const kv = memoryKv();
  const identities = {
    viewer: { uid: VIEWER, email: 'later@example.com', emailVerified: true },
  };
  const deps = {
    projectId: PROJECT,
    cors: {},
    fetchFn: db.fetchFn,
    verifyFirebaseToken: async (token) => identities[token]?.uid || ({ owner: OWNER, other: OTHER })[token] || null,
    identity: async (token) => identities[token] || null,
    getAdminToken: async () => 'admin-token',
    lookupAccountByEmail: async (email) => ({ 'viewer@example.com': VIEWER, 'later@example.com': null })[email] ?? null,
    durableBump: async () => 1,
    now: () => new Date(NOW),
  };
  const call = (path, { method = 'GET', token = 'owner', body } = {}) => handleJournalShare(
    new Request(`https://tradeos.test${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.9',
      },
      body: body == null ? undefined : JSON.stringify(body),
    }),
    { ALERTS_KV: kv },
    deps,
  );
  return { kv, call };
}

async function create(call, token, email) {
  const res = await call('/api/journal-shares', {
    method: 'POST',
    token,
    body: { journalId: 'j1', email, days: 7, fields: { trades: true } },
  });
  expect(res.status).toBe(200);
  return res.json();
}

describe('journal share purge against created rows', () => {
  it('writes a viewer index for a known account and on bind, and not while the invite is pending', async () => {
    const { kv, call } = harness();
    const known = await create(call, 'owner', 'viewer@example.com');
    const pending = await create(call, 'owner', 'later@example.com');
    expect([...kv.store.keys()].some((key) => key === `jshare-to:${VIEWER}:${known.share.id}`)).toBe(true);
    expect([...kv.store.keys()].some((key) => key.endsWith(`:${pending.share.id}`) && key.startsWith('jshare-to:'))).toBe(false);

    const bound = await call('/api/journal-shares/bind', { method: 'POST', token: 'viewer' });
    expect(bound.status).toBe(200);
    expect(kv.store.has(`jshare-to:${VIEWER}:${pending.share.id}`)).toBe(true);
  });

  it('stops the owner link after deletion and leaves the other owner', async () => {
    const { kv, call } = harness();
    const mine = await create(call, 'owner', 'viewer@example.com');
    const theirs = await create(call, 'other', 'viewer@example.com');
    const open = await call(`/api/journal-shares/view/${mine.token}`, { token: '' });
    expect(open.status).toBe(200);

    const asViewer = await purgeUserJournalShares(kv, VIEWER, () => {});
    expect(asViewer.invites).toBe(2);
    const still = await call(`/api/journal-shares/view/${mine.token}`, { token: '' });
    expect(still.status).toBe(200);
    expect([...kv.store.keys()].some((key) => key.startsWith(`jshare-to:${VIEWER}:`))).toBe(false);

    const asOwner = await purgeUserJournalShares(kv, OWNER, () => {});
    expect(asOwner.shares).toBeGreaterThan(0);
    const closed = await call(`/api/journal-shares/view/${mine.token}`, { token: '' });
    expect(closed.status).toBe(404);
    expect(await closed.json()).toEqual({ error: NO_DATA });
    const otherView = await call(`/api/journal-shares/view/${theirs.token}`, { token: '' });
    expect(otherView.status).toBe(200);
    const again = await purgeUserJournalShares(kv, OWNER, () => {});
    expect(again).toEqual({ shares: 0, invites: 0, keys: 0, errors: 0 });
    expect([...kv.store.keys()].some((key) => key.includes(OWNER))).toBe(false);
  });

  it('answers no data when the record cannot be read, as long as the record key is deleted', async () => {
    const { kv, call } = harness();
    const mine = await create(call, 'owner', 'viewer@example.com');
    const tokenKey = [...kv.store.keys()].find((key) => key.startsWith('jshare-tok:'));
    const realGet = kv.get.bind(kv);
    kv.get = async (key, type) => {
      if (typeof key === 'string' && key.startsWith('jshare:')) throw new Error('read down');
      return realGet(key, type);
    };
    const logs = [];
    const result = await purgeUserJournalShares(kv, OWNER, (...parts) => logs.push(parts.join(' ')));
    kv.get = realGet;
    expect(result.errors).toBeGreaterThan(0);
    expect(logs.some((line) => line.includes('read down'))).toBe(true);
    expect(logs.join('\n')).not.toContain('viewer@example.com');
    expect(kv.store.has(`jshare:${mine.share.id}`)).toBe(false);
    expect(kv.store.has(tokenKey)).toBe(true);
    const closed = await call(`/api/journal-shares/view/${mine.token}`, { token: '' });
    expect(closed.status).toBe(404);
    expect(await closed.json()).toEqual({ error: NO_DATA });
  });
});

describe('account deletion hook', () => {
  it('purges journal shares from purgeUserKv and does not let that throw fail the deletion', () => {
    const src = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
    const start = src.indexOf('async function purgeUserKv');
    const end = src.indexOf('const validExchangeId', start);
    const fn = src.slice(start, end);
    expect(fn).toContain('purgeUserJournalShares(env?.ALERTS_KV, uid)');
    expect(fn).toContain("console.error('journal share purge failed'");
  });
});
