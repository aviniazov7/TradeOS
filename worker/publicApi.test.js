import { describe, expect, it } from 'vitest';
import { handlePublicApi } from './publicApi.js';
import { decodeFields } from './firestoreValues.js';
import { memoryFirestore } from './memoryFirestore.js';

const PROJECT = 'p';
const UID = 'user1';

function memoryDb() {
  return memoryFirestore(PROJECT);
}

function deps(db, extra = {}) {
  return {
    projectId: PROJECT,
    cors: { 'Access-Control-Allow-Origin': 'https://tradeoslive.web.app' },
    fetchFn: db.fetchFn,
    verifyFirebaseToken: async (token) => (token === 'firebase-good' ? UID : null),
    getAdminToken: async () => 'admin',
    rateLimit: async () => ({ count: 1 }),
    now: () => new Date('2026-06-15T12:00:00.000Z'),
    ...extra,
  };
}

function call(path, { method = 'GET', token = 'firebase-good', body, headers = {}, db, extra } = {}) {
  const req = new Request(`https://trade-os.example${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return handlePublicApi(req, {}, deps(db, extra));
}

const tradeBody = {
  journalId: 'j1',
  pair: 'BTCUSDT',
  direction: 'long',
  entryPrice: 100,
  exitPrice: 110,
  quantity: 2,
  stopLoss: 90,
  leverage: 10,
  fees: 1,
  riskAmount: 0,
};

describe('public API v1', () => {
  it('rejects missing and unknown credentials', async () => {
    const db = memoryDb();
    const anon = await handlePublicApi(new Request('https://x/api/v1/trades'), {}, deps(db));
    expect(anon.status).toBe(401);
    const bad = await call('/api/v1/trades', { db, token: 'nope' });
    expect(bad.status).toBe(401);
  });

  it('writes a trade with the journal derived fields and a real risk amount', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { initialBalance: { doubleValue: 1000 } });
    const res = await call('/api/v1/trades', { method: 'POST', db, body: tradeBody });
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.id).toBeTruthy();
    expect(payload.trade).toMatchObject({
      journalId: 'j1',
      pair: 'BTCUSDT',
      pnl: 20,
      netPnl: 19,
      result: 'win',
      positionSize: 200,
      margin: 20,
      riskAmount: 20,
      assetClass: 'crypto',
      source: 'manual',
    });
    expect(payload.trade.pnlPercent).toBe(100);
    const stored = [...db.docs.keys()].find((key) => key.startsWith('users/user1/trades/'));
    const fields = decodeFields(db.docs.get(stored));
    expect(fields.riskAmount).toBe(20);
    expect(fields.entryDate).toBe(payload.trade.entryDate);
  });

  it('replays an Idempotency-Key instead of writing a second trade', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { initialBalance: { doubleValue: 1000 } });
    const first = await call('/api/v1/trades', {
      method: 'POST', db, body: tradeBody, headers: { 'Idempotency-Key': 'agent-retry-1' },
    });
    const second = await call('/api/v1/trades', {
      method: 'POST', db, body: { ...tradeBody, pair: 'ETHUSDT' }, headers: { 'Idempotency-Key': 'agent-retry-1' },
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const a = await first.json();
    const b = await second.json();
    expect(b.idempotentReplay).toBe(true);
    expect(b.id).toBe(a.id);
    expect(b.trade.pair).toBe('BTCUSDT');
    expect([...db.docs.keys()].filter((key) => key.startsWith('users/user1/trades/'))).toHaveLength(1);
  });

  it('lists trades newest first, with a stable cursor and an ascending option', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { name: { stringValue: 'Main' }, exchange: { stringValue: 'MEXC' } });
    const row = (id, entryDate, extra = {}) => db.put(`users/user1/trades/${id}`, {
      journalId: { stringValue: 'j1' }, pair: { stringValue: 'BTCUSDT' }, direction: { stringValue: 'long' },
      status: { stringValue: 'closed' }, entryDate: { timestampValue: entryDate },
      ...extra,
    });
    row('a', '2026-06-02T00:00:00.000Z');
    row('m', '2026-06-02T00:00:00.000Z');
    row('b', '2026-06-01T00:00:00.000Z', { pair: { stringValue: 'ETHUSDT' }, direction: { stringValue: 'short' } });
    db.put('users/user1/trades/c', {
      journalId: { stringValue: 'other' }, pair: { stringValue: 'BTCUSDT' }, direction: { stringValue: 'long' },
      status: { stringValue: 'closed' }, entryDate: { timestampValue: '2026-06-03T00:00:00.000Z' },
    });
    db.put('users/user1/trades/nodate', {
      journalId: { stringValue: 'j1' }, pair: { stringValue: 'BTCUSDT' }, direction: { stringValue: 'long' },
      status: { stringValue: 'closed' },
    });

    const res = await call('/api/v1/trades?journalId=j1&status=closed&limit=1', { db });
    expect(res.status).toBe(200);
    const page = await res.json();
    expect(page.trades.map((t) => t.id)).toEqual(['m']);
    expect(page.nextCursor).toBeTruthy();
    const firstQuery = JSON.parse(db.fetchFn.mock.calls.find((c) => String(c[0]).includes(':runQuery'))[1].body).structuredQuery;
    expect(firstQuery.orderBy).toEqual([
      { field: { fieldPath: 'entryDate' }, direction: 'DESCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
    ]);

    const next = await call(`/api/v1/trades?journalId=j1&status=closed&limit=1&cursor=${encodeURIComponent(page.nextCursor)}`, { db });
    const second = await next.json();
    expect(second.trades.map((t) => t.id)).toEqual(['a']);
    const resume = JSON.parse(db.fetchFn.mock.calls.filter((c) => String(c[0]).includes(':runQuery')).at(-1)[1].body).structuredQuery;
    expect(resume.startAt).toEqual({
      values: [
        { timestampValue: '2026-06-02T00:00:00.000Z' },
        { referenceValue: 'projects/p/databases/(default)/documents/users/user1/trades/m' },
      ],
      before: false,
    });
    const last = await call(`/api/v1/trades?journalId=j1&status=closed&limit=10&cursor=${encodeURIComponent(second.nextCursor)}`, { db });
    const tail = await last.json();
    expect(tail.trades.map((t) => t.id)).toEqual(['b']);
    expect(tail.nextCursor).toBeNull();

    const asc = await call('/api/v1/trades?journalId=j1&status=closed&order=asc&limit=10', { db });
    expect((await asc.json()).trades.map((t) => t.id)).toEqual(['b', 'a', 'm']);
    const flipped = await call(`/api/v1/trades?journalId=j1&status=closed&order=asc&cursor=${encodeURIComponent(page.nextCursor)}`, { db });
    expect(flipped.status).toBe(400);
    const badOrder = await call('/api/v1/trades?order=newest', { db });
    expect(badOrder.status).toBe(400);
  });

  it('computes stats from the account balance and derived risk', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { initialBalance: { integerValue: '1000' } });
    const closed = (id, pair, net, size) => db.put(`users/user1/trades/${id}`, {
      journalId: { stringValue: 'j1' },
      pair: { stringValue: pair },
      direction: { stringValue: 'long' },
      status: { stringValue: 'closed' },
      result: { stringValue: net >= 0 ? 'win' : 'loss' },
      entryPrice: { doubleValue: 100 },
      exitPrice: { doubleValue: net >= 0 ? 110 : 90 },
      quantity: { doubleValue: size / 100 },
      positionSize: { doubleValue: size },
      stopLoss: { doubleValue: 90 },
      originalStopLoss: { doubleValue: 90 },
      riskAmount: { doubleValue: 0 },
      leverage: { doubleValue: 10 },
      fees: { doubleValue: 0 },
      pnl: { doubleValue: net },
      netPnl: { doubleValue: net },
      entryDate: { timestampValue: '2026-06-01T10:00:00.000Z' },
      exitDate: { timestampValue: '2026-06-01T12:00:00.000Z' },
    });
    closed('w', 'BTCUSDT', 20, 200);
    closed('l', 'ETHUSDT', -50, 500);
    const res = await call('/api/v1/stats?journalId=j1', { db });
    expect(res.status).toBe(200);
    const statsQuery = JSON.parse(db.fetchFn.mock.calls.find((c) => String(c[0]).includes(':runQuery'))[1].body).structuredQuery;
    expect(statsQuery.orderBy).toEqual([{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]);
    const stats = await res.json();
    expect(stats.totalPnl).toBe(-30);
    expect(stats.startBalance).toBe(1000);
    expect(stats.currentBalance).toBe(970);
    expect(stats.returnPercent).toBeCloseTo(-3);
    expect(stats.riskAmount).toBe(70);
    expect(stats.counts).toMatchObject({ wins: 1, losses: 1, breakeven: 0, closed: 2 });
    expect(stats.profitFactor).toBeCloseTo(0.4);
    expect(stats.expectancy).toBe(-15);
    expect(stats.avgR).toBeCloseTo(0);
    expect(stats.maxDrawdown).toBeGreaterThan(0);
  });

  it('does not report a return percent for a dust opening balance', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { initialBalance: { doubleValue: 1e-8 } });
    db.put('users/user1/trades/a', {
      journalId: { stringValue: 'j1' },
      pair: { stringValue: 'DOGEUSDT' },
      direction: { stringValue: 'long' },
      status: { stringValue: 'closed' },
      result: { stringValue: 'loss' },
      netPnl: { doubleValue: -11.2239 },
      pnl: { doubleValue: -11.2239 },
      entryDate: { timestampValue: '2026-10-16T00:00:00.000Z' },
      exitDate: { timestampValue: '2026-10-16T01:00:00.000Z' },
    });
    const res = await call('/api/v1/stats?journalId=j1', { db });
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.totalPnl).toBeCloseTo(-11.2239, 4);
    expect(stats.returnPercent).toBeNull();
  });

  it('mints a key once, accepts it on the API, and rejects it after revoke', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { initialBalance: { doubleValue: 1000 } });
    db.put('users/user1/trades/a', {
      journalId: { stringValue: 'j1' }, pair: { stringValue: 'BTCUSDT' }, status: { stringValue: 'open' },
      direction: { stringValue: 'long' }, entryDate: { timestampValue: '2026-06-01T00:00:00.000Z' },
    });
    const minted = await call('/api/v1/keys', { method: 'POST', db, body: { name: 'Agent' } });
    expect(minted.status).toBe(201);
    const key = await minted.json();
    expect(key.key.startsWith('tos_')).toBe(true);
    expect(key.prefix).toBe(key.key.slice(0, 12));
    const listed = await call('/api/v1/trades?journalId=j1', { db, token: key.key });
    expect(listed.status).toBe(200);
    expect((await listed.json()).trades).toHaveLength(1);
    const again = await call('/api/v1/keys', { method: 'POST', db, token: key.key, body: {} });
    expect(again.status).toBe(403);
    const revoked = await call(`/api/v1/keys/${key.id}`, { method: 'DELETE', db });
    expect(revoked.status).toBe(200);
    const after = await call('/api/v1/trades?journalId=j1', { db, token: key.key });
    expect(after.status).toBe(401);
  });

  it('lists the caller\'s journals and selects one by id or name', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j-bybit', {
      name: { stringValue: 'Bybit' }, exchange: { stringValue: 'bybit' },
      assetClass: { stringValue: 'crypto' }, currency: { stringValue: 'USDT' },
      initialBalance: { doubleValue: 500 }, archived: { booleanValue: false },
    });
    db.put('users/user1/journals/mexc', {
      name: { stringValue: 'MEXC' }, exchange: { stringValue: 'MEXC' },
      assetClass: { stringValue: 'crypto' }, currency: { stringValue: 'USDT' },
      initialBalance: { doubleValue: 1000 }, starred: { booleanValue: true },
    });
    db.put('users/user1/journals/also', {
      name: { stringValue: 'MEXC' }, exchange: { stringValue: 'mexc' }, initialBalance: { doubleValue: 1 },
    });
    db.put('users/user2/journals/theirs', {
      name: { stringValue: 'Theirs' }, exchange: { stringValue: 'MEXC' }, initialBalance: { doubleValue: 9 },
    });
    db.put('users/user1/trades/on-mexc', {
      journalId: { stringValue: 'mexc' }, pair: { stringValue: 'BTCUSDT' }, direction: { stringValue: 'long' },
      status: { stringValue: 'closed' }, entryDate: { timestampValue: '2026-06-02T00:00:00.000Z' },
      netPnl: { doubleValue: 10 },
    });
    db.put('users/user1/trades/on-bybit', {
      journalId: { stringValue: 'j-bybit' }, pair: { stringValue: 'ETHUSDT' }, direction: { stringValue: 'short' },
      status: { stringValue: 'closed' }, entryDate: { timestampValue: '2026-06-03T00:00:00.000Z' },
      netPnl: { doubleValue: 4 },
    });

    const listed = await call('/api/v1/journals', { db });
    expect(listed.status).toBe(200);
    const journals = await listed.json();
    expect(journals.journals.map((j) => ({ id: j.id, name: j.name, exchange: j.exchange }))).toEqual([
      { id: 'mexc', name: 'MEXC', exchange: 'MEXC' },
      { id: 'j-bybit', name: 'Bybit', exchange: 'bybit' },
      { id: 'also', name: 'MEXC', exchange: 'mexc' },
    ]);
    expect(journals.journals[0]).toMatchObject({ starred: true, initialBalance: 1000, assetClass: 'crypto' });
    expect(JSON.stringify(journals)).not.toContain('user2');

    const missing = { ...tradeBody };
    delete missing.journalId;
    const rejected = await call('/api/v1/trades', { method: 'POST', db, body: missing });
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toMatch(/journalId/);
    const statsMissing = await call('/api/v1/stats', { db });
    expect(statsMissing.status).toBe(400);
    expect((await statsMissing.json()).error).toMatch(/journalId/);

    const byName = await call('/api/v1/trades', {
      method: 'POST', db, body: { ...missing, journal: '  BYBIT ' },
    });
    expect(byName.status).toBe(201);
    expect((await byName.json()).trade.journalId).toBe('j-bybit');

    const byIdAlias = await call('/api/v1/trades', {
      method: 'POST', db, body: { ...missing, journal: 'mexc' },
    });
    expect(byIdAlias.status).toBe(201);
    expect((await byIdAlias.json()).trade.journalId).toBe('mexc');

    const ambiguous = await call('/api/v1/trades', {
      method: 'POST', db, body: { ...missing, journal: 'MEXC' },
    });
    expect(ambiguous.status).toBe(409);
    const mismatch = await call('/api/v1/trades', {
      method: 'POST', db, body: { ...tradeBody, journalId: 'j-bybit', journal: 'not-bybit' },
    });
    expect(mismatch.status).toBe(400);
    const foreign = await call('/api/v1/trades', {
      method: 'POST', db, body: { ...tradeBody, journalId: 'theirs' },
    });
    expect(foreign.status).toBe(404);

    const all = await call('/api/v1/trades?limit=10', { db });
    const allIds = (await all.json()).trades.map((t) => t.id);
    expect(allIds).toEqual(expect.arrayContaining(['on-mexc', 'on-bybit']));
    const onlyBybit = await call('/api/v1/trades?journal=Bybit&limit=10', { db });
    expect((await onlyBybit.json()).trades.every((t) => t.journalId === 'j-bybit')).toBe(true);
    const unknownJournal = await call('/api/v1/trades?journalId=theirs', { db });
    expect(unknownJournal.status).toBe(404);

    const namedStats = await call('/api/v1/stats?journal=bybit', { db });
    expect(namedStats.status).toBe(200);
    expect((await namedStats.json()).journalId).toBe('j-bybit');
  });

  it('deletes a trade the key owns and drops it from stats', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { name: { stringValue: 'MEXC' }, exchange: { stringValue: 'MEXC' }, initialBalance: { doubleValue: 1000 } });
    db.put('users/user2/trades/secret', {
      journalId: { stringValue: 'x' }, pair: { stringValue: 'BTCUSDT' }, netPnl: { doubleValue: 999 },
    });
    const first = await call('/api/v1/trades', { method: 'POST', db, body: tradeBody });
    const second = await call('/api/v1/trades', { method: 'POST', db, body: { ...tradeBody, pair: 'ETHUSDT' } });
    const id = (await first.json()).id;
    const keep = (await second.json()).id;
    db.put(`users/user1/tradeImages/${id}_0`, { tradeId: { stringValue: id } });
    db.put(`users/user1/tradeImages/${id}_1`, { tradeId: { stringValue: id } });
    db.put('users/user1/tradeImages/keep_0', { tradeId: { stringValue: 'keep' } });

    const before = await call('/api/v1/stats?journalId=j1', { db });
    expect((await before.json()).totalPnl).toBe(38);

    const gone = await call(`/api/v1/trades/${id}`, { method: 'DELETE', db });
    expect(gone.status).toBe(200);
    expect(await gone.json()).toEqual({ id, deleted: true });
    expect(db.docs.has(`users/user1/trades/${id}`)).toBe(false);
    expect(db.docs.has(`users/user1/tradeImages/${id}_0`)).toBe(false);
    expect(db.docs.has(`users/user1/tradeImages/${id}_1`)).toBe(false);
    expect(db.docs.has('users/user1/tradeImages/keep_0')).toBe(true);
    expect(db.docs.has('users/user2/trades/secret')).toBe(true);
    expect(db.docs.has(`users/user1/trades/${keep}`)).toBe(true);

    const after = await call('/api/v1/stats?journal=MEXC', { db });
    const stats = await after.json();
    expect(stats.totalPnl).toBe(19);
    expect(stats.currentBalance).toBe(1019);
    expect(stats.counts.closed).toBe(1);
    const still = await call('/api/v1/trades?journalId=j1&limit=10', { db });
    expect((await still.json()).trades.map((t) => t.id)).toEqual([keep]);

    const again = await call(`/api/v1/trades/${id}`, { method: 'DELETE', db });
    expect(again.status).toBe(404);
    const foreign = await call('/api/v1/trades/secret', { method: 'DELETE', db });
    expect(foreign.status).toBe(404);
    expect(db.docs.has('users/user2/trades/secret')).toBe(true);
    const bad = await call(`/api/v1/trades/${'a'.repeat(129)}`, { method: 'DELETE', db });
    expect(bad.status).toBe(400);
    const collection = await call('/api/v1/trades', { method: 'DELETE', db });
    expect(collection.status).toBe(405);
  });

  it('rate limits a user without writing KV', async () => {
    const db = memoryDb();
    const res = await call('/api/v1/stats?journalId=j1', { db, extra: { rateLimit: async () => ({ count: 61 }) } });
    expect(res.status).toBe(429);
    expect(db.fetchFn).not.toHaveBeenCalled();
  });
});
