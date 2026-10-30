import { describe, expect, it, vi } from 'vitest';
import { handlePublicApi } from './publicApi.js';
import { decodeFields } from './firestoreValues.js';

const PROJECT = 'p';
const UID = 'user1';

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? {})),
  };
}

function memoryDb() {
  const docs = new Map();
  let seq = 0;
  const rel = (url) => {
    const path = new URL(url).pathname;
    const marker = '/documents/';
    const at = path.indexOf(marker);
    if (at === -1) return '';
    return decodeURIComponent(path.slice(at + marker.length)).replace(/:runQuery$/, '');
  };
  const nameOf = (path) => `projects/${PROJECT}/databases/(default)/documents/${path}`;

  function matches(data, where) {
    if (!where) return true;
    if (where.compositeFilter) return where.compositeFilter.filters.every((f) => matches(data, f));
    const field = where.fieldFilter.field.fieldPath;
    return data[field] === where.fieldFilter.value.stringValue;
  }

  const fetchFn = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET';
    const u = new URL(url);
    const path = rel(url);
    if (u.pathname.endsWith(':runQuery')) {
      const q = JSON.parse(init.body).structuredQuery;
      const collectionId = q.from[0].collectionId;
      const prefix = path ? `${path}/${collectionId}/` : `${collectionId}/`;
      let rows = [...docs.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, fields]) => ({ key, fields }))
        .filter((row) => matches(decodeFields(row.fields), q.where))
        .sort((a, b) => (a.key < b.key ? -1 : 1));
      const after = q.startAt?.values?.[0]?.referenceValue;
      if (after) rows = rows.filter((row) => nameOf(row.key) > after);
      rows = rows.slice(0, q.limit || rows.length);
      return response(200, rows.map((row) => ({ document: { name: nameOf(row.key), fields: row.fields } })));
    }
    if (method === 'GET' && !docs.has(path)) {
      const children = [...docs.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'));
      if (children.length || path.split('/').length % 2 === 1) {
        return response(200, { documents: children.map(([key, fields]) => ({ name: nameOf(key), fields })) });
      }
      return response(404, {});
    }
    if (method === 'GET') return response(200, { name: nameOf(path), fields: docs.get(path) });
    if (method === 'DELETE') {
      docs.delete(path);
      return response(200, {});
    }
    if (method === 'PATCH') {
      const prev = docs.get(path) || {};
      docs.set(path, { ...prev, ...JSON.parse(init.body).fields });
      return response(200, {});
    }
    if (method === 'POST') {
      const id = u.searchParams.get('documentId') || `t${++seq}`;
      const docPath = `${path}/${id}`;
      if (docs.has(docPath)) return response(409, { error: { status: 'ALREADY_EXISTS' } });
      docs.set(docPath, JSON.parse(init.body).fields);
      return response(200, { name: nameOf(docPath) });
    }
    return response(500, {});
  });

  return {
    fetchFn,
    docs,
    put(path, data) { docs.set(path, data); },
  };
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

  it('lists trades with filters and a cursor', async () => {
    const db = memoryDb();
    db.put('users/user1/trades/a', {
      journalId: { stringValue: 'j1' }, pair: { stringValue: 'BTCUSDT' }, direction: { stringValue: 'long' },
      status: { stringValue: 'closed' }, entryDate: { timestampValue: '2026-06-01T00:00:00.000Z' },
    });
    db.put('users/user1/trades/b', {
      journalId: { stringValue: 'j1' }, pair: { stringValue: 'ETHUSDT' }, direction: { stringValue: 'short' },
      status: { stringValue: 'closed' }, entryDate: { timestampValue: '2026-06-02T00:00:00.000Z' },
    });
    db.put('users/user1/trades/c', {
      journalId: { stringValue: 'other' }, pair: { stringValue: 'BTCUSDT' }, direction: { stringValue: 'long' },
      status: { stringValue: 'closed' }, entryDate: { timestampValue: '2026-06-03T00:00:00.000Z' },
    });
    const res = await call('/api/v1/trades?journalId=j1&status=closed&limit=1', { db });
    expect(res.status).toBe(200);
    const page = await res.json();
    expect(page.trades.map((t) => t.id)).toEqual(['a']);
    expect(page.nextCursor).toBeTruthy();
    const next = await call(`/api/v1/trades?journalId=j1&status=closed&limit=10&cursor=${encodeURIComponent(page.nextCursor)}`, { db });
    expect((await next.json()).trades.map((t) => t.id)).toEqual(['b']);
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

  it('rate limits a user without writing KV', async () => {
    const db = memoryDb();
    const res = await call('/api/v1/stats?journalId=j1', { db, extra: { rateLimit: async () => ({ count: 61 }) } });
    expect(res.status).toBe(429);
    expect(db.fetchFn).not.toHaveBeenCalled();
  });
});
