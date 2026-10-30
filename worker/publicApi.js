// Public REST API (v1). Agents authenticate with a per-user key (tos_…) or a
// Firebase ID token. Writes go through the Admin SDK, so validation here is
// the same check firestore.rules would apply. Rate limits use the in-isolate
// edge counter (bumpWindow) — a request never writes KV just to be counted.

import { buildStoredTrade, withDerivedRiskAmount } from '../src/utils/tradeDoc.js';
import { prepareApiTrade } from '../src/utils/tradeValidation.js';
import { computeApiStats } from '../src/utils/apiStats.js';
import { windowBounds } from '../src/utils/dashboardStats.js';
import {
  buildTradesQuery, decodeFields, docIdFromName, encodeFields, fsBase, sha256Hex, toPublicTrade,
} from './firestoreValues.js';

const LIST_DEFAULT = 50;
const LIST_MAX = 100;
const SCAN_CAP = 500;
const STATS_CAP = 5000;
const KEY_LIMIT = 10;
const USER_RATE = 60;
const KEY_MINT_RATE = 10;
const PAGE = 100;

const KEY_RE = /^tos_[A-Za-z0-9_-]{20,100}$/;
const IDEM_RE = /^[\x21-\x7e]{8,128}$/;

function json(cors, status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

function bearer(request) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return match ? match[1] : '';
}

async function fsFetch(fetchFn, token, url, init = {}) {
  const res = await fetchFn(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return res;
}

async function readDoc(fetchFn, token, url) {
  const res = await fsFetch(fetchFn, token, url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = new Error(`firestore ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const doc = await res.json();
  return { name: doc.name, id: docIdFromName(doc.name), data: decodeFields(doc.fields) };
}

async function runQuery(fetchFn, token, url, structuredQuery) {
  const res = await fsFetch(fetchFn, token, url, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    const err = new Error(`firestore ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row.document)
    .map((row) => ({
      name: row.document.name,
      id: docIdFromName(row.document.name),
      data: decodeFields(row.document.fields),
    }));
}

function randomKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const body = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `tos_${body}`;
}

function encodeCursor(name) {
  return btoa(name).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(cursor) {
  try {
    const pad = cursor.length % 4 === 0 ? '' : '='.repeat(4 - (cursor.length % 4));
    return atob(cursor.replace(/-/g, '+').replace(/_/g, '/') + pad);
  } catch {
    return '';
  }
}

function entryMillis(trade) {
  const d = new Date(trade?.entryDate || 0);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function inEntryRange(trade, from, to) {
  if (from == null && to == null) return true;
  const ms = entryMillis(trade);
  if (ms == null) return false;
  const { periodStart, periodEnd } = windowBounds('all', { from, to });
  if (from != null && periodStart && ms < periodStart.getTime()) return false;
  if (to != null && periodEnd && ms > periodEnd.getTime()) return false;
  return true;
}

async function authenticate(request, deps) {
  const token = bearer(request);
  if (!token) return { error: 'unauthorized', status: 401 };
  if (token.startsWith('tos_')) {
    if (!KEY_RE.test(token)) return { error: 'unauthorized', status: 401 };
    const hash = await sha256Hex(token);
    const gate = await deps.rateLimit(`rl:api:key:${hash.slice(0, 16)}`, 60);
    if (gate.count > USER_RATE) return { error: 'rate limit', status: 429 };
    const admin = await deps.getAdminToken();
    const base = fsBase(deps.projectId);
    const index = await readDoc(deps.fetchFn, admin, `${base}/documents/apiKeyIndex/${hash}`);
    if (!index?.data?.uid || !index.data.keyId) return { error: 'unauthorized', status: 401 };
    const meta = await readDoc(
      deps.fetchFn, admin,
      `${base}/documents/users/${index.data.uid}/apiKeys/${index.data.keyId}`,
    );
    if (!meta || meta.data.revokedAt) return { error: 'unauthorized', status: 401 };
    return { uid: index.data.uid, via: 'apiKey', admin };
  }
  const uid = await deps.verifyFirebaseToken(token);
  if (!uid) return { error: 'unauthorized', status: 401 };
  const admin = await deps.getAdminToken();
  return { uid, via: 'firebase', admin };
}

function limited(count, max) {
  return count > max;
}

export async function handlePublicApi(request, env, deps) {
  const cors = deps.cors || {};
  const fetchFn = deps.fetchFn || fetch;
  const projectId = deps.projectId;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const fail = (status, error) => json(cors, status, { error });

  let auth;
  try {
    auth = await authenticate(request, { ...deps, fetchFn, projectId });
  } catch (err) {
    console.error('api auth failed', err?.message || err);
    return fail(err?.message === 'FIREBASE_SERVICE_ACCOUNT missing' ? 503 : 502, 'authentication backend unavailable');
  }
  if (auth.error) return fail(auth.status, auth.error);

  const userGate = await deps.rateLimit(`rl:api:${auth.uid}`, 60);
  if (limited(userGate.count, USER_RATE)) return fail(429, 'rate limit');

  const base = fsBase(projectId);
  const ctx = { ...deps, fetchFn, projectId, base, cors, auth };

  try {
    if (path === '/api/v1/trades' && request.method === 'POST') return await createTrade(request, ctx);
    if (path === '/api/v1/trades' && request.method === 'GET') return await listTrades(url, ctx);
    if (path === '/api/v1/stats' && request.method === 'GET') return await journalStats(url, ctx);
    if (path === '/api/v1/keys' && request.method === 'POST') return await createKey(request, ctx);
    if (path === '/api/v1/keys' && request.method === 'GET') return await listKeys(ctx);
    const keyMatch = path.match(/^\/api\/v1\/keys\/([^/]+)$/);
    if (keyMatch && request.method === 'DELETE') return await revokeKey(decodeURIComponent(keyMatch[1]), ctx);
    if (path.startsWith('/api/v1/')) return fail(405, 'method not allowed');
    return fail(404, 'not found');
  } catch (err) {
    console.error('api request failed', request.method, path, err?.message || err);
    return fail(502, 'request failed');
  }
}

async function createTrade(request, ctx) {
  const { cors, auth, base, fetchFn } = ctx;
  let body;
  try { body = await request.json(); } catch { return json(cors, 400, { error: 'invalid JSON' }); }
  const prepared = prepareApiTrade(body);
  if (!prepared.ok) return json(cors, 400, { error: prepared.error });

  const idem = request.headers.get('Idempotency-Key');
  let idemId = '';
  if (idem != null && idem !== '') {
    if (!IDEM_RE.test(idem)) return json(cors, 400, { error: 'Idempotency-Key must be 8–128 printable characters' });
    idemId = await sha256Hex(`${auth.uid}:${idem}`);
    const replay = await beginIdempotency(ctx, idemId);
    if (replay) return replay;
  }

  const journal = await readDoc(fetchFn, auth.admin, `${base}/documents/users/${auth.uid}/journals/${prepared.trade.journalId}`);
  if (!journal) {
    if (idemId) await deleteDoc(ctx, `${base}/documents/users/${auth.uid}/apiIdempotency/${idemId}`);
    return json(cors, 404, { error: 'journal not found' });
  }

  const now = ctx.now ? ctx.now() : new Date();
  const stored = withDerivedRiskAmount(buildStoredTrade(prepared.trade, {
    journalId: prepared.trade.journalId,
    now,
  }));
  const created = await fsFetch(fetchFn, auth.admin, `${base}/documents/users/${auth.uid}/trades`, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFields(stored) }),
  });
  if (!created.ok) {
    if (idemId) await deleteDoc(ctx, `${base}/documents/users/${auth.uid}/apiIdempotency/${idemId}`);
    return json(cors, 502, { error: 'failed to write trade' });
  }
  const doc = await created.json();
  const id = docIdFromName(doc.name);
  if (idemId) {
    await patchDoc(ctx, `${base}/documents/users/${auth.uid}/apiIdempotency/${idemId}`, {
      status: 'done', tradeId: id,
    });
  }
  return json(cors, 201, { id, trade: { id, ...toPublicTrade(stored) } });
}

async function beginIdempotency(ctx, idemId) {
  const { cors, auth, base, fetchFn } = ctx;
  const url = `${base}/documents/users/${auth.uid}/apiIdempotency?documentId=${idemId}`;
  const now = ctx.now ? ctx.now() : new Date();
  const res = await fsFetch(fetchFn, auth.admin, url, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFields({ status: 'pending', createdAt: now }) }),
  });
  if (res.ok) return null;
  if (res.status !== 409) return json(cors, 502, { error: 'failed to reserve idempotency key' });
  const existing = await readDoc(fetchFn, auth.admin, `${base}/documents/users/${auth.uid}/apiIdempotency/${idemId}`);
  if (existing?.data?.status === 'done' && existing.data.tradeId) {
    const trade = await readDoc(fetchFn, auth.admin, `${base}/documents/users/${auth.uid}/trades/${existing.data.tradeId}`);
    return json(cors, 200, {
      id: existing.data.tradeId,
      trade: trade ? { id: trade.id, ...trade.data } : null,
      idempotentReplay: true,
    });
  }
  const age = Date.now() - new Date(existing?.data?.createdAt || 0).getTime();
  if (existing?.data?.status === 'pending' && age < 60_000) {
    return json(cors, 409, { error: 'a request with this Idempotency-Key is in progress' });
  }
  await deleteDoc(ctx, `${base}/documents/users/${auth.uid}/apiIdempotency/${idemId}`);
  const retry = await fsFetch(fetchFn, auth.admin, url, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFields({ status: 'pending', createdAt: now }) }),
  });
  if (!retry.ok) return json(cors, 409, { error: 'a request with this Idempotency-Key is in progress' });
  return null;
}

async function listTrades(url, ctx) {
  const { cors, auth, base, fetchFn } = ctx;
  const journalId = url.searchParams.get('journalId') || '';
  const status = url.searchParams.get('status') || '';
  const pair = url.searchParams.get('pair') || '';
  const direction = url.searchParams.get('direction') || '';
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (status && !['open', 'closed', 'partial'].includes(status)) return json(cors, 400, { error: 'invalid status' });
  if (direction && !['long', 'short'].includes(direction)) return json(cors, 400, { error: 'invalid direction' });
  if (pair.length > 30) return json(cors, 400, { error: 'invalid pair' });
  if ((from && Number.isNaN(new Date(from).getTime()) && !/^\d{4}-\d{2}-\d{2}$/.test(from))
    || (to && Number.isNaN(new Date(to).getTime()) && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    return json(cors, 400, { error: 'invalid from/to date' });
  }
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw == null ? LIST_DEFAULT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX) return json(cors, 400, { error: `limit must be 1–${LIST_MAX}` });

  let startAfterName = '';
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    startAfterName = decodeCursor(cursor);
    const prefix = `projects/${ctx.projectId}/databases/(default)/documents/users/${auth.uid}/trades/`;
    if (!startAfterName.startsWith(prefix)) return json(cors, 400, { error: 'invalid cursor' });
  }

  const matches = [];
  let scanned = 0;
  let exhausted = false;
  let lastName = startAfterName;
  while (matches.length < limit && scanned < SCAN_CAP && !exhausted) {
    const page = Math.min(PAGE, SCAN_CAP - scanned);
    const rows = await runQuery(
      fetchFn, auth.admin,
      `${base}/documents/users/${auth.uid}:runQuery`,
      buildTradesQuery({
        journalId, status, pair, direction, limit: page, startAfterName: lastName || undefined,
      }),
    );
    if (!rows.length) { exhausted = true; break; }
    let seen = 0;
    for (const row of rows) {
      scanned += 1;
      seen += 1;
      lastName = row.name;
      if (inEntryRange(row.data, from, to)) matches.push({ id: row.id, ...row.data });
      if (matches.length >= limit) break;
    }
    // A short page that we read to the end has nothing after it. Stopping
    // in the middle of a page still needs a cursor: the unread rows follow.
    if (rows.length < page && seen === rows.length) exhausted = true;
  }
  const nextCursor = exhausted ? null : (lastName ? encodeCursor(lastName) : null);
  return json(cors, 200, { trades: matches, nextCursor });
}

async function journalStats(url, ctx) {
  const { cors, auth, base, fetchFn } = ctx;
  const journalId = url.searchParams.get('journalId') || '';
  if (!journalId) return json(cors, 400, { error: 'journalId is required' });
  const period = url.searchParams.get('period') || 'all';
  if (!['all', 'week', 'month', 'year'].includes(period)) return json(cors, 400, { error: 'invalid period' });
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if ((from && !windowBounds('all', { from }).periodStart) || (to && !windowBounds('all', { to }).periodEnd)) {
    return json(cors, 400, { error: 'invalid from/to date' });
  }

  const journal = await readDoc(fetchFn, auth.admin, `${base}/documents/users/${auth.uid}/journals/${journalId}`);
  if (!journal) return json(cors, 404, { error: 'journal not found' });

  const trades = [];
  let startAfterName = '';
  let truncated = false;
  for (;;) {
    const rows = await runQuery(
      fetchFn, auth.admin,
      `${base}/documents/users/${auth.uid}:runQuery`,
      buildTradesQuery({ journalId, limit: PAGE, startAfterName: startAfterName || undefined }),
    );
    if (!rows.length) break;
    for (const row of rows) trades.push({ id: row.id, ...row.data });
    startAfterName = rows[rows.length - 1].name;
    if (trades.length >= STATS_CAP) { truncated = rows.length === PAGE; break; }
    if (rows.length < PAGE) break;
  }
  const now = ctx.now ? ctx.now() : new Date();
  const stats = computeApiStats(trades, Number(journal.data.initialBalance) || 0, {
    period, from: from || null, to: to || null, now,
  });
  return json(cors, 200, { journalId, ...stats, truncated });
}

function requireFirebase(ctx) {
  if (ctx.auth.via !== 'firebase') {
    return json(ctx.cors, 403, { error: 'key management requires a Firebase ID token' });
  }
  return null;
}

async function listKeyDocs(ctx) {
  const res = await fsFetch(ctx.fetchFn, ctx.auth.admin, `${ctx.base}/documents/users/${ctx.auth.uid}/apiKeys?pageSize=50`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`firestore ${res.status}`);
  const body = await res.json();
  return (body.documents || []).map((doc) => ({
    id: docIdFromName(doc.name),
    ...decodeFields(doc.fields),
  }));
}

function publicKey(row) {
  return {
    id: row.id,
    name: row.name || '',
    prefix: row.prefix || '',
    createdAt: row.createdAt || null,
    revokedAt: row.revokedAt || null,
  };
}

async function listKeys(ctx) {
  const denied = requireFirebase(ctx);
  if (denied) return denied;
  const rows = await listKeyDocs(ctx);
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return json(ctx.cors, 200, { keys: rows.map(publicKey) });
}

async function createKey(request, ctx) {
  const denied = requireFirebase(ctx);
  if (denied) return denied;
  const mint = await ctx.rateLimit(`rl:apikey:${ctx.auth.uid}`, 3600);
  if (limited(mint.count, KEY_MINT_RATE)) return json(ctx.cors, 429, { error: 'rate limit' });

  let body = {};
  const text = await request.text();
  if (text) {
    try { body = JSON.parse(text); } catch { return json(ctx.cors, 400, { error: 'invalid JSON' }); }
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : 'API key';
  const existing = await listKeyDocs(ctx);
  if (existing.filter((row) => !row.revokedAt).length >= KEY_LIMIT) {
    return json(ctx.cors, 409, { error: `at most ${KEY_LIMIT} active keys` });
  }

  const secret = randomKey();
  const hash = await sha256Hex(secret);
  const keyId = crypto.randomUUID();
  const createdAt = ctx.now ? ctx.now() : new Date();
  const indexUrl = `${ctx.base}/documents/apiKeyIndex?documentId=${hash}`;
  const index = await fsFetch(ctx.fetchFn, ctx.auth.admin, indexUrl, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFields({ uid: ctx.auth.uid, keyId, createdAt }) }),
  });
  if (!index.ok) return json(ctx.cors, 502, { error: 'failed to store key' });

  const meta = await fsFetch(ctx.fetchFn, ctx.auth.admin, `${ctx.base}/documents/users/${ctx.auth.uid}/apiKeys?documentId=${keyId}`, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFields({ name, prefix: secret.slice(0, 12), createdAt, revokedAt: null }) }),
  });
  if (!meta.ok) {
    await deleteDoc(ctx, `${ctx.base}/documents/apiKeyIndex/${hash}`);
    return json(ctx.cors, 502, { error: 'failed to store key' });
  }
  return json(ctx.cors, 201, {
    id: keyId,
    key: secret,
    name,
    prefix: secret.slice(0, 12),
    createdAt: createdAt.toISOString(),
  });
}

async function revokeKey(keyId, ctx) {
  const denied = requireFirebase(ctx);
  if (denied) return denied;
  if (!/^[A-Za-z0-9-]{8,80}$/.test(keyId)) return json(ctx.cors, 400, { error: 'invalid key id' });
  const metaUrl = `${ctx.base}/documents/users/${ctx.auth.uid}/apiKeys/${keyId}`;
  const meta = await readDoc(ctx.fetchFn, ctx.auth.admin, metaUrl);
  if (!meta) return json(ctx.cors, 404, { error: 'key not found' });
  const rows = await runQuery(ctx.fetchFn, ctx.auth.admin, `${ctx.base}/documents:runQuery`, {
    from: [{ collectionId: 'apiKeyIndex' }],
    where: { fieldFilter: { field: { fieldPath: 'keyId' }, op: 'EQUAL', value: { stringValue: keyId } } },
    limit: 5,
  });
  for (const row of rows) {
    if (row.data.uid === ctx.auth.uid) await deleteDoc(ctx, `${ctx.base}/documents/${row.name.split('/documents/')[1]}`);
  }
  const revokedAt = ctx.now ? ctx.now() : new Date();
  await patchDoc(ctx, metaUrl, { revokedAt });
  return json(ctx.cors, 200, { id: keyId, revokedAt: revokedAt.toISOString() });
}

async function deleteDoc(ctx, url) {
  await fsFetch(ctx.fetchFn, ctx.auth.admin, url, { method: 'DELETE' }).catch(() => {});
}

async function patchDoc(ctx, url, fields) {
  const mask = Object.keys(fields).map((name) => `updateMask.fieldPaths=${encodeURIComponent(name)}`).join('&');
  await fsFetch(ctx.fetchFn, ctx.auth.admin, `${url}?${mask}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
}
