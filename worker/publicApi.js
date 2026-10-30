// Public REST API (v1). Agents authenticate with a per-user key (tos_…) or a
// Firebase ID token. Writes go through the Admin SDK, so validation here is
// the same check firestore.rules would apply. Rate limits go through
// deps.rateLimit (bumpWindow). Uid-keyed windows increment on the user's
// Durable Object. The pre-auth key-hash window stays on the edge counter
// because the uid is not known yet. A request never writes KV just to be counted.

import { buildStoredTrade, withDerivedRiskAmount } from '../src/utils/tradeDoc.js';
import { prepareApiTrade } from '../src/utils/tradeValidation.js';
import { computeApiStats } from '../src/utils/apiStats.js';
import { windowBounds } from '../src/utils/dashboardStats.js';
import { tradeImageIds } from '../src/utils/tradeImageSlots.js';
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
const IDEM_PENDING_MS = 60_000;
const JOURNAL_NAME_MAX = 200;
const JOURNAL_PAGE_CAP = 20;

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

function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(text) {
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Opaque page token: order, the filters that produced the page, and the
// last scanned trade's entryDate + document name. A cursor from another
// order or another filter set is rejected so the next page cannot skip.
function encodeCursor(payload) {
  return bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodeCursor(cursor) {
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(cursor)));
    if (!payload || payload.v !== 2) return null;
    if (payload.o !== 'asc' && payload.o !== 'desc') return null;
    if (typeof payload.n !== 'string' || !payload.n) return null;
    if (payload.t != null && typeof payload.t !== 'string') return null;
    if (!Array.isArray(payload.q) || payload.q.length !== 6) return null;
    if (!payload.q.every((part) => typeof part === 'string')) return null;
    return payload;
  } catch {
    return null;
  }
}

function listFilterKey(journalId, status, pair, direction, from, to) {
  return [journalId, status, pair, direction, from || '', to || ''];
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

export async function authorizeApi(request, deps) {
  const cors = deps.cors || {};
  const fetchFn = deps.fetchFn || fetch;
  const projectId = deps.projectId;
  const fail = (status, error) => json(cors, status, { error });

  let auth;
  try {
    auth = await authenticate(request, { ...deps, fetchFn, projectId });
  } catch (err) {
    console.error('api auth failed', err?.message || err);
    return {
      ok: false,
      response: fail(err?.message === 'FIREBASE_SERVICE_ACCOUNT missing' ? 503 : 502, 'authentication backend unavailable'),
    };
  }
  if (auth.error) return { ok: false, response: fail(auth.status, auth.error) };

  const userGate = await deps.rateLimit(`rl:api:${auth.uid}`, 60);
  if (limited(userGate.count, USER_RATE)) return { ok: false, response: fail(429, 'rate limit') };

  const base = fsBase(projectId);
  return { ok: true, ctx: { ...deps, fetchFn, projectId, base, cors, auth } };
}

export async function handlePublicApi(request, env, deps) {
  const opened = await authorizeApi(request, deps);
  if (!opened.ok) return opened.response;
  const ctx = opened.ctx;
  const { cors } = ctx;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const fail = (status, error) => json(cors, status, { error });

  try {
    if (path === '/api/v1/journals' && request.method === 'GET') return await listJournals(ctx);
    if (path === '/api/v1/trades' && request.method === 'POST') return await createTrade(request, ctx);
    if (path === '/api/v1/trades' && request.method === 'GET') return await listTrades(url, ctx);
    const tradeItem = path.match(/^\/api\/v1\/trades\/([^/]+)$/);
    if (tradeItem && request.method === 'DELETE') return await deleteTrade(tradeItem[1], ctx);
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

export async function createTrade(request, ctx) {
  const { cors, auth, base, fetchFn } = ctx;
  let body;
  try { body = await request.json(); } catch { return json(cors, 400, { error: 'invalid JSON' }); }
  if (body && typeof body === 'object' && !Array.isArray(body) && hasText(body.journal)) {
    const resolved = await resolveJournal(ctx, { journalId: body.journalId, journal: body.journal });
    if (!resolved.ok) return json(cors, resolved.status, { error: resolved.error });
    body = { ...body, journalId: resolved.journalId };
  }
  const prepared = prepareApiTrade(body);
  if (!prepared.ok) return json(cors, 400, { error: prepared.error });

  const idem = request.headers.get('Idempotency-Key');
  let idemId = '';
  let reservedTradeId = '';
  if (idem != null && idem !== '') {
    if (!IDEM_RE.test(idem)) return json(cors, 400, { error: 'Idempotency-Key must be 8–128 printable characters' });
    idemId = await sha256Hex(`${auth.uid}:${idem}`);
    const opened = await beginIdempotency(ctx, idemId);
    if (opened.response) return opened.response;
    reservedTradeId = opened.tradeId;
  }

  const journal = await readDoc(fetchFn, auth.admin, `${base}/documents/users/${auth.uid}/journals/${prepared.trade.journalId}`);
  if (!journal) {
    if (idemId) await releaseIdempotencyIfUnused(ctx, idemId, reservedTradeId);
    return json(cors, 404, { error: 'journal not found' });
  }

  const now = ctx.now ? ctx.now() : new Date();
  const stored = withDerivedRiskAmount(buildStoredTrade(prepared.trade, {
    journalId: prepared.trade.journalId,
    now,
  }));
  const tradeCollection = `${base}/documents/users/${auth.uid}/trades`;
  const createUrl = reservedTradeId
    ? `${tradeCollection}?documentId=${encodeURIComponent(reservedTradeId)}`
    : tradeCollection;
  const created = await fsFetch(fetchFn, auth.admin, createUrl, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFields(stored) }),
  });
  if (!created.ok) {
    if (reservedTradeId) {
      const trade = await readReservedTrade(ctx, reservedTradeId);
      if (trade) {
        await markIdempotencyDone(ctx, idemId, reservedTradeId);
        return json(cors, 200, replayBody(reservedTradeId, trade));
      }
      // The write did not land. Keep the reservation and age it out so the
      // next call reuses this trade id. Deleting it would mint a second id.
      if (created.status !== 409) {
        try {
          await patchDoc(ctx, idemDocUrl(ctx, idemId), {
            createdAt: new Date(nowDate(ctx).getTime() - IDEM_PENDING_MS - 1),
          });
        } catch (err) {
          console.error('idempotency reservation refresh failed', err?.message || err);
        }
      }
    }
    return json(cors, 502, { error: 'failed to write trade' });
  }
  const doc = await created.json();
  const id = docIdFromName(doc.name) || reservedTradeId;
  if (idemId) await markIdempotencyDone(ctx, idemId, id);
  return json(cors, 201, { id, trade: { id, ...toPublicTrade(stored) } });
}

function nowDate(ctx) {
  const now = ctx.now ? ctx.now() : new Date();
  return now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
}

function idemDocUrl(ctx, idemId) {
  return `${ctx.base}/documents/users/${ctx.auth.uid}/apiIdempotency/${idemId}`;
}

function replayBody(tradeId, trade) {
  return {
    id: tradeId,
    trade: trade ? { id: trade.id, ...trade.data } : null,
    idempotentReplay: true,
  };
}

async function readReservedTrade(ctx, tradeId) {
  if (typeof tradeId !== 'string' || !tradeId || tradeId.includes('/')) return null;
  return readDoc(ctx.fetchFn, ctx.auth.admin, `${ctx.base}/documents/users/${ctx.auth.uid}/trades/${tradeId}`);
}

// The trade id is stored on the pending record in the same create that
// reserves the key, and the trade document uses that id. A later failure to
// mark the key `done` must not delete or replace the record: the retry reads
// the reserved id, returns the trade when it exists, and otherwise writes
// that same document again. Two creates of one id cannot both succeed.
async function beginIdempotency(ctx, idemId) {
  const { cors, auth, base, fetchFn } = ctx;
  const url = `${base}/documents/users/${auth.uid}/apiIdempotency?documentId=${idemId}`;
  const now = nowDate(ctx);
  const tradeId = crypto.randomUUID();
  const res = await fsFetch(fetchFn, auth.admin, url, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFields({ status: 'pending', createdAt: now, tradeId }) }),
  });
  if (res.ok) return { tradeId };
  if (res.status !== 409) return { response: json(cors, 502, { error: 'failed to reserve idempotency key' }) };

  const existing = await readDoc(fetchFn, auth.admin, idemDocUrl(ctx, idemId));
  if (!existing) {
    const againId = crypto.randomUUID();
    const again = await fsFetch(fetchFn, auth.admin, url, {
      method: 'POST',
      body: JSON.stringify({ fields: encodeFields({ status: 'pending', createdAt: now, tradeId: againId }) }),
    });
    if (again.ok) return { tradeId: againId };
    return { response: json(cors, again.status === 409 ? 409 : 502, {
      error: again.status === 409
        ? 'a request with this Idempotency-Key is in progress'
        : 'failed to reserve idempotency key',
    }) };
  }

  const reserved = typeof existing.data?.tradeId === 'string' ? existing.data.tradeId : '';
  const trade = await readReservedTrade(ctx, reserved);
  if (trade) {
    await markIdempotencyDone(ctx, idemId, reserved);
    return { response: json(cors, 200, replayBody(reserved, trade)) };
  }
  if (existing.data?.status === 'done' && reserved) {
    return { response: json(cors, 200, replayBody(reserved, null)) };
  }
  // No reserved id means we cannot point at a single trade document. Do not
  // delete the key and do not allocate another one: an earlier write may
  // already exist and would be orphaned by a second create.
  const age = now.getTime() - new Date(existing.data?.createdAt || 0).getTime();
  const stillPending = existing.data?.status === 'pending' && age < IDEM_PENDING_MS;
  if (!reserved || stillPending) {
    return { response: json(cors, 409, { error: 'a request with this Idempotency-Key is in progress' }) };
  }
  return { tradeId: reserved };
}

async function markIdempotencyDone(ctx, idemId, tradeId) {
  try {
    await patchDoc(ctx, idemDocUrl(ctx, idemId), { status: 'done', tradeId });
  } catch (err) {
    // The reserved trade id is already on the record. The retry returns that
    // trade; losing this completion update must not surface as a second write.
    console.error('idempotency mark done failed', err?.message || err);
  }
}

async function releaseIdempotencyIfUnused(ctx, idemId, tradeId) {
  const trade = await readReservedTrade(ctx, tradeId);
  if (trade) return;
  await deleteDoc(ctx, idemDocUrl(ctx, idemId));
}

export async function listTrades(url, ctx) {
  const { cors, auth, base, fetchFn } = ctx;
  let journalId = url.searchParams.get('journalId') || '';
  const journalName = url.searchParams.get('journal') || '';
  if (hasText(journalId) || hasText(journalName)) {
    const resolved = await resolveJournal(ctx, { journalId, journal: journalName });
    if (!resolved.ok) return json(cors, resolved.status, { error: resolved.error });
    journalId = resolved.journalId;
  }
  const status = url.searchParams.get('status') || '';
  const pair = url.searchParams.get('pair') || '';
  const direction = url.searchParams.get('direction') || '';
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const order = url.searchParams.get('order') || 'desc';
  if (order !== 'asc' && order !== 'desc') return json(cors, 400, { error: 'order must be asc or desc' });
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

  const filterKey = listFilterKey(journalId, status, pair, direction, from, to);
  let startAfter;
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    const decoded = decodeCursor(cursor);
    const prefix = `projects/${ctx.projectId}/databases/(default)/documents/users/${auth.uid}/trades/`;
    const rest = decoded ? decoded.n.slice(prefix.length) : '';
    const sameFilters = decoded && decoded.q.every((part, i) => part === filterKey[i]);
    if (!decoded || decoded.o !== order || !decoded.n.startsWith(prefix) || !rest || rest.includes('/') || !sameFilters) {
      return json(cors, 400, { error: 'invalid cursor' });
    }
    startAfter = { name: decoded.n, entryDate: decoded.t || null };
  }

  const matches = [];
  let scanned = 0;
  let exhausted = false;
  let last = startAfter || null;
  while (matches.length < limit && scanned < SCAN_CAP && !exhausted) {
    const page = Math.min(PAGE, SCAN_CAP - scanned);
    const rows = await runQuery(
      fetchFn, auth.admin,
      `${base}/documents/users/${auth.uid}:runQuery`,
      buildTradesQuery({
        journalId, status, pair, direction, order, limit: page, startAfter: last || undefined,
      }),
    );
    if (!rows.length) { exhausted = true; break; }
    let seen = 0;
    for (const row of rows) {
      scanned += 1;
      seen += 1;
      const stamp = typeof row.data.entryDate === 'string' && row.data.entryDate ? row.data.entryDate : null;
      last = { name: row.name, entryDate: stamp };
      if (inEntryRange(row.data, from, to)) matches.push({ id: row.id, ...row.data });
      if (matches.length >= limit) break;
    }
    // A short page that we read to the end has nothing after it. Stopping
    // in the middle of a page still needs a cursor: the unread rows follow.
    if (rows.length < page && seen === rows.length) exhausted = true;
  }
  const nextCursor = exhausted || !last?.name ? null : encodeCursor({
    v: 2, o: order, t: last.entryDate, n: last.name, q: filterKey,
  });
  return json(cors, 200, { trades: matches, nextCursor });
}

export async function journalStats(url, ctx) {
  const { cors, auth, base, fetchFn } = ctx;
  const resolved = await resolveJournal(ctx, {
    journalId: url.searchParams.get('journalId') || '',
    journal: url.searchParams.get('journal') || '',
    required: true,
  });
  if (!resolved.ok) return json(cors, resolved.status, { error: resolved.error });
  const journalId = resolved.journalId;
  const journal = resolved.journal;
  const period = url.searchParams.get('period') || 'all';
  if (!['all', 'week', 'month', 'year'].includes(period)) return json(cors, 400, { error: 'invalid period' });
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if ((from && !windowBounds('all', { from }).periodStart) || (to && !windowBounds('all', { to }).periodEnd)) {
    return json(cors, 400, { error: 'invalid from/to date' });
  }

  const trades = [];
  let startAfterName = '';
  let truncated = false;
  for (;;) {
    const rows = await runQuery(
      fetchFn, auth.admin,
      `${base}/documents/users/${auth.uid}:runQuery`,
      buildTradesQuery({ journalId, limit: PAGE, sort: 'name', startAfterName: startAfterName || undefined }),
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

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function selector(raw, error) {
  if (raw == null || raw === '') return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, status: 400, error };
  return { ok: true, value: raw.trim() };
}

function foldName(name) {
  return typeof name === 'string' ? name.trim().toLocaleLowerCase() : '';
}

function validDocId(id) {
  return id.length >= 1 && id.length <= 128 && !id.includes('/') && !id.includes('\\') && id !== '.' && id !== '..';
}

function journalUrl(ctx, id) {
  return `${ctx.base}/documents/users/${ctx.auth.uid}/journals/${encodeURIComponent(id)}`;
}

async function listJournalDocs(ctx) {
  const out = [];
  let pageToken = '';
  for (let page = 0; page < JOURNAL_PAGE_CAP; page += 1) {
    const qs = new URLSearchParams({ pageSize: '100' });
    if (pageToken) qs.set('pageToken', pageToken);
    const res = await fsFetch(
      ctx.fetchFn, ctx.auth.admin,
      `${ctx.base}/documents/users/${ctx.auth.uid}/journals?${qs}`,
    );
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`firestore ${res.status}`);
    const body = await res.json();
    for (const doc of body.documents || []) {
      out.push({ id: docIdFromName(doc.name), name: doc.name, data: decodeFields(doc.fields) });
    }
    pageToken = body.nextPageToken || '';
    if (!pageToken) break;
  }
  return out;
}

function publicJournal(row) {
  const data = row.data || {};
  return {
    id: row.id,
    name: typeof data.name === 'string' ? data.name : '',
    exchange: typeof data.exchange === 'string' ? data.exchange : '',
    assetClass: typeof data.assetClass === 'string' && data.assetClass ? data.assetClass : 'crypto',
    currency: typeof data.currency === 'string' ? data.currency : '',
    initialBalance: Number(data.initialBalance) || 0,
    archived: data.archived === true,
    starred: data.starred === true,
    isDefault: data.isDefault === true,
  };
}

/**
 * journalId is an exact document id. journal is a name (trim, case-insensitive)
 * or, when it equals a journal id, that id. Lookups stay under users/{uid}.
 * An omitted selector is journalId '' unless required, which keeps the old 400.
 */
async function resolveJournal(ctx, { journalId = '', journal = '', required = false } = {}) {
  const idParsed = selector(journalId, 'invalid journalId');
  if (!idParsed.ok) return idParsed;
  const nameParsed = selector(journal, 'invalid journal');
  if (!nameParsed.ok) return nameParsed;
  const id = idParsed.value;
  const name = nameParsed.value;
  if (id && !validDocId(id)) return { ok: false, status: 400, error: 'invalid journalId' };
  if (name && name.length > JOURNAL_NAME_MAX) return { ok: false, status: 400, error: 'invalid journal' };
  if (!id && !name) {
    return required
      ? { ok: false, status: 400, error: 'journalId is required' }
      : { ok: true, journalId: '', journal: null };
  }

  if (id && !name) {
    const doc = await readDoc(ctx.fetchFn, ctx.auth.admin, journalUrl(ctx, id));
    if (!doc) return { ok: false, status: 404, error: 'journal not found' };
    return { ok: true, journalId: id, journal: doc };
  }

  if (!id) {
    const rows = await listJournalDocs(ctx);
    const byId = rows.find((row) => row.id === name);
    if (byId) return { ok: true, journalId: byId.id, journal: byId };
    const folded = foldName(name);
    const named = rows.filter((row) => foldName(row.data.name) === folded);
    if (named.length === 1) return { ok: true, journalId: named[0].id, journal: named[0] };
    if (!named.length) return { ok: false, status: 404, error: 'journal not found' };
    return { ok: false, status: 409, error: `journal name is ambiguous: ${named.map((row) => row.id).join(', ')}` };
  }

  const doc = await readDoc(ctx.fetchFn, ctx.auth.admin, journalUrl(ctx, id));
  if (!doc) return { ok: false, status: 404, error: 'journal not found' };
  const sameName = foldName(doc.data.name) === foldName(name);
  if (name !== id && !sameName) return { ok: false, status: 400, error: 'journalId does not match journal' };
  return { ok: true, journalId: id, journal: doc };
}

export async function listJournals(ctx) {
  const rows = await listJournalDocs(ctx);
  rows.sort((a, b) => {
    const starred = (b.data.starred === true) - (a.data.starred === true);
    if (starred) return starred;
    const byName = publicJournal(a).name.localeCompare(publicJournal(b).name);
    if (byName) return byName;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return json(ctx.cors, 200, { journals: rows.map(publicJournal) });
}

export async function deleteTrade(tradeId, ctx) {
  const { cors, auth, base, fetchFn } = ctx;
  if (typeof tradeId !== 'string') return json(cors, 400, { error: 'invalid trade id' });
  let id;
  try { id = decodeURIComponent(tradeId); } catch { return json(cors, 400, { error: 'invalid trade id' }); }
  if (!validDocId(id)) return json(cors, 400, { error: 'invalid trade id' });

  const tradeUrl = `${base}/documents/users/${auth.uid}/trades/${encodeURIComponent(id)}`;
  const trade = await readDoc(fetchFn, auth.admin, tradeUrl);
  if (!trade) return json(cors, 404, { error: 'trade not found' });

  const removed = await fsFetch(fetchFn, auth.admin, tradeUrl, { method: 'DELETE' });
  if (removed.status === 404) return json(cors, 404, { error: 'trade not found' });
  if (!removed.ok) return json(cors, 502, { error: 'failed to delete trade' });

  // Same cleanup as the journal screen: screenshot docs live at fixed slot
  // ids and are not part of the trade. A miss is a no-op. Stats are computed
  // from the remaining trades, so removing this document is the whole update.
  await Promise.all(tradeImageIds(id).map((imageId) => fsFetch(
    fetchFn, auth.admin,
    `${base}/documents/users/${auth.uid}/tradeImages/${encodeURIComponent(imageId)}`,
    { method: 'DELETE' },
  ).catch(() => {})));

  return json(cors, 200, { id, deleted: true });
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
  const res = await fsFetch(ctx.fetchFn, ctx.auth.admin, `${url}?${mask}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
  if (!res.ok) {
    const err = new Error(`firestore ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res;
}
