// Journal share endpoints. The owner creates a time-limited token; the viewer
// receives only filterJournalShare's copy. Share rows live in KV. Firestore is
// read with the admin token and never written here, so this stage does not
// publish rules. Storage, auth, email lookup and the rate-limit counter are
// injected so the tests stay on synthetic data.

import { filterJournalShare, normalizeShareFields } from '../src/utils/journalShareFilter.js';
import { decodeFields, docIdFromName, fsBase, sha256Hex } from './firestoreValues.js';

export const SHARE_MESSAGE = 'אם הכתובת רשומה ב-TradeOS, השיתוף נשמר.';
export const NO_DATA = 'אין נתונים';
export const SHARE_DAYS = [7, 30, 90];

const WINDOW_SEC = 3600;
const WRITE_LIMIT = 30;
const LIST_LIMIT = 120;
const VIEW_LIMIT = 120;
const TRADE_CAP = 500;
const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const JOURNAL_RE = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHARE_ID_RE = /^[a-f0-9]{32}$/;
const TOKEN_RE = /^[a-f0-9]{64}$/;

const recordKey = (id) => `jshare:${id}`;
const tokenKey = (hash) => `jshare-tok:${hash}`;
const ownerKey = (uid, id) => `jshare-own:${uid}:${id}`;
const mailKey = (emailHash, id) => `jshare-mail:${emailHash}:${id}`;
const auditPrefix = (uid) => `jshare-audit:${uid}:`;

function json(cors, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });
}

function noData(cors) {
  return json(cors, 404, { error: NO_DATA });
}

function bearer(request) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return match ? match[1] : '';
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

export function jerusalemYmd(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${bag.year}-${bag.month}-${bag.day}`;
}

// Last millisecond of a Jerusalem calendar day, or null when the date is not real.
export function endOfJerusalemDay(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  let lo = Date.parse(`${dateStr}T00:00:00Z`) - 36 * 3600 * 1000;
  let hi = Date.parse(`${dateStr}T00:00:00Z`) + 36 * 3600 * 1000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (jerusalemYmd(new Date(mid)) <= dateStr) lo = mid;
    else hi = mid;
  }
  if (jerusalemYmd(new Date(lo)) !== dateStr) return null;
  return hi - 1;
}

// 7/30/90 rolling days, or the end of a manual Jerusalem day. Always a future instant.
export function resolveShareExpiry(body, nowMs) {
  const hasDays = body?.days != null && body.days !== '';
  const hasDate = body?.expiresOn != null && body.expiresOn !== '';
  if (hasDays === hasDate) {
    return { error: hasDays ? 'בחרו טווח או תאריך, לא את שניהם' : 'חובה תאריך סיום' };
  }
  let expiresAt;
  if (hasDays) {
    const days = Number(body.days);
    if (!SHARE_DAYS.includes(days)) return { error: 'הטווח הוא 7, 30 או 90 יום' };
    expiresAt = nowMs + days * DAY_MS;
  } else {
    expiresAt = endOfJerusalemDay(String(body.expiresOn));
    if (expiresAt == null) return { error: 'תאריך הסיום לא תקין' };
  }
  if (!(expiresAt > nowMs)) return { error: 'צריך תאריך סיום עתידי' };
  if (expiresAt - nowMs > MAX_AHEAD_MS) return { error: 'תאריך הסיום רחוק מדי' };
  return { expiresAt: new Date(expiresAt).toISOString() };
}

function emailOf(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) return null;
  return email;
}

async function limited(deps, objectName, key, max) {
  if (typeof deps.durableBump !== 'function') return { error: 'unavailable' };
  const count = await deps.durableBump(objectName, key, WINDOW_SEC);
  if (count == null || !Number.isFinite(Number(count))) return { error: 'unavailable' };
  if (Number(count) > max) return { error: 'limited' };
  return { count: Number(count) };
}

function limitResponse(cors, result) {
  if (result.error === 'limited') return json(cors, 429, { error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' });
  return json(cors, 503, { error: 'השירות אינו זמין זמנית. נסה שוב מאוחר יותר.' });
}

async function ownerUid(request, deps) {
  if (typeof deps.verifyFirebaseToken !== 'function') return null;
  return deps.verifyFirebaseToken(bearer(request));
}

async function readDoc(fetchFn, token, url) {
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = new Error(`firestore ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const doc = await res.json();
  return { id: docIdFromName(doc.name), data: decodeFields(doc.fields) };
}

async function readTrades(fetchFn, token, base, uid, journalId) {
  const res = await fetchFn(`${base}/documents/users/${uid}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'trades' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'journalId' },
            op: 'EQUAL',
            value: { stringValue: journalId },
          },
        },
        limit: TRADE_CAP,
      },
    }),
  });
  if (!res.ok) {
    const err = new Error(`firestore ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row.document)
    .map((row) => {
      const data = decodeFields(row.document.fields);
      return { ...data, id: data.id || docIdFromName(row.document.name), journalId: data.journalId || journalId };
    });
}

async function putJson(kv, key, value, ttlSec) {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSec });
}

function ttlFor(expiresAt, nowMs) {
  const sec = Math.ceil((Date.parse(expiresAt) - nowMs) / 1000) + 30 * 24 * 3600;
  return Math.max(60, Math.min(sec, 400 * 24 * 3600));
}

async function writeAudit(kv, uid, action, share, nowMs) {
  const inv = String(9_999_999_999_999 - nowMs).padStart(13, '0');
  const key = `${auditPrefix(uid)}${inv}:${randomHex(4)}`;
  const entry = {
    ownerUid: uid,
    action,
    shareId: share.id,
    journalId: share.journalId,
    ts: new Date(nowMs).toISOString(),
  };
  await putJson(kv, key, entry, 365 * 24 * 3600);
}

async function listKeys(kv, prefix) {
  const names = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const key of page.keys || []) names.push(key.name);
    cursor = page.list_complete === false ? page.cursor : undefined;
  } while (cursor);
  return names;
}

function publicShare(share, nowMs) {
  const expired = Date.parse(share.expiresAt) <= nowMs;
  let status = share.status === 'revoked' ? 'revoked' : 'active';
  if (status === 'active' && expired) status = 'expired';
  return {
    id: share.id,
    journalId: share.journalId,
    viewerEmail: share.viewerEmail,
    fields: share.fields,
    status,
    expiresAt: share.expiresAt,
    createdAt: share.createdAt,
  };
}

function usable(share, nowMs) {
  return share && share.status === 'active' && Date.parse(share.expiresAt) > nowMs;
}

async function loadShare(kv, id) {
  if (!SHARE_ID_RE.test(id || '')) return null;
  return kv.get(recordKey(id), 'json');
}

export async function handleJournalShare(request, env, deps) {
  const cors = deps.cors || {};
  const kv = env.ALERTS_KV;
  if (!kv) return json(cors, 503, { error: 'השירות אינו זמין זמנית. נסה שוב מאוחר יותר.' });
  const url = new URL(request.url);
  const path = url.pathname;
  const nowMs = (deps.now ? deps.now() : new Date()).getTime();
  if (!Number.isFinite(nowMs)) return json(cors, 500, { error: 'שגיאה פנימית בשרת' });

  const viewMatch = path.match(/^\/api\/journal-shares\/view\/([^/]+)$/);
  if (request.method === 'GET' && viewMatch) return viewShare(request, deps, cors, kv, viewMatch[1], nowMs);

  const uid = await ownerUid(request, deps);
  if (!uid) return json(cors, 401, { error: 'נדרשת התחברות' });

  if (request.method === 'GET' && path === '/api/journal-shares') return listShares(deps, cors, kv, uid, nowMs);
  if (request.method === 'POST' && path === '/api/journal-shares/bind') return bindFromSignIn(request, deps, cors, kv, uid, nowMs);
  if (request.method === 'POST' && path === '/api/journal-shares') return createShare(request, deps, cors, kv, uid, nowMs);

  const revokeMatch = path.match(/^\/api\/journal-shares\/([a-f0-9]{32})\/revoke$/);
  if (request.method === 'POST' && revokeMatch) return revokeShare(deps, cors, kv, uid, revokeMatch[1], nowMs);

  const patchMatch = path.match(/^\/api\/journal-shares\/([a-f0-9]{32})$/);
  if (request.method === 'PATCH' && patchMatch) return updateShare(request, deps, cors, kv, uid, patchMatch[1], nowMs);

  return json(cors, 404, { error: NO_DATA });
}

async function viewShare(request, deps, cors, kv, token, nowMs) {
  const presented = decodeURIComponent(token || '');
  const hash = await sha256Hex(presented || 'empty');
  const ip = String(request.headers.get('CF-Connecting-IP') || 'unknown').slice(0, 64);
  const gate = await limited(deps, 'jshare-viewers', `view:${ip}:${hash.slice(0, 16)}`, VIEW_LIMIT);
  if (gate.error) return limitResponse(cors, gate);
  if (!TOKEN_RE.test(presented)) return noData(cors);
  const id = await kv.get(tokenKey(hash));
  const share = typeof id === 'string' ? await loadShare(kv, id) : null;
  if (!usable(share, nowMs)) return noData(cors);
  try {
    const admin = await deps.getAdminToken();
    const base = fsBase(deps.projectId);
    const journalDoc = await readDoc(
      deps.fetchFn,
      admin,
      `${base}/documents/users/${share.ownerUid}/journals/${share.journalId}`,
    );
    if (!journalDoc) return noData(cors);
    const trades = share.fields?.trades
      ? await readTrades(deps.fetchFn, admin, base, share.ownerUid, share.journalId)
      : [];
    const view = filterJournalShare(
      { id: share.journalId, ...journalDoc.data },
      trades,
      share.fields,
    );
    return json(cors, 200, { share: view, expiresAt: share.expiresAt });
  } catch (err) {
    console.error('journal share view', err?.status || err?.message || err);
    return json(cors, 503, { error: 'השירות אינו זמין זמנית. נסה שוב מאוחר יותר.' });
  }
}

async function listShares(deps, cors, kv, uid, nowMs) {
  const gate = await limited(deps, uid, 'jshare:list', LIST_LIMIT);
  if (gate.error) return limitResponse(cors, gate);
  const names = await listKeys(kv, `jshare-own:${uid}:`);
  const shares = [];
  for (const name of names) {
    const id = name.slice(`jshare-own:${uid}:`.length);
    const share = await loadShare(kv, id);
    if (share && share.ownerUid === uid) shares.push(publicShare(share, nowMs));
  }
  shares.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json(cors, 200, { shares });
}

async function createShare(request, deps, cors, kv, uid, nowMs) {
  const gate = await limited(deps, uid, 'jshare:write', WRITE_LIMIT);
  if (gate.error) return limitResponse(cors, gate);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json(cors, 400, { error: 'גוף הבקשה לא תקין' });
  if (!JOURNAL_RE.test(body.journalId || '')) return json(cors, 400, { error: 'יומן לא תקין' });
  const email = emailOf(body.email);
  if (!email) return json(cors, 400, { error: 'כתובת לא תקינה' });
  const expiry = resolveShareExpiry(body, nowMs);
  if (expiry.error) return json(cors, 400, { error: expiry.error });
  const fields = normalizeShareFields(body.fields);

  let viewerUid = null;
  try {
    const admin = await deps.getAdminToken();
    const base = fsBase(deps.projectId);
    const journalDoc = await readDoc(deps.fetchFn, admin, `${base}/documents/users/${uid}/journals/${body.journalId}`);
    if (!journalDoc) return json(cors, 404, { error: 'היומן לא נמצא' });
    viewerUid = await deps.lookupAccountByEmail(email);
  } catch (err) {
    console.error('journal share create', err?.status || err?.message || err);
    return json(cors, 503, { error: 'השירות אינו זמין זמנית. נסה שוב מאוחר יותר.' });
  }

  // Share-to-self stores nothing. The sentence and the JSON shape stay the
  // same as a real share, so the body does not say which case this was.
  const token = randomHex(32);
  const createdAt = new Date(nowMs).toISOString();
  if (viewerUid === uid) {
    return json(cors, 200, issued(token, {
      id: randomHex(16),
      journalId: body.journalId,
      viewerEmail: email,
      fields,
      status: 'active',
      expiresAt: expiry.expiresAt,
      createdAt,
    }, nowMs));
  }

  const id = randomHex(16);
  const hash = await sha256Hex(token);
  const emailHash = await sha256Hex(email);
  const share = {
    id,
    ownerUid: uid,
    journalId: body.journalId,
    viewerUid: viewerUid || null,
    viewerEmail: email,
    pending: !viewerUid,
    tokenHash: hash,
    fields,
    status: 'active',
    expiresAt: expiry.expiresAt,
    createdAt,
    updatedAt: createdAt,
  };
  const ttl = ttlFor(share.expiresAt, nowMs);
  await putJson(kv, recordKey(id), share, ttl);
  await kv.put(tokenKey(hash), id, { expirationTtl: ttl });
  await kv.put(ownerKey(uid, id), id, { expirationTtl: ttl });
  await kv.put(mailKey(emailHash, id), id, { expirationTtl: ttl });
  await writeAudit(kv, uid, 'create', share, nowMs);
  return json(cors, 200, issued(token, share, nowMs));
}

function issued(token, share, nowMs) {
  return {
    ok: true,
    message: SHARE_MESSAGE,
    token,
    share: publicShare(share, nowMs),
  };
}

// Called when a verified Firebase email signs in or registers. Pending rows
// for that exact address become bound to the uid. Expiry is not moved.
export async function bindPendingJournalShares(kv, { uid, email, emailVerified, nowMs }) {
  if (!kv || !uid || emailVerified !== true) return;
  const normalized = emailOf(email);
  if (!normalized) return;
  const names = await listKeys(kv, `jshare-mail:${await sha256Hex(normalized)}:`);
  for (const name of names) {
    const id = name.slice(name.lastIndexOf(':') + 1);
    const share = await loadShare(kv, id);
    if (!share || share.status === 'revoked' || share.viewerUid) continue;
    if (share.viewerEmail !== normalized || share.ownerUid === uid) continue;
    if (!(Date.parse(share.expiresAt) > nowMs)) continue;
    share.viewerUid = uid;
    share.pending = false;
    share.updatedAt = new Date(nowMs).toISOString();
    await putJson(kv, recordKey(id), share, ttlFor(share.expiresAt, nowMs));
    await writeAudit(kv, share.ownerUid, 'bind', share, nowMs);
  }
}

async function bindFromSignIn(request, deps, cors, kv, uid, nowMs) {
  const gate = await limited(deps, uid, 'jshare:bind', LIST_LIMIT);
  if (gate.error) return limitResponse(cors, gate);
  const identity = typeof deps.identity === 'function' ? await deps.identity(bearer(request)) : null;
  if (identity && identity.uid === uid && identity.emailVerified === true) {
    await bindPendingJournalShares(kv, {
      uid,
      email: identity.email,
      emailVerified: true,
      nowMs,
    });
  }
  return json(cors, 200, { ok: true });
}

async function updateShare(request, deps, cors, kv, uid, id, nowMs) {
  const gate = await limited(deps, uid, 'jshare:write', WRITE_LIMIT);
  if (gate.error) return limitResponse(cors, gate);
  const share = await loadShare(kv, id);
  if (!share || share.ownerUid !== uid) return noData(cors);
  if (share.status === 'revoked') return json(cors, 409, { error: 'השיתוף מבוטל' });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json(cors, 400, { error: 'גוף הבקשה לא תקין' });
  const touchesExpiry = body.days != null || body.expiresOn != null;
  const touchesFields = body.fields != null;
  if (!touchesExpiry && !touchesFields) return json(cors, 400, { error: 'אין מה לעדכן' });
  if (touchesExpiry) {
    const expiry = resolveShareExpiry(body, nowMs);
    if (expiry.error) return json(cors, 400, { error: expiry.error });
    share.expiresAt = expiry.expiresAt;
  }
  if (touchesFields) share.fields = normalizeShareFields(body.fields);
  share.updatedAt = new Date(nowMs).toISOString();
  const ttl = ttlFor(share.expiresAt, nowMs);
  await putJson(kv, recordKey(id), share, ttl);
  if (share.tokenHash) await kv.put(tokenKey(share.tokenHash), id, { expirationTtl: ttl });
  await writeAudit(kv, uid, 'update', share, nowMs);
  return json(cors, 200, { ok: true, share: publicShare(share, nowMs) });
}

async function revokeShare(deps, cors, kv, uid, id, nowMs) {
  const gate = await limited(deps, uid, 'jshare:write', WRITE_LIMIT);
  if (gate.error) return limitResponse(cors, gate);
  const share = await loadShare(kv, id);
  if (!share || share.ownerUid !== uid) return noData(cors);
  if (share.status !== 'revoked') {
    const hash = share.tokenHash;
    share.status = 'revoked';
    share.updatedAt = new Date(nowMs).toISOString();
    await putJson(kv, recordKey(id), share, 30 * 24 * 3600);
    if (hash) await kv.delete(tokenKey(hash));
    await writeAudit(kv, uid, 'revoke', share, nowMs);
  }
  return json(cors, 200, { ok: true, share: publicShare(share, nowMs) });
}
