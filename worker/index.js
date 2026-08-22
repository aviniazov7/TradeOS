/**
 * TradeOS Worker
 * - Web Push notifications (uid-keyed): price alerts, journal reminders,
 *   daily summaries, economic calendar, trade events
 * - Cron: the checks above + exchange sync, plan expiry, weekly digest
 * - Market data proxies + AI endpoints for the app
 */

import {
  buildMentionIndex, attributeMoves, describeFinding, ATTRIBUTION_WINDOW_MIN,
} from './newsImpact.js';

// Binance's public market-data mirror — api.binance.com returns 403 to
// Cloudflare Worker egress IPs in many regions, but data-api.binance.vision
// (same /api/v3 spot surface) isn't geo-blocked. Futures (fapi) has no mirror.
const BINANCE_SPOT = 'https://data-api.binance.vision/api/v3';
const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';
const CALENDAR_API = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
// Fast aggregated news. Free, no key, and materially faster than the RSS feeds
// below: measured live, its newest item was 2 minutes old while the six RSS
// sources ranged 12-53 minutes. It also carries Twitter/Truth Social posts
// (including @realDonaldTrump) and exchange listing notices, which no RSS feed
// here does.
const FAST_NEWS_API = 'https://news.treeofalpha.com/api/news?limit=200';

const DEFAULT_SETTINGS = {
  journal: { enabled: false, time: '21:00' },
  summary: { enabled: false, time: '22:00' },
  calendar: { enabled: false },
};

// ==================== Helpers ====================

function getIsraelTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
}
function getIsraelHHMM() {
  const n = getIsraelTime();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}
function getIsraelDateStr() {
  const n = getIsraelTime();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function formatIsraelDate() {
  const n = getIsraelTime();
  return `${String(n.getDate()).padStart(2, '0')}/${String(n.getMonth() + 1).padStart(2, '0')}/${n.getFullYear()}`;
}
function fmtPrice(p) {
  if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}
function fmtPct(v) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}
// Signed USD amount for P&L notifications, e.g. +$12.34 / -$5.00
function fmtPnl(v) {
  const sign = v >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}
// ==================== Data Fetching ====================

// Short, stable hash (FNV-1a) for building KV keys that fit the 512-byte limit.
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Map an entry timestamp to one of the SESSIONS the journal supports.
// UTC bands: London 08:00-13:00, London/NY Overlap 13:00-17:00,
// New York 17:00-22:00, Asia the rest.
function sessionFromDate(isoOrMs) {
  if (!isoOrMs) return null;
  const h = new Date(isoOrMs).getUTCHours();
  if (Number.isNaN(h)) return null;
  if (h >= 13 && h < 17) return 'London/NY Overlap';
  if (h >= 8 && h < 13) return 'London';
  if (h >= 17 && h < 22) return 'New York';
  return 'Asia';
}

// MEXC futures report volume in CONTRACTS, not coins — each symbol has a
// contractSize (e.g. BTC_USDT = 0.0001 BTC per contract). Reading holdVol/
// closeVol raw inflates quantity/positionSize (and any PnL computed from them)
// by 100x–10,000x. Fetch the public contract-detail table (symbol → size) and
// cache it in-memory for 6h. Keyed by the underscore-stripped symbol so it
// matches the `pair` we emit ("BTCUSDT").
let _mexcCsCache = null;
let _mexcCsAt = 0;
async function mexcContractSizes() {
  const now = Date.now();
  if (_mexcCsCache && now - _mexcCsAt < 6 * 60 * 60 * 1000) return _mexcCsCache;
  try {
    const r = await fetch('https://contract.mexc.com/api/v1/contract/detail');
    const d = await r.json().catch(() => ({}));
    const list = Array.isArray(d.data) ? d.data : [];
    const map = {};
    for (const c of list) {
      const s = (c.symbol || '').replace(/_/g, '');
      const cs = parseFloat(c.contractSize ?? c.contract_size);
      if (s && cs > 0) map[s] = cs;
    }
    if (Object.keys(map).length) { _mexcCsCache = map; _mexcCsAt = now; }
    return map;
  } catch { return _mexcCsCache || {}; }
}

// ── AI usage quota (daily, resets at Israel midnight) ────────────────────────
const AI_DAILY_LIMIT = 20;
const AI_IMAGE_DAILY_LIMIT = 10;
const FIREBASE_PROJECT_ID = 'tradeos-91a58';

// ── Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) ───────────────────────────
// Public key is safe to expose (the client uses it as applicationServerKey).
// The matching private key is provided to the worker as env.VAPID_JWK.
const VAPID_PUBLIC_KEY = 'BLFZCOugKM1d2jqTwgmGTF9VjFwQEMNo92l2gfNVk7eBYz1Gnrr0jFBS5jR1bRJ5MchpVkVNiqS8wtzUqouBHRk';
const VAPID_SUBJECT = 'mailto:tradeos.app@gmail.com';

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concatBytes(...arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// Sign the VAPID JWT (ES256) with the private key JWK from env.
async function vapidAuthHeader(env, audience) {
  const jwk = JSON.parse(env.VAPID_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT,
  })));
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${VAPID_PUBLIC_KEY}`;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// Encrypt `payload` (string) for a subscription's p256dh + auth keys.
async function encryptPush(p256dhB64, authB64, payload) {
  const uaPublic = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);

  // Ephemeral server keypair
  const asKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
  const uaPublicKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, asKeyPair.privateKey, 256);
  const ecdhSecret = new Uint8Array(ecdhBits);

  const enc = new TextEncoder();
  const keyInfo = concatBytes(enc.encode('WebPush: info\0'), uaPublic, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const plaintext = concatBytes(enc.encode(payload), new Uint8Array([0x02])); // single record delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext));

  // aes128gcm header: salt(16) | rs(4, =4096) | idlen(1, =65) | keyid(as_public, 65)
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  const header = concatBytes(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw);
  return concatBytes(header, ct);
}

// Send one web-push message. Returns { status, body } where status is the
// upstream HTTP status (404/410 = expired). On a thrown error during signing/
// encryption, status is 0 and body holds the error message.
async function sendWebPush(env, subscription, data) {
  if (!env.VAPID_JWK) return { status: 0, body: 'no VAPID_JWK' };
  const endpoint = subscription.endpoint;
  const { p256dh, auth } = subscription.keys || {};
  if (!endpoint || !p256dh || !auth) return { status: 0, body: 'bad subscription' };
  try {
    const body = await encryptPush(p256dh, auth, JSON.stringify(data));
    const audience = new URL(endpoint).origin;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': await vapidAuthHeader(env, audience),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': '2419200',
      },
      body,
    });
    let respBody = '';
    if (res.status < 200 || res.status >= 300) respBody = (await res.text().catch(() => '')).slice(0, 200);
    return { status: res.status, body: respBody };
  } catch (e) {
    return { status: 0, body: (e && e.message ? e.message : String(e)).slice(0, 200) };
  }
}

// Send to every subscription stored for a uid (push:{uid}:{hash} keys).
// Returns { sent, total, results } so callers (e.g. /push/test) can diagnose.
async function sendPushToUser(env, uid, data) {
  const list = await env.ALERTS_KV.list({ prefix: `push:${uid}:` });
  let sent = 0;
  const results = [];
  for (const k of list.keys) {
    const sub = await env.ALERTS_KV.get(k.name, 'json');
    if (!sub) continue;
    const { status, body } = await sendWebPush(env, sub, data);
    results.push(body ? { status, body } : { status });
    if (status === 404 || status === 410) await env.ALERTS_KV.delete(k.name); // expired
    else if (status >= 200 && status < 300) sent++;
  }
  return { sent, total: list.keys.length, results };
}

// ---- Background exchange polling for push notifications ----------------------
// Bybit v5 HMAC-SHA256 signature (hex).
async function bybitHmacHex(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Fetch recent closed positions from Bybit, normalized. Returns null on error.
async function fetchBybitClosedPnl(apiKey, apiSecret, limit = 50) {
  const ts = Date.now().toString();
  const recvWindow = '5000';
  const qs = `category=linear&limit=${Math.min(limit, 200)}`;
  const sign = await bybitHmacHex(apiSecret, ts + apiKey + recvWindow + qs);
  const res = await fetch(`https://api.bybit.com/v5/position/closed-pnl?${qs}`, {
    headers: { 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-SIGN': sign, 'X-BAPI-RECV-WINDOW': recvWindow },
  });
  const data = await res.json().catch(() => ({}));
  if (data.retCode !== 0) return null;
  return (data.result?.list || []).map((p) => {
    const exitMs = parseInt(p.updatedTime) || parseInt(p.createdTime) || 0;
    const pnl = parseFloat(p.closedPnl) || 0;
    const entryPrice = parseFloat(p.avgEntryPrice || p.entryPrice) || 0;
    const qty = parseFloat(p.qty) || 0;
    const leverage = parseFloat(p.leverage) || 1;
    // ROI% on the margin actually committed ≈ pnl / (notional / leverage).
    const margin = entryPrice > 0 && qty > 0 ? (entryPrice * qty) / leverage : 0;
    const roiPct = margin > 0 ? (pnl / margin) * 100 : 0;
    return {
      externalId: p.orderId || String(p.updatedTime || p.createdTime || Math.random()),
      pair: p.symbol,
      // closed-pnl `side` is the CLOSING order side — position side is the opposite
      direction: p.side === 'Sell' ? 'long' : 'short',
      pnl,
      roiPct,
      exitMs,
    };
  });
}

// ---- Audit log --------------------------------------------------------------
// Persistent record of every admin action (Premium grants/revokes, push
// notifications, coupon CRUD, redemptions). Keys are time-sortable in reverse
// order so a prefix list returns newest-first without an extra sort.
//   audit:{INV_TS}:{rand} → JSON event
// INV_TS = (10^13 - 1) - Date.now(), zero-padded to 13 digits.
async function appendAudit(env, event) {
  try {
    const ts = Date.now();
    const inv = String(9_999_999_999_999 - ts).padStart(13, '0');
    const rand = Math.random().toString(36).slice(2, 10);
    const key = `audit:${inv}:${rand}`;
    const value = JSON.stringify({ ...event, ts, ts_iso: new Date(ts).toISOString() });
    // 365-day TTL — long enough to be useful, bounded enough to keep KV slim.
    await env.ALERTS_KV.put(key, value, { expirationTtl: 60 * 60 * 24 * 365 });
  } catch { /* never let logging break an admin action */ }
}

// ---- Premium coupons --------------------------------------------------------
// KV-stored single-use-per-user codes. Lighter than a Firestore collection and
// keeps the admin's CRUD off the client's Firestore quota.
//   coupon:{CODE}                → { days, maxUses, used, expiresAt?, label?, createdBy, createdAt }
//   coupon-redeemed:{CODE}:{uid} → "1"   (presence = this user already redeemed)
const COUPON_CODE_RE = /^[A-Z0-9_-]{3,32}$/;
const normalizeCouponCode = (s) => String(s || '').trim().toUpperCase();

// ---- Premium expiry reminders ----------------------------------------------
// Push the user a heads-up 3 days before their Premium ends, and one on the
// day it ends. Indexed by date so the cron is O(1) per day (lists keys with
// the prefix of today's IL date instead of scanning the whole user base).
// Schema:
//   pxr-warn:{YYYY-MM-DD}:{uid}  → "1" (send 3d-out reminder)
//   pxr-end:{YYYY-MM-DD}:{uid}   → "1" (send day-of reminder)
//   pxr-ptr:{uid} → JSON({ warnDate, endDate }) so grant overwrites cleanly
//                  and revoke can target the old keys for deletion.
function isoDateOffsetIL(base, dayOffset) {
  // 'base' is a Date in UTC. We want YYYY-MM-DD in Israel time, +/- dayOffset days.
  const d = new Date(base.getTime() + dayOffset * 86400000);
  const il = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return `${il.getFullYear()}-${String(il.getMonth() + 1).padStart(2, '0')}-${String(il.getDate()).padStart(2, '0')}`;
}

async function schedulePlanExpiryReminders(env, uid, planExpiresISO) {
  await cancelPlanExpiryReminders(env, uid); // overwrite any previous schedule
  if (!planExpiresISO) return; // lifetime — nothing to remind about
  const end = new Date(planExpiresISO);
  if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) return;
  const warnDate = isoDateOffsetIL(end, -3);
  const endDate = isoDateOffsetIL(end, 0);
  // 95-day TTL: a yearly plan still has its 'end' reminder reachable, and
  // anything beyond that is a fringe case.
  const TTL = 60 * 60 * 24 * 95;
  await env.ALERTS_KV.put(`pxr-warn:${warnDate}:${uid}`, '1', { expirationTtl: TTL });
  await env.ALERTS_KV.put(`pxr-end:${endDate}:${uid}`, '1', { expirationTtl: TTL });
  await env.ALERTS_KV.put(`pxr-ptr:${uid}`, JSON.stringify({ warnDate, endDate }), { expirationTtl: TTL });
}

async function cancelPlanExpiryReminders(env, uid) {
  const raw = await env.ALERTS_KV.get(`pxr-ptr:${uid}`);
  if (!raw) return;
  try {
    const { warnDate, endDate } = JSON.parse(raw);
    if (warnDate) await env.ALERTS_KV.delete(`pxr-warn:${warnDate}:${uid}`);
    if (endDate) await env.ALERTS_KV.delete(`pxr-end:${endDate}:${uid}`);
  } catch { /* swallow */ }
  await env.ALERTS_KV.delete(`pxr-ptr:${uid}`);
}

// Cron entry. Fires the reminders for any uid keyed under today's date, then
// removes them. Only the first 10-min tick that lands inside the 09:00–09:10
// IL window each day actually does work — earlier ticks see no matching keys
// (or the same ones, but the firing is idempotent because we delete on send).
async function checkPlanExpiryReminders(env) {
  const hhmm = getIsraelHHMM();
  if (hhmm < '09:00' || hhmm >= '09:10') return; // run once per day
  const today = getIsraelDateStr();

  const warns = await env.ALERTS_KV.list({ prefix: `pxr-warn:${today}:` });
  for (const k of warns.keys) {
    const uid = k.name.slice(`pxr-warn:${today}:`.length);
    if (!uid) continue;
    await sendPushToUser(env, uid, {
      title: '⏰ המנוי שלך עומד להסתיים',
      body: 'נשארו לך 3 ימים ל-TradeOS Premium. חדש עכשיו כדי לא לאבד את הגישה לפיצ\'רים המתקדמים.',
      url: '/premium',
      tag: `pxr-warn-${uid}`,
    });
    await env.ALERTS_KV.delete(k.name);
  }

  const ends = await env.ALERTS_KV.list({ prefix: `pxr-end:${today}:` });
  for (const k of ends.keys) {
    const uid = k.name.slice(`pxr-end:${today}:`.length);
    if (!uid) continue;
    await sendPushToUser(env, uid, {
      title: '🔒 המנוי שלך הסתיים',
      body: 'תקופת ה-Premium שלך הסתיימה. שדרג שוב כדי לחזור לפיצ\'רים — הנתונים שלך נשמרו.',
      url: '/premium',
      tag: `pxr-end-${uid}`,
    });
    await env.ALERTS_KV.delete(k.name);
    await env.ALERTS_KV.delete(`pxr-ptr:${uid}`); // chain is done; clean the pointer
  }
}

// ---- Churn detection -------------------------------------------------------
// Once a day, list all users (as admin), find Premium customers who haven't
// opened the app in 7+ days, and push the admin(s) a heads-up so they can
// reach out before the customer drifts away. De-duped per customer for 7 days
// so the same churned user isn't re-reported every morning.
async function listAllUsersAdmin(env) {
  const token = await getFirebaseAdminToken(env);
  const out = [];
  let pageToken = '';
  for (let page = 0; page < 20; page++) { // hard cap so we never loop forever
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    for (const doc of data.documents || []) {
      const f = doc.fields || {};
      out.push({
        uid: doc.name.split('/').pop(),
        role: f.role?.stringValue || 'user',
        plan: f.plan?.stringValue || 'free',
        planExpires: f.planExpires?.timestampValue || f.planExpires?.stringValue || null,
        planGrantedAt: f.planGrantedAt?.timestampValue || f.planGrantedAt?.stringValue || null,
        createdAt: f.createdAt?.timestampValue || f.createdAt?.stringValue || null,
        lastActive: f.lastActive?.timestampValue || f.lastActive?.stringValue || null,
        email: f.email?.stringValue || null,
        displayName: f.displayName?.stringValue || f.email?.stringValue || 'משתמש',
      });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

async function checkChurnedPremium(env) {
  const hhmm = getIsraelHHMM();
  if (hhmm < '10:00' || hhmm >= '10:10') return; // run once per day
  if (!env.FIREBASE_SERVICE_ACCOUNT) return;     // needs admin token to list users

  let users;
  try { users = await listAllUsersAdmin(env); }
  catch (e) { console.error('churn: list users failed', e); return; }
  if (!users.length) return;

  const now = Date.now();
  const SEVEN_DAYS = 7 * 86400000;
  const admins = users.filter((u) => u.role === 'admin').map((u) => u.uid);
  if (!admins.length) return;

  const isPrem = (u) => u.role === 'admin'
    || (u.plan === 'premium' && (!u.planExpires || new Date(u.planExpires).getTime() > now));

  for (const u of users) {
    if (u.role === 'admin' || !isPrem(u)) continue;
    const la = u.lastActive ? new Date(u.lastActive).getTime() : 0;
    if (!la) continue;                       // never seen — skip (not "churn")
    const gone = now - la;
    if (gone < SEVEN_DAYS) continue;

    // De-dupe: only report each churned customer once per 7 days.
    const dedupeKey = `churn:${u.uid}`;
    if (await env.ALERTS_KV.get(dedupeKey)) continue;
    await env.ALERTS_KV.put(dedupeKey, '1', { expirationTtl: 60 * 60 * 24 * 7 });

    const days = Math.floor(gone / 86400000);
    for (const adminUid of admins) {
      await sendPushToUser(env, adminUid, {
        title: '⚠️ לקוח בסיכון נטישה',
        body: `${u.displayName} לא נכנס ${days} ימים — אולי כדאי לשלוח הודעה.`,
        url: '/admin',
        tag: `churn-${u.uid}`,
      });
    }
  }
}

// ---- Email sending (Resend) -----------------------------------------------
// Thin wrapper around Resend's REST API. Returns {ok, status} so callers can
// log without blowing up the cron. Skips silently if RESEND_API_KEY isn't set
// — the rest of the cron (push) keeps working.
async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) return { ok: false, status: 0, skipped: 'no-api-key' };
  if (!to) return { ok: false, status: 0, skipped: 'no-recipient' };
  const from = env.MAIL_FROM_ADDRESS
    ? `${env.MAIL_FROM_NAME || 'TradeOS'} <${env.MAIL_FROM_ADDRESS}>`
    : 'TradeOS <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Resend send failed:', res.status, detail);
      // Try to extract Resend's human-readable error message.
      let message = '';
      try { message = JSON.parse(detail).message || ''; } catch { /* not JSON */ }
      return { ok: false, status: res.status, message: message || detail.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    console.error('Resend send threw:', e);
    return { ok: false, status: 0, error: e.message };
  }
}

// Branded RTL email shell. All CSS is inlined because most mail clients strip
// <style> blocks. The CTA button uses table-based layout for Outlook
// compatibility.
function emailShell({ headline, intro, ctaText, ctaUrl, body, footer }) {
  const APP_URL = 'https://tradeos-91a58.web.app';
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const cta = ctaUrl && ctaText ? `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto 8px">
      <tr><td align="center" bgcolor="#00bfff" style="border-radius:10px">
        <a href="${esc(ctaUrl)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#0a0e16;text-decoration:none;border-radius:10px">${esc(ctaText)}</a>
      </td></tr>
    </table>` : '';
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head>
<body bgcolor="#0a0e16" style="margin:0;padding:0;background:#0a0e16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0a0e16" style="background:#0a0e16">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0f1521" style="max-width:560px;background:#0f1521;border:1px solid rgba(0,191,255,0.18);border-radius:16px;overflow:hidden">
        <!-- Header / brand -->
        <tr><td style="padding:24px 28px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:right">
          <div style="display:inline-block;vertical-align:middle">
            <span style="font-size:20px;font-weight:bold;color:#e5e7eb">TradeOS</span>
            <span style="display:inline-block;margin-right:6px;color:#00bfff;font-size:12px;letter-spacing:1px">— יומן מסחר חכם</span>
          </div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 28px;color:#e5e7eb;text-align:right;line-height:1.6">
          <h1 style="margin:0 0 12px;font-size:22px;color:#e5e7eb;font-weight:bold">${esc(headline)}</h1>
          ${intro ? `<p style="margin:0 0 16px;font-size:15px;color:#cbd0d8">${esc(intro)}</p>` : ''}
          ${body || ''}
          ${cta}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:18px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:right">
          <p style="margin:0;font-size:12px;color:#7d8492">${footer || `קיבלת את ההודעה הזו כי יש לך חשבון פעיל ב-TradeOS. <a href="${APP_URL}" style="color:#00bfff;text-decoration:none">פתח את האפליקציה</a>`}</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#5a6171;text-align:center">TradeOS &copy; ${new Date().getFullYear()}</p>
    </td></tr>
  </table>
</body></html>`;
}

// Branded confirmation email for a Premium grant — payment, gift, or coupon
// redemption. Shared by /admin/payment-email and the coupon-redeem flow so
// every path sends the same polished email.
function buildPremiumEmail({ kind = 'payment', name, amount, methodLabel, days, expiresStr, code }) {
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const row = (label, value) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#7d8492;text-align:right">${esc(label)}</td>
      <td style="padding:8px 0;font-size:14px;color:#e5e7eb;font-weight:bold;text-align:left" dir="ltr">${esc(value)}</td>
    </tr>`;
  const rows = [];
  if (kind === 'payment' && amount > 0) rows.push(row('סכום ששולם', `₪${amount}`));
  if (kind === 'payment' && methodLabel) rows.push(row('אמצעי תשלום', methodLabel));
  if (kind === 'coupon' && code) rows.push(row('קוד קופון', code));
  rows.push(row('תקופת המנוי', days ? `${days} ימים` : 'ללא הגבלה'));
  if (expiresStr) rows.push(row('בתוקף עד', expiresStr));

  const featureLi = (t) => `<li style="margin:0 0 6px;font-size:14px;color:#cbd0d8">${esc(t)}</li>`;
  const body = `
    <div style="background:rgba(0,191,255,0.06);border:1px solid rgba(0,191,255,0.22);border-radius:12px;padding:6px 18px;margin:4px 0 18px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows.join('')}</table>
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:#e5e7eb;font-weight:bold">מה נפתח לך עכשיו:</p>
    <ul style="margin:0 0 4px;padding-right:18px;text-align:right">
      ${featureLi('TradeAI ללא הגבלה — שאלות, ניתוחי גרפים ותובנות')}
      ${featureLi('ניתוח AI מלא של יומן המסחר')}
      ${featureLi('יומני מסחר, ארנקים והתראות ללא הגבלה')}
      ${featureLi('חיבורי בורסה וניתוחים מתקדמים')}
    </ul>
    ${kind === 'payment' ? '<p style="margin:14px 0 0;font-size:12px;color:#7d8492">אישור זה נשלח לנוחותך ואינו מהווה חשבונית מס/קבלה.</p>' : ''}`;

  const first = (name || '').trim().split(/\s+/)[0];
  const hey = first ? `היי ${first}, ` : '';
  const meta = {
    payment: { subject: '👑 התשלום התקבל — ברוך הבא ל-TradeOS Premium', headline: 'התשלום התקבל — אתה Premium! 👑', intro: `${hey}תודה על התשלום! המנוי הופעל בחשבונך והכל כבר פתוח.` },
    gift: { subject: '🎁 קיבלת מתנה — TradeOS Premium', headline: 'קיבלת Premium במתנה! 🎁', intro: `${hey}הופעל לך מנוי Premium בחשבון — ליהנות!` },
    coupon: { subject: '🎉 הקופון מומש — TradeOS Premium הופעל', headline: 'הקופון מומש בהצלחה! 🎉', intro: `${hey}מימשת קוד קופון ומנוי ה-Premium שלך פעיל.` },
  }[kind] || {};
  return {
    subject: meta.subject,
    html: emailShell({ headline: meta.headline, intro: meta.intro, body, ctaText: 'פתח את TradeOS', ctaUrl: 'https://tradeos-91a58.web.app' }),
  };
}

// Build the weekly admin digest content (stats + push body + email html).
// Shared between the Sunday cron and the on-demand /admin/test-digest endpoint
// so they're guaranteed to look identical.
function buildAdminDigest(users) {
  const now = Date.now();
  const WEEK = 7 * 86400000;
  const isPrem = (u) => u.plan === 'premium' && (!u.planExpires || new Date(u.planExpires).getTime() > now);
  const ms = (v) => (v ? new Date(v).getTime() : 0);

  let newUsers = 0, upgrades = 0, expiringSoon = 0, churn = 0;
  for (const u of users) {
    if (u.role === 'admin') continue;
    if (now - ms(u.createdAt) < WEEK && ms(u.createdAt) > 0) newUsers++;
    if (isPrem(u) && now - ms(u.planGrantedAt) < WEEK && ms(u.planGrantedAt) > 0) upgrades++;
    if (isPrem(u) && u.planExpires) {
      const exp = ms(u.planExpires) - now;
      if (exp > 0 && exp < WEEK) expiringSoon++;
    }
    if (isPrem(u) && ms(u.lastActive) > 0 && now - ms(u.lastActive) >= WEEK) churn++;
  }

  const pushBody = `📈 ${newUsers} נרשמו · 👑 ${upgrades} שדרגו · ⏳ ${expiringSoon} עומדים להסתיים · ⚠️ ${churn} בסיכון נטישה`;
  const emailBody = `
    <div style="display:grid;gap:10px;margin:8px 0 4px">
      <div style="background:rgba(0,191,255,0.08);border:1px solid rgba(0,191,255,0.25);border-radius:10px;padding:14px 16px;text-align:right">
        <div style="font-size:11px;color:#7d8492">חדשים השבוע</div>
        <div style="font-size:24px;font-weight:bold;color:#00bfff">📈 ${newUsers}</div>
      </div>
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:14px 16px;text-align:right">
        <div style="font-size:11px;color:#7d8492">שדרגו ל-Premium</div>
        <div style="font-size:24px;font-weight:bold;color:#f59e0b">👑 ${upgrades}</div>
      </div>
      <div style="background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:14px 16px;text-align:right">
        <div style="font-size:11px;color:#7d8492">מנויים שעומדים להסתיים השבוע</div>
        <div style="font-size:24px;font-weight:bold;color:#f59e0b">⏳ ${expiringSoon}</div>
      </div>
      <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:14px 16px;text-align:right">
        <div style="font-size:11px;color:#7d8492">לקוחות בסיכון נטישה</div>
        <div style="font-size:24px;font-weight:bold;color:#ef4444">⚠️ ${churn}</div>
      </div>
    </div>`;
  return { newUsers, upgrades, expiringSoon, churn, pushBody, emailBody };
}

// ---- Weekly admin digest ---------------------------------------------------
// Every Sunday morning, push the admin(s) a one-line summary of the week:
// new signups, upgrades, customers about to expire, and churn risk. Lets the
// owner stay on top of the business without opening the panel.
async function checkWeeklyDigest(env) {
  const il = getIsraelTime();
  if (il.getDay() !== 0) return;                 // Sunday only
  const hhmm = getIsraelHHMM();
  if (hhmm < '09:00' || hhmm >= '09:10') return; // once that morning
  if (!env.FIREBASE_SERVICE_ACCOUNT) return;

  // Dedupe per week so a restart in the window doesn't double-send.
  const wk = getIsraelDateStr();
  if (await env.ALERTS_KV.get(`digest:${wk}`)) return;
  await env.ALERTS_KV.put(`digest:${wk}`, '1', { expirationTtl: 60 * 60 * 24 * 8 });

  let users;
  try { users = await listAllUsersAdmin(env); }
  catch (e) { console.error('digest: list users failed', e); return; }
  if (!users.length) return;

  const admins = users.filter((u) => u.role === 'admin').map((u) => u.uid);
  if (!admins.length) return;

  const digest = buildAdminDigest(users);
  for (const adminUid of admins) {
    await sendPushToUser(env, adminUid, {
      title: '📊 הסיכום השבועי שלך — TradeOS',
      body: digest.pushBody,
      url: '/admin',
      tag: 'weekly-digest',
    });
  }

  // Email digest — same content as push, prettier presentation. Each admin
  // gets a one-glance dashboard in their inbox. MAIL_TO_ADMIN_OVERRIDE pins
  // the recipient to a fixed address (see /admin/test-digest for why).
  const adminUsers = users.filter((u) => u.role === 'admin' && u.email);
  if (adminUsers.length === 0 && !env.MAIL_TO_ADMIN_OVERRIDE) return;
  const html = emailShell({
    headline: '📊 הסיכום השבועי שלך',
    intro: `הנה הדופק של TradeOS השבוע, ${il.toLocaleDateString('he-IL', { day: '2-digit', month: 'long' })}.`,
    body: digest.emailBody,
    ctaText: 'פתח את פאנל הניהול',
    ctaUrl: 'https://tradeos-91a58.web.app/admin',
  });
  const recipients = env.MAIL_TO_ADMIN_OVERRIDE
    ? [env.MAIL_TO_ADMIN_OVERRIDE]
    : adminUsers.map((a) => a.email);
  for (const to of recipients) {
    await sendEmail(env, { to, subject: '📊 הסיכום השבועי שלך — TradeOS', html });
  }
}

// Fetch currently-open Bybit positions, normalized. Returns null on error.
async function fetchBybitOpen(apiKey, apiSecret) {
  const ts = Date.now().toString();
  const recvWindow = '5000';
  const qs = 'category=linear&settleCoin=USDT';
  const sign = await bybitHmacHex(apiSecret, ts + apiKey + recvWindow + qs);
  const res = await fetch(`https://api.bybit.com/v5/position/list?${qs}`, {
    headers: { 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-SIGN': sign, 'X-BAPI-RECV-WINDOW': recvWindow },
  });
  const data = await res.json().catch(() => ({}));
  if (data.retCode !== 0) return null;
  return (data.result?.list || []).filter((p) => parseFloat(p.size) > 0).map((p) => ({
    id: `${p.symbol}_${p.side}`,
    pair: p.symbol,
    direction: p.side === 'Buy' ? 'long' : 'short',
    entryPrice: parseFloat(p.avgPrice) || 0,
    leverage: parseFloat(p.leverage) || 1,
  }));
}


// pushexch:{uid}:{exchange}) for newly closed trades → push a result
// notification, plus a once-a-day summary. Runs from the 10-minute cron.
async function checkExchangeClosedTrades(env) {
  if (!env.VAPID_JWK) return; // can't sign pushes without the private key

  const hhmm = getIsraelHHMM();
  // Read the rolled-up index instead of a KV list per tick; rebuild it from a
  // real list once a day (04:00 window) to heal any index drift.
  const keyNames = (hhmm >= '04:00' && hhmm < '04:10')
    ? await rebuildPushexchIndex(env)
    : await getPushexchKeys(env);
  if (!keyNames.length) return;

  const israelDate = getIsraelDateStr();
  // Daily summary fires once, in the 22:00 cron tick (cron runs every 10 min).
  const summaryWindow = hhmm >= '22:00' && hhmm < '22:10';
  const it = getIsraelTime();
  const dayStartMs = Date.now() - ((it.getHours() * 3600 + it.getMinutes() * 60 + it.getSeconds()) * 1000);

  for (const name of keyNames) {
    const [, uid, exchange] = name.split(':');
    if (exchange !== 'bybit') continue; // only Bybit polling for now
    const creds = await loadExchangeCreds(env, uid, exchange); // decrypts + self-heals legacy plaintext
    if (!creds?.apiKey || !creds?.apiSecret) {
      // Key expired (CREDS_TTL) or was deleted — prune it from the index so
      // the cron stops re-checking a dead entry.
      await pushexchIndexRemove(env, (n) => n === name).catch(() => {});
      continue;
    }

    // ---- Position-opened notifications ----
    // Compare the live open positions to the snapshot from the previous tick;
    // anything new → "position opened". First run only seeds the snapshot.
    const openPositions = await fetchBybitOpen(creds.apiKey, creds.apiSecret);
    if (openPositions) {
      const openKey = `pushopen:${uid}:${exchange}`;
      const prevRaw = await env.ALERTS_KV.get(openKey);
      const curIds = openPositions.map((p) => p.id);
      if (prevRaw !== null) {
        const prev = new Set(JSON.parse(prevRaw));
        const opened = openPositions.filter((p) => !prev.has(p.id)).slice(0, 5);
        for (const p of opened) {
          const dir = p.direction === 'long' ? 'Long' : 'Short';
          await sendPushToUser(env, uid, {
            title: `🔵 נפתחה עסקה — ${p.pair} ${dir}`,
            body: `כניסה: ${fmtPrice(p.entryPrice)}${p.leverage > 1 ? ` · מינוף ${p.leverage}x` : ''}`,
            url: '/journal',
            tag: `open-${p.id}`,
          });
        }
      }
      // Only write when the open-position set actually changed — the previous
      // unconditional write ran every 10-min tick for every exchange user and
      // alone blew the KV daily write quota.
      const curJson = JSON.stringify(curIds);
      if (prevRaw !== curJson) {
        await env.ALERTS_KV.put(openKey, curJson, { expirationTtl: 60 * 60 * 24 * 7 });
      }
    }

    const trades = await fetchBybitClosedPnl(creds.apiKey, creds.apiSecret, 50);
    if (!trades || !trades.length) continue;

    // ---- New-closed notifications ----
    const cursorKey = `pushcursor:${uid}:${exchange}`;
    const cursorRaw = await env.ALERTS_KV.get(cursorKey);
    const maxExit = Math.max(...trades.map((t) => t.exitMs));
    if (cursorRaw === null) {
      // First run for this user: start watching from now, don't replay history.
      await env.ALERTS_KV.put(cursorKey, String(maxExit), { expirationTtl: 60 * 60 * 24 * 60 });
    } else {
      const cursor = parseInt(cursorRaw) || 0;
      const fresh = trades
        .filter((t) => t.exitMs > cursor)
        .sort((a, b) => a.exitMs - b.exitMs)
        .slice(0, 5); // anti-flood per tick — the overflow ships on later ticks
      for (const t of fresh) {
        const dedupKey = `pushsent:${uid}:${t.externalId}`;
        if (await env.ALERTS_KV.get(dedupKey)) continue;
        await env.ALERTS_KV.put(dedupKey, '1', { expirationTtl: 60 * 60 * 24 * 3 });
        const win = t.pnl >= 0;
        const dir = t.direction === 'long' ? 'Long' : 'Short';
        // A profitable close ≈ take-profit hit; a losing close ≈ stop-loss hit.
        await sendPushToUser(env, uid, {
          title: win
            ? `🎯 טייק פרופיט — ${t.pair} ${dir}`
            : `🛑 סטופ לוס — ${t.pair} ${dir}`,
          body: `${win ? 'רווח' : 'הפסד'}: ${fmtPnl(t.pnl)} (${fmtPct(t.roiPct)})`,
          url: '/journal',
          tag: `closed-${t.externalId}`,
        });
      }
      // Advance the cursor only to the newest close we actually PROCESSED —
      // advancing straight to maxExit permanently skipped every close between
      // the 5 oldest and the newest (7 closes in one window → 2 vanished).
      // The overflow stays above the cursor and ships on the next ticks;
      // pushsent dedup guards against any replay.
      const newCursor = fresh.length ? fresh[fresh.length - 1].exitMs : maxExit;
      if (newCursor > cursor) await env.ALERTS_KV.put(cursorKey, String(newCursor), { expirationTtl: 60 * 60 * 24 * 60 });
    }

    // ---- Daily summary (once per Israel day, ~22:00) ----
    if (summaryWindow) {
      const sentKey = `pushdaily:${uid}:${israelDate}`;
      if (!(await env.ALERTS_KV.get(sentKey))) {
        await env.ALERTS_KV.put(sentKey, '1', { expirationTtl: 60 * 60 * 48 });
        const todays = trades.filter((t) => t.exitMs >= dayStartMs);
        if (todays.length) {
          const total = todays.reduce((s, t) => s + t.pnl, 0);
          const wins = todays.filter((t) => t.pnl >= 0).length;
          const wr = Math.round((wins / todays.length) * 100);
          await sendPushToUser(env, uid, {
            title: `📊 סיכום יומי — ${todays.length} עסקאות`,
            body: `P&L יומי: ${fmtPnl(total)} · אחוז הצלחה ${wr}%`,
            url: '/dashboard',
            tag: `daily-${israelDate}`,
          });
        }
      }
    }
  }
}

// ---- Firebase ID-token verification ----------------------------------------
// Google publishes the RSA public keys (JWK form) used to sign Firebase ID
// tokens. Using the JWK endpoint lets SubtleCrypto.importKey('jwk', …) consume
// them directly — no fragile X.509/DER parsing. Imported keys are cached for
// the worker instance lifetime (refreshed every 30 min).
let GOOGLE_KEYS_CACHE = { keys: null, fetchedAt: 0 };
const GOOGLE_JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

function b64urlToBytesLocal(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4; if (pad) s += '='.repeat(4 - pad);
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getGoogleKeys() {
  const fresh = GOOGLE_KEYS_CACHE.keys && (Date.now() - GOOGLE_KEYS_CACHE.fetchedAt) < 30 * 60 * 1000;
  if (fresh) return GOOGLE_KEYS_CACHE.keys;
  // Google's signing keys rotate far slower than this 30-min cache. If the
  // refetch fails (network blip / non-ok) but we still hold a previously-fetched
  // key set, keep serving it rather than throwing — otherwise a momentary JWKS
  // outage right after expiry 401s EVERY token-gated endpoint (all of AI
  // included) even though the cached keys are still valid. fetchedAt is left
  // stale on fallback so the next call retries the refresh promptly.
  let res;
  try {
    res = await fetch(GOOGLE_JWK_URL);
  } catch (e) {
    if (GOOGLE_KEYS_CACHE.keys) return GOOGLE_KEYS_CACHE.keys;
    throw e;
  }
  if (!res.ok) {
    if (GOOGLE_KEYS_CACHE.keys) return GOOGLE_KEYS_CACHE.keys;
    throw new Error('fetch keys failed');
  }
  const { keys } = await res.json();
  const map = {};
  for (const jwk of (keys || [])) {
    if (!jwk.kid) continue;
    try {
      map[jwk.kid] = await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
    } catch { /* skip bad key */ }
  }
  GOOGLE_KEYS_CACHE = { keys: map, fetchedAt: Date.now() };
  return map;
}

// Verify a Firebase ID token: signature + standard claims. Returns the uid on
// success, null on any failure. Pinned to the tradeos-91a58 project so a token
// from a different project (or a forged unsigned token) is rejected.
async function verifyFirebaseToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (header.alg !== 'RS256' || !header.kid) return null;

    const keys = await getGoogleKeys();
    const key = keys[header.kid];
    if (!key) return null;

    const sig = b64urlToBytesLocal(parts[2]);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (payload.iat && payload.iat > now + 60) return null;
    if (payload.aud !== FIREBASE_PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
    if (!payload.sub) return null;
    return payload.sub;
  } catch { return null; }
}


async function getAiUsage(env, uid) {
  const date = getIsraelDateStr();
  const key = `aiusage:${uid}:${date}`;
  const v = await env.ALERTS_KV.get(key);
  return { used: v ? parseInt(v, 10) || 0 : 0, limit: AI_DAILY_LIMIT, date };
}

async function incrementAiUsage(env, uid) {
  const date = getIsraelDateStr();
  const key = `aiusage:${uid}:${date}`;
  const v = await env.ALERTS_KV.get(key);
  const used = (v ? parseInt(v, 10) || 0 : 0) + 1;
  // 48h TTL so the entry survives across midnight and a small clock skew
  await env.ALERTS_KV.put(key, String(used), { expirationTtl: 172800 });
  return used;
}

// Chart-image analyses get their own (much smaller) daily budget on top of the
// regular request counter — vision calls burn far more tokens than text.
async function getAiImageUsage(env, uid) {
  const date = getIsraelDateStr();
  const key = `aiimg:${uid}:${date}`;
  const v = await env.ALERTS_KV.get(key);
  return { used: v ? parseInt(v, 10) || 0 : 0, limit: AI_IMAGE_DAILY_LIMIT, date };
}

// Refund a prepaid quota charge (#202): quotas are now charged BEFORE the
// provider call (check-then-serve raced under parallel bursts and let a free
// user blow past the daily cap), so a provider failure refunds the charge to
// preserve the "failed calls don't burn quota" behavior.
async function decrementKvCounter(env, key) {
  const v = parseInt(await env.ALERTS_KV.get(key), 10) || 0;
  if (v > 0) await env.ALERTS_KV.put(key, String(v - 1), { expirationTtl: 172800 });
}
async function refundAiCharge(env, uid, hasImage) {
  const date = getIsraelDateStr();
  await decrementKvCounter(env, `aiusage:${uid}:${date}`);
  if (hasImage) await decrementKvCounter(env, `aiimg:${uid}:${date}`);
}

async function incrementAiImageUsage(env, uid) {
  const date = getIsraelDateStr();
  const key = `aiimg:${uid}:${date}`;
  const v = await env.ALERTS_KV.get(key);
  const used = (v ? parseInt(v, 10) || 0 : 0) + 1;
  await env.ALERTS_KV.put(key, String(used), { expirationTtl: 172800 });
  return used;
}

// Persistent daily AI stats (request counts + real token usage) for the admin
// time graph. Kept ~95 days (vs the 48h per-user quota counters) so we can show
// 7/30-day trends and an accurate, token-based cost.
async function recordAiStat(env, date, { text = 0, image = 0, tokIn = 0, tokOut = 0 }) {
  const key = `aistat:${date}`;
  const cur = (await env.ALERTS_KV.get(key, 'json')) || { text: 0, image: 0, tokIn: 0, tokOut: 0 };
  cur.text += text; cur.image += image; cur.tokIn += tokIn; cur.tokOut += tokOut;
  await env.ALERTS_KV.put(key, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 95 });
}

// Pass an OpenAI-style SSE stream straight through to the client while reading
// its final usage chunk (prompt/completion tokens) for accounting. Metering is
// best-effort and never alters or blocks what the client receives.
function meterStream(env, upstream, { hasImage }) {
  if (!upstream) return upstream;
  const date = getIsraelDateStr();
  const decoder = new TextDecoder();
  let buf = '';
  let usage = null;
  const ts = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk); // pass through untouched
      try {
        buf += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            if (obj.usage) usage = obj.usage;
          } catch { /* partial / non-JSON line */ }
        }
      } catch { /* best-effort */ }
    },
    async flush() {
      try {
        await recordAiStat(env, date, {
          text: 1,
          image: hasImage ? 1 : 0,
          tokIn: usage?.prompt_tokens || 0,
          tokOut: usage?.completion_tokens || 0,
        });
      } catch { /* best-effort */ }
    },
  });
  return upstream.pipeThrough(ts);
}

// Confirm the caller is an admin by reading their own user doc via Firestore
// REST with their ID token — admin reads are allowed by our rules, so we don't
// need a service account here.
async function verifyAdminFromToken(token) {
  const uid = await verifyFirebaseToken(token);
  if (!uid || !token) return null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const data = await r.json();
    return data.fields?.role?.stringValue === 'admin' ? uid : null;
  } catch { return null; }
}

// Is the user on an active premium plan? Reads users/{uid} via Firestore REST
// with the caller's own (verified) token, cached 10 min in KV to avoid a read
// on every request. Admins count as premium. Plan is admin/server-writable
// only (enforced by Firestore rules), so this can't be spoofed by the client.
// ---- Firebase Admin (service account) --------------------------------------
// Signs a service-account JWT, exchanges it for an OAuth2 access token at
// oauth2.googleapis.com/token, and uses that to call Firestore REST as admin.
// Required when the worker must write to a user doc (the user can't change
// their own plan/planExpires under our Firestore rules, and admin role is
// resolved on the client). Token cached in module-global for its lifetime.

let GAPI_TOKEN_CACHE = { token: null, expiresAt: 0 };

function pemToPkcs8(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  return b64urlToBytesLocal(body.replace(/\+/g, '-').replace(/\//g, '_'));
}

// Cloudflare quota usage (KV operations + Workers invocations) for TODAY, via
// the GraphQL Analytics API. Read-only; needs CF_API_TOKEN (Account Analytics
// Read) + CF_ACCOUNT_ID. Cached 5 min in the Cache API — deliberately NOT in KV,
// so measuring the quota doesn't itself consume it. Fully best-effort: any
// failure returns an `error` string and zeros, never throws.
const CF_QUOTA_LIMITS = { kvRead: 100000, kvWrite: 1000, kvDelete: 1000, kvList: 1000, workers: 100000 };
async function fetchCloudflareQuotas(env) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { configured: false };

  const cacheKey = new Request('https://internal.tradeos/cf-quotas');
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) { try { return await cached.json(); } catch { /* fall through */ } }

  const dayStr = new Date().toISOString().slice(0, 10);      // YYYY-MM-DD (UTC)
  const sinceIso = `${dayStr}T00:00:00Z`;
  const query = `query Q($tag: String!, $date: Date!, $since: Time!) {
    viewer { accounts(filter: { accountTag: $tag }) {
      kvOperationsAdaptiveGroups(limit: 100, filter: { date_geq: $date }) {
        sum { requests } dimensions { actionType }
      }
      workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: $since }) {
        sum { requests }
      }
    } }
  }`;

  const out = {
    configured: true, error: null, updatedAt: Date.now(),
    kv: { read: 0, write: 0, delete: 0, list: 0 },
    workers: { requests: 0 },
    limits: CF_QUOTA_LIMITS,
  };
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { tag: env.CF_ACCOUNT_ID, date: dayStr, since: sinceIso } }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.errors && j.errors.length) out.error = j.errors[0]?.message || 'graphql error';
    const acct = j?.data?.viewer?.accounts?.[0];
    if (acct) {
      for (const g of acct.kvOperationsAdaptiveGroups || []) {
        const t = g?.dimensions?.actionType;
        const req = g?.sum?.requests || 0;
        if (t && out.kv[t] != null) out.kv[t] += req;
      }
      out.workers.requests = (acct.workersInvocationsAdaptive || [])
        .reduce((s, g) => s + (g?.sum?.requests || 0), 0);
    } else if (!out.error) {
      out.error = 'no account data';
    }
  } catch (e) {
    out.error = String(e?.message || e);
  }

  try {
    await cache.put(cacheKey, new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
    }));
  } catch { /* cache put is best-effort */ }
  return out;
}

async function getFirebaseAdminToken(env) {
  if (GAPI_TOKEN_CACHE.token && Date.now() < GAPI_TOKEN_CACHE.expiresAt - 60_000) {
    return GAPI_TOKEN_CACHE.token;
  }
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error('FIREBASE_SERVICE_ACCOUNT missing');
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
    iat: now,
    exp: now + 3600,
  };
  const enc = (o) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;

  const keyBytes = pemToPkcs8(sa.private_key);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!res.ok) throw new Error(`oauth ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  GAPI_TOKEN_CACHE = { token: data.access_token, expiresAt: Date.now() + (data.expires_in * 1000) };
  return data.access_token;
}

// PATCH /users/{uid} as admin. `fields` is a partial Firestore field map
// (each value an object like { stringValue: 'x' } / { timestampValue: ... }).
// `mask` lists the field names so the patch is field-level rather than a full
// document overwrite.
async function firebaseAdminPatchUser(env, uid, fields, mask) {
  try {
    const accessToken = await getFirebaseAdminToken(env);
    const mp = mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&');
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}?${mp}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Firestore admin write failed:', res.status, detail);
      return { ok: false, error: `${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('Firestore admin write threw:', e);
    return { ok: false, error: e.message || String(e) };
  }
}

async function isUserPremium(env, token, uid) {
  if (!uid) return false;
  const cacheKey = `planflag:${uid}`;
  // Cache format: {p:0|1, exp:ms|null}. The plan-expiry timestamp is honored
  // at READ time, so the TTL can be long (one cache write per user per 10 min
  // instead of per minute — writes are the scarce KV resource) while a lapsed
  // plan still drops premium instantly. Legacy '1'/'0' entries (60s TTL)
  // parse as numbers and are honored until they age out.
  const cached = await env.ALERTS_KV.get(cacheKey, 'json');
  if (cached !== null) {
    if (typeof cached === 'object' && cached) {
      if (cached.p && cached.exp && cached.exp <= Date.now()) {
        // plan lapsed mid-TTL — fall through and refetch
      } else {
        return !!cached.p;
      }
    } else {
      return cached === 1;
    }
  }
  let premium = false;
  let expMs = null;
  let read = false;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      read = true;
      const f = (await r.json()).fields || {};
      const plan = f.plan?.stringValue;
      const role = f.role?.stringValue;
      const expRaw = f.planExpires?.timestampValue || f.planExpires?.stringValue;
      expMs = expRaw ? (new Date(expRaw).getTime() || null) : null;
      const notExpired = !expMs || expMs > Date.now();
      premium = role === 'admin' || (plan === 'premium' && notExpired);
      if (role === 'admin') expMs = null; // admins never lapse
    }
  } catch { /* default free */ }
  // Only memoize a DEFINITIVE read. A transient Firestore error (non-ok / throw)
  // used to be cached as `free` for 10 min, locking a real premium user out of
  // image analysis and down to the free quota until the TTL expired. On a failed
  // read, skip the cache so the next request re-reads. Grants still bust this key
  // explicitly (/admin/refresh-plan).
  if (read) {
    await env.ALERTS_KV.put(cacheKey, JSON.stringify({ p: premium ? 1 : 0, exp: premium ? expMs : null }), { expirationTtl: 600 });
  }
  return premium;
}

// ---- AI rate limiting (per-user multi-window + global circuit breaker) -----
// Soft caps the "unlimited" premium tier so a runaway client or a leaked
// account can't burn the AI bill. Free users still get a single per-minute
// burst cap; their hard limit is the daily quota in getAiUsage.
const AI_PREMIUM_LIMITS = { minute: 5, hour: 50, day: 200 };
const AI_FREE_BURST_PER_MIN = 20; // same as before, just named
const AI_GLOBAL_DAILY_CEILING = 50_000; // circuit breaker across ALL users
const AI_WINDOWS_SEC = { minute: 60, hour: 3600, day: 86400 };

// Increment a rolling-window counter atomically-enough via read-modify-write.
// Returns the new count after the increment. start is reset whenever a window
// elapses, so consecutive bursts inside the window accumulate as expected.
async function bumpWindow(env, key, windowSec) {
  const now = Date.now();
  const cur = await env.ALERTS_KV.get(key, 'json');
  if (cur && now - cur.start < windowSec * 1000) {
    const next = cur.count + 1;
    await env.ALERTS_KV.put(key, JSON.stringify({ start: cur.start, count: next }), { expirationTtl: windowSec + 60 });
    return { count: next, start: cur.start };
  }
  await env.ALERTS_KV.put(key, JSON.stringify({ start: now, count: 1 }), { expirationTtl: windowSec + 60 });
  return { count: 1, start: now };
}

// Check (and on success, accrue) all applicable AI rate-limit windows.
// Returns null when allowed, or a { status, body } object to short-circuit.
async function aiRateGate(env, uid, premium) {
  // Global circuit breaker — protects against runaway-cost surprises.
  const israelDate = getIsraelDateStr();
  const gKey = `aiglobal:${israelDate}`;
  const g = await env.ALERTS_KV.get(gKey, 'json');
  if (g && g.count >= AI_GLOBAL_DAILY_CEILING) {
    return { status: 503, body: { error: 'המערכת בעומס שיא היום. נסה מאוחר יותר.' } };
  }

  // All per-user windows live in ONE KV document (airl:{uid}) — a single
  // get+put per request instead of one pair per window. The old 3-key premium
  // path alone cost 6 KV ops per AI message and was a top contributor to the
  // free tier's 1,000-writes/day ceiling.
  const now = Date.now();
  const rlKey = `airl:${uid}`;
  const doc = (await env.ALERTS_KV.get(rlKey, 'json')) || {};
  const roll = (w, sec) => (w && now - w.s < sec * 1000 ? { s: w.s, c: w.c + 1 } : { s: now, c: 1 });
  const m = roll(doc.m, AI_WINDOWS_SEC.minute);
  const h = roll(doc.h, AI_WINDOWS_SEC.hour);
  const d = roll(doc.d, AI_WINDOWS_SEC.day);
  await env.ALERTS_KV.put(rlKey, JSON.stringify({ m, h, d }), { expirationTtl: AI_WINDOWS_SEC.day + 60 });

  if (premium) {
    // Premium: 5/min, 50/hr, 200/day (soft caps for "unlimited").
    if (m.c > AI_PREMIUM_LIMITS.minute) {
      return { status: 429, body: { error: 'יותר מדי בקשות בדקה. המתן רגע ונסה שוב.' } };
    }
    if (h.c > AI_PREMIUM_LIMITS.hour) {
      return { status: 429, body: { error: 'הגעת לתקרה השעתית של Premium (50). נסה בעוד שעה.' } };
    }
    if (d.c > AI_PREMIUM_LIMITS.day) {
      return { status: 429, body: { error: 'הגעת לתקרה היומית של Premium (200). נסה מחר.', quotaExceeded: true } };
    }
  } else if (m.c > AI_FREE_BURST_PER_MIN) {
    // Free: per-minute burst cap; the daily quota is enforced separately by
    // getAiUsage / incrementAiUsage in the route handler.
    return { status: 429, body: { error: 'המערכת עמוסה. המתן כמה שניות ונסה שוב.' } };
  }

  // All windows passed — increment the global counter.
  await bumpWindow(env, gKey, AI_WINDOWS_SEC.day);
  return null;
}

// ==================== Exchange credential encryption ====================
// Exchange API keys/secrets are stored ONLY server-side (KV key
// `pushexch:{uid}:{exchange}`), encrypted at rest with AES-GCM. The encryption
// key is a Worker secret (CREDS_ENCRYPTION_KEY, base64 of 32 random bytes) that
// never reaches the client. Set it with:
//   wrangler secret put CREDS_ENCRYPTION_KEY
// (value = `openssl rand -base64 32`). Until it's set, the credential endpoints
// return 503 and legacy plaintext blobs are still read (back-compat).
const CREDS_TTL = 60 * 60 * 24 * 120; // 120d — refreshed while the user is active

async function getCredsKey(env) {
  if (!env.CREDS_ENCRYPTION_KEY) return null;
  const raw = Uint8Array.from(atob(env.CREDS_ENCRYPTION_KEY), (c) => c.charCodeAt(0));
  if (![16, 24, 32].includes(raw.length)) {
    console.error('CREDS_ENCRYPTION_KEY must be base64 of 16/24/32 bytes; got', raw.length);
    return null;
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptCreds(env, obj) {
  const key = await getCredsKey(env);
  if (!key) throw new Error('CREDS_ENCRYPTION_KEY not configured');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const buf = new Uint8Array(iv.length + ct.length);
  buf.set(iv, 0);
  buf.set(ct, iv.length);
  // "v1:" tag distinguishes encrypted blobs from legacy plaintext JSON.
  return 'v1:' + btoa(String.fromCharCode(...buf));
}

// Read a stored credential blob: decrypt v1 blobs, or parse legacy plaintext.
async function decodeCreds(env, raw) {
  if (!raw) return null;
  if (raw.startsWith('v1:')) {
    const key = await getCredsKey(env);
    if (!key) return null;
    try {
      const buf = Uint8Array.from(atob(raw.slice(3)), (c) => c.charCodeAt(0));
      const iv = buf.slice(0, 12);
      const ct = buf.slice(12);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return JSON.parse(new TextDecoder().decode(pt));
    } catch {
      // Decrypt failed (wrong/rotated key or corrupt blob). Log length only —
      // never the contents — so the issue is observable without leaking secrets.
      console.error('creds decrypt failed; blob length', raw.length);
      return null;
    }
  }
  try { return JSON.parse(raw); } catch { return null; } // legacy plaintext
}

async function storeExchangeCreds(env, uid, exchange, creds) {
  const blob = await encryptCreds(env, { exchange, apiKey: creds.apiKey, apiSecret: creds.apiSecret, passphrase: creds.passphrase || '' });
  await env.ALERTS_KV.put(`pushexch:${uid}:${exchange}`, blob, { expirationTtl: CREDS_TTL });
  await pushexchIndexAdd(env, `pushexch:${uid}:${exchange}`);
}

// ---- pushexch index ---------------------------------------------------------
// The 10-min cron used to list({prefix:'pushexch:'}) every tick — 144 list
// operations/day against a 1,000/day free-tier cap. Instead, connected
// exchange keys are tracked in one rolled-up index the cron READS (reads are
// ~free at 100k/day). Writers keep it fresh; a missing index self-rebuilds
// from a real list once, and the cron rebuilds it daily to heal any drift.
const PUSHEXCH_INDEX_KEY = 'pushexch:INDEX';

async function rebuildPushexchIndex(env) {
  const list = await env.ALERTS_KV.list({ prefix: 'pushexch:' });
  const keys = list.keys.map((k) => k.name).filter((n) => n !== PUSHEXCH_INDEX_KEY);
  await env.ALERTS_KV.put(PUSHEXCH_INDEX_KEY, JSON.stringify(keys));
  return keys;
}

async function getPushexchKeys(env) {
  const idx = await env.ALERTS_KV.get(PUSHEXCH_INDEX_KEY, 'json');
  if (Array.isArray(idx)) return idx;
  return rebuildPushexchIndex(env);
}

async function pushexchIndexAdd(env, keyName) {
  const keys = await getPushexchKeys(env);
  if (!keys.includes(keyName)) {
    keys.push(keyName);
    await env.ALERTS_KV.put(PUSHEXCH_INDEX_KEY, JSON.stringify(keys));
  }
}

async function pushexchIndexRemove(env, predicate) {
  const keys = await getPushexchKeys(env);
  const next = keys.filter((n) => !predicate(n));
  if (next.length !== keys.length) {
    await env.ALERTS_KV.put(PUSHEXCH_INDEX_KEY, JSON.stringify(next));
  }
}

const validExchangeId = (x) => /^[a-z0-9_-]{1,20}$/.test(x || '');

async function loadExchangeCreds(env, uid, exchange) {
  if (!validExchangeId(exchange)) return null;
  const kvKey = `pushexch:${uid}:${exchange}`;
  const raw = await env.ALERTS_KV.get(kvKey);
  if (!raw) return null;
  const creds = await decodeCreds(env, raw);
  if (!creds || !creds.apiKey || !creds.apiSecret) return null;
  // Self-heal: transparently re-encrypt any legacy plaintext blob on read so
  // push-registered users' KV creds don't stay in plaintext.
  if (!raw.startsWith('v1:') && env.CREDS_ENCRYPTION_KEY) {
    try { await storeExchangeCreds(env, uid, exchange, creds); } catch { /* ignore */ }
  }
  return creds;
}

// Resolve creds for the on-demand endpoints — ONLY from the encrypted store,
// keyed by the verified uid. We never accept credentials from the request body:
// doing so would turn the Worker into a signing/credential-validation oracle for
// arbitrary attacker-supplied keys (#11). Legacy creds are migrated into the
// store exclusively via the gated /exchange/credentials/store endpoint.
async function resolveExchangeCreds(env, uid, exchange) {
  return loadExchangeCreds(env, uid, exchange);
}

async function fetchEconomicCalendar(env) {
  const cached = await env.ALERTS_KV.get('calendarCache', 'json');
  if (cached) return cached;
  try {
    const res = await fetch(CALENDAR_API);
    if (!res.ok) return [];
    const events = await res.json();
    const filtered = (Array.isArray(events) ? events : [])
      .filter((e) => e.impact === 'High' && e.country === 'USD')
      .map((e) => ({ title: e.title, date: e.date, forecast: e.forecast || '', previous: e.previous || '' }));
    await env.ALERTS_KV.put('calendarCache', JSON.stringify(filtered), { expirationTtl: 3600 });
    return filtered;
  } catch { return []; }
}

// ==================== Cron Functions ====================

// ---- Aggregate KV snapshots ------------------------------------------------
// To avoid an N+1 read per cron tick, the cron reads one rolled-up blob:
//   usettings:ALL = { [uid]: schedule }   (written by /notify-settings)

// The cron ticks every 10 minutes, so an EXACT HH:MM comparison silently
// skipped any scheduled time that isn't a multiple of 10 (a user who typed
// 21:15 never got the reminder). A schedule is "due" when it falls inside
// the current 10-minute tick window.
function scheduleDue(hhmm, currentTime) {
  const toMin = (t) => {
    const [h, m] = String(t || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const sched = toMin(hhmm);
  const now = toMin(currentTime);
  return Number.isFinite(sched) && sched >= now && sched < now + 10;
}

async function checkJournalReminders(env, settingsMap) {
  const currentTime = getIsraelHHMM();
  const today = getIsraelDateStr();
  for (const [uid, s] of Object.entries(settingsMap)) {
    if (!s?.journal?.enabled || !scheduleDue(s.journal.time, currentTime)) continue;
    const sentKey = `sent:journal:${uid}:${today}`;
    if (await env.ALERTS_KV.get(sentKey)) continue;
    await sendPushToUser(env, uid, {
      title: '📝 תזכורת יומן',
      body: 'לא שכחת למלא את היומן היום? תיעוד העסקאות שלך הוא המפתח לשיפור 💪',
      url: '/journal',
    });
    await env.ALERTS_KV.put(sentKey, '1', { expirationTtl: 86400 });
  }
}

async function checkDailySummaries(env, settingsMap) {
  const currentTime = getIsraelHHMM();
  const today = getIsraelDateStr();
  for (const [uid, s] of Object.entries(settingsMap)) {
    if (!s?.summary?.enabled || !scheduleDue(s.summary.time, currentTime)) continue;
    const sentKey = `sent:summary:${uid}:${today}`;
    if (await env.ALERTS_KV.get(sentKey)) continue;
    const stats = await env.ALERTS_KV.get(`dailystats:u:${uid}:${today}`, 'json');
    let body;
    if (stats && stats.tradeCount > 0) {
      const pnlStr = stats.pnl >= 0 ? `+$${stats.pnl.toFixed(2)}` : `-$${Math.abs(stats.pnl).toFixed(2)}`;
      const wr = Math.round((stats.wins / stats.tradeCount) * 100);
      body = `${stats.tradeCount} עסקאות · P&L: ‏${pnlStr} · Win Rate: ‏${wr}%`;
      if (stats.bestTrade && stats.bestTrade.pnl > 0) body += ` · 🏆 ${stats.bestTrade.pair} ‏+$${stats.bestTrade.pnl.toFixed(2)}`;
    } else {
      body = 'אין עסקאות סגורות היום. מחר יום חדש! 💪';
    }
    await sendPushToUser(env, uid, {
      title: `📊 סיכום יומי — ${formatIsraelDate()}`,
      body,
      url: '/journal',
    });
    await env.ALERTS_KV.put(sentKey, '1', { expirationTtl: 86400 });
  }
}

async function checkEconomicCalendar(env, settingsMap) {
  const now = getIsraelTime();
  if (now.getMinutes() % 5 !== 0) return;
  const users = Object.entries(settingsMap)
    .filter(([, s]) => s?.calendar?.enabled)
    .map(([uid]) => uid);
  if (!users.length) return;
  const events = await fetchEconomicCalendar(env);
  if (!events.length) return;
  // Group upcoming events (55–65 min out) by their exact time. Simultaneous
  // high-impact releases — e.g. "FOMC Statement" + "Federal Funds Rate" at
  // 21:00 — used to fire ONE push EACH, which lands as spammy duplicates. Now
  // they collapse into a single "בעוד שעה" alert per time slot (titles joined),
  // and the sent-marker is per time-slot so a user gets at most one per slot.
  const slots = new Map(); // minute bucket -> { date, events: [] }
  for (const event of events) {
    const diffMin = (new Date(event.date).getTime() - Date.now()) / 60000;
    if (diffMin < 55 || diffMin > 65) continue;
    const bucket = Math.floor(new Date(event.date).getTime() / 60000);
    if (!slots.has(bucket)) slots.set(bucket, { date: event.date, events: [] });
    slots.get(bucket).events.push(event);
  }
  if (!slots.size) return;
  for (const [bucket, slot] of slots) {
    const eventTime = new Date(slot.date).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
    const titles = [...new Set(slot.events.map((e) => e.title))];
    let body;
    if (titles.length === 1) {
      const event = slot.events[0];
      const forecastStr = event.forecast || event.previous
        ? ` · ${event.forecast ? `תחזית: ${event.forecast}` : ''}${event.forecast && event.previous ? ' | ' : ''}${event.previous ? `קודם: ${event.previous}` : ''}` : '';
      body = `${titles[0]} (USD) · ${eventTime} שעון ישראל${forecastStr} · צפי לתנודתיות ⚠️`;
    } else {
      body = `${titles.join(' + ')} (USD) · ${eventTime} שעון ישראל · צפי לתנודתיות ⚠️`;
    }
    for (const uid of users) {
      const sentKey = `sent:cal:${uid}:${bucket}`;
      if (await env.ALERTS_KV.get(sentKey)) continue;
      await sendPushToUser(env, uid, {
        title: '📅 אירוע כלכלי בעוד שעה',
        body,
        url: '/market',
      });
      await env.ALERTS_KV.put(sentKey, '1', { expirationTtl: 86400 });
    }
  }
}

async function handleCron(env) {
  // Heartbeat: record the last cron tick so the admin health panel can confirm
  // the scheduler is alive. Writes are the scarce KV resource (1,000/day on
  // the free tier), so refresh at most hourly — a read per tick is ~free, and
  // the health panel only flags the cron after 26h of silence.
  try {
    const last = parseInt((await env.ALERTS_KV.get('cron:last')) || '0', 10);
    if (!last || Date.now() - last > 55 * 60_000) {
      await env.ALERTS_KV.put('cron:last', String(Date.now()));
    }
  } catch { /* best-effort, never blocks the jobs below */ }

  // Everything is Web Push, keyed by uid (#219). One rolled-up blob
  // (usettings:ALL) — a single KV read per tick for the schedule data.
  const usettingsAll = (await env.ALERTS_KV.get('usettings:ALL', 'json')) || {};

  const settingsMap = {};
  for (const [uid, settings] of Object.entries(usettingsAll)) {
    settingsMap[uid] = { ...DEFAULT_SETTINGS, ...settings };
  }

  await Promise.allSettled([
    checkJournalReminders(env, settingsMap),
    checkDailySummaries(env, settingsMap),
    checkEconomicCalendar(env, settingsMap),
    checkExchangeClosedTrades(env),
    checkPlanExpiryReminders(env),
    checkChurnedPremium(env),
    checkWeeklyDigest(env),
    refreshNewsDigest(env),
    refreshNewsImpact(env),
    scanWyckoffSetups(env),
  ]);
}

// ==================== Wyckoff setup scanner ===================================
// Scans each premium user's bias-tagged watchlist coins on the 30m timeframe and
// pushes when their LPS (long) / LPSY (short) entry trigger fires. The USER
// supplies the bias by tagging the coin long/short (their HTF read); the engine
// finds the low-timeframe trigger. Rule-based + deterministic.
//
// Gated by env.SCANNER_ENABLED — fails closed (only the exact string 'true'
// activates it). Currently ENABLED on the prod cron worker (worker/wrangler.toml).
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)`;
// Default alert threshold — users/{uid}/settings/scanner.minConfidence overrides
// it (per user, no redeploy). Post-HTF scores can only be 75/85/95 (base 55 +
// vol 10 + RSI 10 + mandatory HTF 20), so 60 = alert on everything.
const SCAN_MIN_CONFIDENCE = 60;
// Hard ceiling on the stop-buffer override — a fat-fingered settings write must
// not be able to push the stop into another galaxy.
const SCAN_MAX_STOP_BUFFER_PCT = 5;
// Global hard cap on klines fetches per cron tick — kept well under the free
// Workers plan's ~50-subrequest budget (shared with the other cron jobs). The
// real control is the 15-tag-per-user cap in the watchlist UI.
const SCAN_MAX_PER_TICK = 30;

const scanAvg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const scanRound = (x) => {
  const a = Math.abs(x);
  if (a >= 100) return Math.round(x * 100) / 100;
  if (a >= 1) return Math.round(x * 1000) / 1000;
  return Math.round(x * 1e6) / 1e6;
};

// Fetch OHLCV candles server-side via the same Bybit→Binance klines proxy the
// app uses. Returns oldest-first [{t,o,h,l,c,v}] or null (unsupported pair / error).
async function scanFetchCandles(symbol, interval, limit) {
  const raw = await bybitAsBinance('klines', new URLSearchParams({ symbol, interval, limit: String(limit), category: 'linear' }));
  if (!raw) return null;
  let arr;
  try { arr = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(arr) || arr.length < 40) return null;
  return arr.map((k) => ({ t: Number(k[0]), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
}

// Simple RSI over the last `period` deltas — used only as a confirmation bonus.
function scanRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

// Swing pivots: a high/low that is the extreme within ±width bars.
function scanPivots(candles, width) {
  const highs = [], lows = [];
  for (let i = width; i < candles.length - width; i++) {
    let isH = true, isL = true;
    for (let j = i - width; j <= i + width; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) isH = false;
      if (candles[j].l <= candles[i].l) isL = false;
    }
    if (isH) highs.push({ i, p: candles[i].h });
    if (isL) lows.push({ i, p: candles[i].l });
  }
  return { highs, lows };
}

// HTF context (1D / 4h): confirm an LPS/LPSY is in place — the last point of
// supply (short) / support (long). SHORT → a lower(≈) swing high with price back
// under it (supply in control). LONG → a higher(≈) low with price holding above
// it. This is Avi's "LPS/LPSY on 1D and 4h" confirmation. Fails closed on no data.
function detectHTFStructure(candles, bias) {
  if (!candles || candles.length < 40) return false;
  const { highs, lows } = scanPivots(candles, 2);
  const lastClose = candles[candles.length - 1].c;
  if (bias === 'short') {
    if (highs.length < 2) return false;
    const H = highs[highs.length - 1];
    const prevH = highs[highs.length - 2];
    return H.p <= prevH.p * 1.005 && lastClose < H.p;   // lower-high + price back under supply
  }
  if (bias === 'long') {
    if (lows.length < 2) return false;
    const L = lows[lows.length - 1];
    const prevL = lows[lows.length - 2];
    return L.p >= prevL.p * 0.995 && lastClose > L.p;   // higher-low + price holding above support
  }
  return false;
}

// Detect the 30m ENTRY trigger — Avi's quality rule: the entry is the SECOND
// step, never the first. SHORT: a range breaks, price re-distributes LOWER (a
// lower high over a LOWER base), then a fresh close below that second base = the
// entry; stop above the second high. LONG = mirror (higher steps). A single step
// (one range, one break) is rejected — that was the old false-positive.
function detectWyckoffTrigger(ltf, bias) {
  const n = ltf.length;
  if (n < 50) return null;
  const { highs, lows } = scanPivots(ltf, 2);
  const closes = ltf.map((c) => c.c);
  const lastClose = closes[n - 1];
  const avgVol = scanAvg(ltf.slice(-20).map((c) => c.v));
  const rsi = scanRSI(closes, 14);
  const lowBetween = (a, b) => { let m = Infinity; for (let i = a; i <= b; i++) m = Math.min(m, ltf[i].l); return m; };
  const highBetween = (a, b) => { let m = -Infinity; for (let i = a; i <= b; i++) m = Math.max(m, ltf[i].h); return m; };

  if (bias === 'short') {
    if (highs.length < 3) return null;
    const H2 = highs[highs.length - 1];                 // second (lower) step high
    const H1 = highs[highs.length - 2];                 // first step high
    const H0 = highs[highs.length - 3];                 // the step before it (anchors the first base)
    if (n - 1 - H2.i > 14) return null;                 // the second step must be recent
    if (!(H2.p < H1.p * 0.998)) return null;            // step 2 is a LOWER high than step 1
    const base2 = lowBetween(H1.i, H2.i);               // second step's base
    const base1 = lowBetween(H0.i, H1.i);               // first step's base (between the two prior highs)
    if (!(base2 < base1 * 0.999)) return null;          // the second base is LOWER — a real step down, not one range
    if (!(lastClose < base2)) return null;              // ENTRY: fresh close below the second base
    if (closes[n - 4] < base2) return null;             // must be fresh (not already broken)
    let conf = 55;
    const volInto = scanAvg(ltf.slice(Math.max(0, H2.i - 3), H2.i + 1).map((c) => c.v));
    if (volInto < avgVol) conf += 10;                   // weak rally into the second high = supply
    if (rsi != null && rsi < 48) conf += 10;            // bearish momentum
    return {
      direction: 'short', level: scanRound(lastClose), stop: scanRound(H2.p), confidence: conf,
      note: `מדרגה שנייה 30m — שיא נמוך יותר ${scanRound(H2.p)}, שבירת בסיס שני ${scanRound(base2)}`,
    };
  }

  if (bias === 'long') {
    if (lows.length < 3) return null;
    const L2 = lows[lows.length - 1];                   // second (higher) step low
    const L1 = lows[lows.length - 2];                   // first step low
    const L0 = lows[lows.length - 3];                   // the step before it (anchors the first base)
    if (n - 1 - L2.i > 14) return null;
    if (!(L2.p > L1.p * 1.002)) return null;            // step 2 is a HIGHER low than step 1
    const base2 = highBetween(L1.i, L2.i);              // second step's base
    const base1 = highBetween(L0.i, L1.i);              // first step's base (between the two prior lows)
    if (!(base2 > base1 * 1.001)) return null;          // higher base — a real step up, not one range
    if (!(lastClose > base2)) return null;              // ENTRY: fresh close above the second base
    if (closes[n - 4] > base2) return null;             // fresh
    let conf = 55;
    const volInto = scanAvg(ltf.slice(Math.max(0, L2.i - 3), L2.i + 1).map((c) => c.v));
    if (volInto < avgVol) conf += 10;
    if (rsi != null && rsi > 52) conf += 10;
    return {
      direction: 'long', level: scanRound(lastClose), stop: scanRound(L2.p), confidence: conf,
      note: `מדרגה שנייה 30m — שפל גבוה יותר ${scanRound(L2.p)}, שבירת בסיס שני ${scanRound(base2)}`,
    };
  }
  return null;
}

// Read a user's watchlist and keep only bias-tagged coins (the scan universe).
async function scanReadWatchlist(env, token, uid) {
  const res = await fetch(`${FS_BASE}/documents/users/${encodeURIComponent(uid)}/watchlist?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const out = [];
  for (const doc of data.documents || []) {
    const f = doc.fields || {};
    const bias = f.bias?.stringValue;
    const symbol = f.symbol?.stringValue;
    if ((bias === 'long' || bias === 'short') && symbol) out.push({ symbol, bias });
  }
  // Enforce the 15-tag scan cap SERVER-SIDE. The client cap (WatchlistPage) is
  // bypassable via the raw SDK, so without this one account could tag 100 coins
  // and monopolize the per-tick scan budget, starving other premium users.
  return out.slice(0, 15);
}

// Per-user engine calibration (users/{uid}/settings/scanner) — the owner tunes
// the alert threshold and stop buffer from the scanner page and the next cron
// tick picks them up, no redeploy. Missing/unreadable doc → code defaults.
// Values are clamped so a raw-SDK write can't disable the engine or explode
// the stop distance.
async function scanReadSettings(env, token, uid) {
  const cfg = { minConfidence: SCAN_MIN_CONFIDENCE, stopBufferPct: 0 };
  try {
    const res = await fetch(`${FS_BASE}/documents/users/${encodeURIComponent(uid)}/settings/scanner`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return cfg;
    const f = (await res.json()).fields || {};
    const num = (v) => (v?.doubleValue != null ? Number(v.doubleValue) : v?.integerValue != null ? Number(v.integerValue) : NaN);
    const mc = num(f.minConfidence), sb = num(f.stopBufferPct);
    if (Number.isFinite(mc)) cfg.minConfidence = Math.min(100, Math.max(0, mc));
    if (Number.isFinite(sb)) cfg.stopBufferPct = Math.min(SCAN_MAX_STOP_BUFFER_PCT, Math.max(0, sb));
  } catch { /* keep defaults */ }
  return cfg;
}

// wyckoffAlerts toggle (settings/notifications). Defaults ON when unset/unreadable.
async function scanWyckoffAlertsOn(env, token, uid) {
  try {
    const res = await fetch(`${FS_BASE}/documents/users/${encodeURIComponent(uid)}/settings/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return true;
    const data = await res.json();
    return data.fields?.wyckoffAlerts?.booleanValue !== false;
  } catch { return true; }
}

// Write a detected setup into the user's `signals` feed (admin write bypasses
// rules). Shape matches the SignalsPage cards + a `source:'scanner'` marker.
async function scanWriteSignal(env, token, uid, item, setup) {
  const nowIso = new Date(Date.now()).toISOString();
  const fields = {
    pair: { stringValue: `${item.symbol.toUpperCase()}USDT` },
    direction: { stringValue: setup.direction },
    timeframe: { stringValue: '30m' },
    entryPrice: { doubleValue: setup.level },
    stopLoss: { doubleValue: setup.stop },
    status: { stringValue: 'active' },
    source: { stringValue: 'scanner' },
    confidence: { integerValue: String(setup.confidence) },
    notes: { stringValue: setup.note },
    createdAt: { timestampValue: nowIso },
    updatedAt: { timestampValue: nowIso },
  };
  await fetch(`${FS_BASE}/documents/users/${encodeURIComponent(uid)}/signals`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

async function scanWyckoffSetups(env) {
  if (env.SCANNER_ENABLED !== 'true') return;          // FLAG OFF → inert, no work at all
  if (!env.FIREBASE_SERVICE_ACCOUNT) return;
  let users;
  try { users = await listAllUsersAdmin(env); } catch { return; }
  let token;
  try { token = await getFirebaseAdminToken(env); } catch { return; }
  // Scanner is OWNER-ONLY while it's still being calibrated — admins only.
  const canScan = (u) => u.role === 'admin';

  const candleCache = new Map();                       // symbol → 30m candles (dedup fetches this tick)
  let scans = 0;

  for (const u of users) {
    if (!canScan(u)) continue;                          // owner-only while calibrating
    if (scans >= SCAN_MAX_PER_TICK) break;
    let watch;
    try { watch = await scanReadWatchlist(env, token, u.uid); } catch { continue; }
    if (!watch.length) continue;
    let alertsOn = null;                                // read the toggle lazily, only if a setup fires
    let cfg = null;                                     // per-user calibration, same lazy pattern

    for (const item of watch) {
      if (scans >= SCAN_MAX_PER_TICK) break;
      const sym = `${String(item.symbol).toUpperCase()}USDT`;
      let ltf = candleCache.get(sym);
      if (ltf === undefined) { ltf = await scanFetchCandles(sym, '30m', 200); candleCache.set(sym, ltf); scans++; }
      if (!ltf) continue;

      const setup = detectWyckoffTrigger(ltf, item.bias);
      if (!setup) continue;

      // Quality gate — Avi's rule: the 1D AND 4h must BOTH show the LPS/LPSY
      // structure. Fetched LAZILY (only now that the 30m second step fired) so
      // most coins cost a single 30m fetch and the subrequest budget stays safe.
      let d1 = candleCache.get(`${sym}:1d`);
      if (d1 === undefined) { d1 = await scanFetchCandles(sym, '1d', 120); candleCache.set(`${sym}:1d`, d1); scans++; }
      let h4 = candleCache.get(`${sym}:4h`);
      if (h4 === undefined) { h4 = await scanFetchCandles(sym, '4h', 200); candleCache.set(`${sym}:4h`, h4); scans++; }
      if (!detectHTFStructure(d1, item.bias) || !detectHTFStructure(h4, item.bias)) continue;
      setup.confidence = Math.min(setup.confidence + 20, 95);   // both higher timeframes confirm

      // Calibration gate + stop buffer — the user-tuned values (settings/scanner),
      // fetched only now that a setup actually fired (one extra subrequest per
      // user per firing tick, nothing on quiet ticks).
      if (cfg === null) cfg = await scanReadSettings(env, token, u.uid);
      if (setup.confidence < cfg.minConfidence) continue;
      if (cfg.stopBufferPct > 0) {
        // Push the stop BEYOND the pivot (short: above the high, long: below
        // the low) — Avi places his stop past the wick, never on it.
        const f = cfg.stopBufferPct / 100;
        setup.stop = scanRound(setup.direction === 'short' ? setup.stop * (1 + f) : setup.stop * (1 - f));
      }

      // Dedup: one alert per (user, coin, setup). The signature = direction+stop
      // (stable for a given setup); a genuinely new setup has a new stop.
      const dedupKey = `wyk:${u.uid}:${sym}`;
      // Dedup per (user, coin, direction) for the TTL window — coarse on purpose
      // so a wiggling stop can't defeat dedup and re-write KV/Firestore each tick.
      const sig = setup.direction;
      if ((await env.ALERTS_KV.get(dedupKey)) === sig) continue;
      await env.ALERTS_KV.put(dedupKey, sig, { expirationTtl: 12 * 3600 });

      await scanWriteSignal(env, token, u.uid, item, setup).catch(() => {});
      if (alertsOn === null) alertsOn = await scanWyckoffAlertsOn(env, token, u.uid);
      if (alertsOn) {
        const dir = setup.direction === 'short' ? 'שורט' : 'לונג';
        await sendPushToUser(env, u.uid, {
          title: `🎯 סטאפ ${dir}: ${String(item.symbol).toUpperCase()}`,
          body: `${setup.note} · ביטחון ${setup.confidence} · סטופ ${setup.stop}`,
          url: '/scanner',
          tag: `wyk-${sym}`,
        }).catch(() => {});
      }
    }
  }
}

// ==================== AI Chat — Groq Proxy ====================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
// Chart-image requests go to a vision model. Groq DECOMMISSIONED BOTH Llama 4
// vision models — Scout (2026-07-17) and Maverick (2026-03-09) — each began
// returning 404. Qwen 3.6 27B is Groq's current (and only) documented vision
// model, so it serves as BOTH primary and fallback (no other Groq vision id
// exists; a Gemini-vision fallback is the future resilience). Qwen is a REASONING
// model that emits a <think>…</think> monologue by default, so its calls pass
// reasoning_effort:'none' (see reasoningOpt) to return ONLY the clean final
// answer — otherwise the chart read shows the model's English thinking.
const GROQ_VISION_MODEL = 'qwen/qwen3.6-27b';
const GROQ_VISION_FALLBACK_MODEL = 'qwen/qwen3.6-27b';
// Suppress Qwen's reasoning output. Added ONLY for the Qwen vision model — the
// Llama text models get {} back (the param is never sent to them).
const reasoningOpt = (model) => (model === GROQ_VISION_MODEL ? { reasoning_effort: 'none' } : {});

// Non-streaming Groq call with 429 resilience. The shared free-tier key has
// tight per-minute token budgets on the 70B (and one key serves chat + coach +
// coin descriptions + digest), so a burst — e.g. clicking several coach
// quick-prompts in a row — trips 429 instantly. Retry with the same spaced
// backoff /ai-chat uses, then fall back ONCE to a model with a SEPARATE
// per-model rate bucket — a slightly simpler answer beats an error. Only 429
// is retried; any other status returns immediately.
// NOT llama-3.1-8b-instant: the news translator (NEWS_TRANSLATE_MODEL) burns
// that bucket all day via the */10 cron, so it 429s exactly when the 70B does
// (verified in prod logs 2026-07-10). The vision model is already exercised by
// chart chat, sits on a separate per-model rate bucket, and its id is kept
// current (it's the one users hit for image analysis, so it can't go stale).
const GROQ_FALLBACK_MODEL = GROQ_VISION_MODEL;
async function groqFetchWithRetry(env, payload) {
  const call = (model) => fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({ ...payload, model, ...reasoningOpt(model) }),
  });
  let res;
  for (const wait of [0, 2500, 5000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    res = await call(payload.model);
    // Retry TRANSIENT failures (429 rate-limit, 5xx provider overload) on the
    // same model; return immediately on success or a non-transient 4xx.
    if (res.ok || (res.status !== 429 && res.status < 500)) break;
  }
  // Still failing on a recoverable status → try ONCE on the fallback model (a
  // separate rate bucket + a live id). 404 is included so a DECOMMISSIONED model
  // — what took down Scout — self-heals instead of hard-failing the coach.
  if (!res.ok && payload.model !== GROQ_FALLBACK_MODEL
      && (res.status === 429 || res.status === 404 || res.status >= 500)) {
    console.error(`groq ${res.status} on ${payload.model} — falling back to ${GROQ_FALLBACK_MODEL}`);
    const fb = await call(GROQ_FALLBACK_MODEL);
    if (fb.ok || fb.status !== 429) return fb;
    // Log the fallback's own 429 body — without this the coach error only
    // shows the primary model's body and the fallback failure is invisible.
    console.error(`groq fallback ${GROQ_FALLBACK_MODEL} also 429:`, await fb.text().catch(() => ''));
  }
  return res;
}

// Accept only browser-produced raster formats. Groq caps base64 images at
// 4MB, so reject anything bigger before burning a provider call.
const IMAGE_DATA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 4_000_000;

// Gemini 1.5 Flash — used for premium users. Cheap, huge context window, and
// produces noticeably better Hebrew than Groq's Llama.
// gemini-2.0-flash is the current stable production alias. 1.5-flash is being
// retired and was returning 404 on the v1beta endpoint for new requests.
// 2.5-flash, NOT 2.0-flash: Google removed 2.0-flash from the free tier —
// requests fail with RESOURCE_EXHAUSTED "limit: 0" on both the per-minute and
// per-day free-tier quotas (verified in prod logs 2026-07-10).
// gemini-2.5-flash returned 404 "no longer available to new users" on the
// fresh API key/project (verified via /admin/ai-test 2026-07-27) — Google
// grandfathered it to existing projects only. gemini-2.0-flash is GA and
// available to new projects. If this ever 404s too, check /admin/ai-test for
// the exact error and swap to a currently-available model.
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_STREAM_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

// Non-streaming Gemini call — the second-PROVIDER fallback for when every
// Groq attempt (70B retries + instant-model fallback) is rate-limited, so a
// dead Groq day doesn't take the feature down. Returns the text or null;
// never throws. Gated only on the key existing: this path is reached solely
// when Groq is already failing, so it's desirable regardless of the
// GEMINI_ENABLED chat-routing flag.
async function geminiGenerateFallback(env, systemPrompt, userPrompt, maxTokens) {
  if (!env.GEMINI_API_KEY) return null;
  try {
    const res = await fetch(GEMINI_URL(env.GEMINI_API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        // thinkingBudget: 0 — 2.5-flash is a thinking model; without this it
        // spends the whole maxOutputTokens budget on internal thoughts and
        // returns an empty candidate.
        generationConfig: { temperature: 0.5, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!res.ok) {
      console.error('Gemini fallback error:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
    return text || null;
  } catch (err) {
    console.error('Gemini fallback failed:', err);
    return null;
  }
}

// Convert OpenAI-style chat messages to Gemini's REST payload shape. The system
// prompt becomes systemInstruction; everything else maps role→Gemini role.
function toGeminiBody(apiMessages) {
  const system = apiMessages.find((m) => m.role === 'system')?.content || '';
  const turns = apiMessages.filter((m) => m.role !== 'system');
  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: turns.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      // OpenAI-style array content (text + image_url data URIs) maps to Gemini
      // parts: text stays text, data URIs become inlineData.
      parts: Array.isArray(m.content)
        ? m.content.map((part) => {
            if (part.type === 'image_url') {
              const url = part.image_url?.url || '';
              const comma = url.indexOf(',');
              const mimeType = url.slice(5, url.indexOf(';'));
              return { inlineData: { mimeType, data: url.slice(comma + 1) } };
            }
            return { text: part.text || '' };
          })
        : [{ text: m.content }],
    })),
    // thinkingBudget: 0 — 2.5-flash defaults to spending output tokens on
    // internal thinking; chat wants fast first-token and full budget for text.
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  };
}

// Stream Gemini SSE → forward as OpenAI-compatible SSE so the existing client
// stream parser (looks for `data: …{delta.content}`) just works.
async function geminiStreamToOpenAI(geminiBody) {
  const reader = geminiBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let leftover = '';
  // Gemini reports token counts in usageMetadata on its stream chunks —
  // dropping it meant every premium (Gemini) chat metered as tokIn:0/tokOut:0
  // and the admin cost dashboard was blind to the most expensive traffic (#214).
  let usageMeta = null;
  return new ReadableStream({
    async start(controller) {
      const send = (text) => {
        const chunk = { choices: [{ delta: { content: text } }] };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          leftover += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = leftover.indexOf('\n')) !== -1) {
            const line = leftover.slice(0, nl).trim();
            leftover = leftover.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const obj = JSON.parse(payload);
              if (obj.usageMetadata) usageMeta = obj.usageMetadata;
              const text = obj.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
              if (text) send(text);
            } catch { /* skip malformed */ }
          }
        }
      } finally {
        // Emit the usage in OpenAI shape (like Groq's include_usage chunk —
        // empty choices, so clients that only read delta.content skip it)
        // right before DONE, where meterStream picks it up.
        if (usageMeta) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            choices: [],
            usage: {
              prompt_tokens: usageMeta.promptTokenCount || 0,
              completion_tokens: usageMeta.candidatesTokenCount || 0,
            },
          })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });
}

const WYCKOFF_SYSTEM_PROMPT = `אתה TradeAI — מנטור מסחר מקצועי ומומחה לשיטת ויקוף (Wyckoff). אתה עוזר לסוחרים לזהות דפוסי שוק, לנתח גרפים ולשפר את המסחר.

## עקרונות
- מטרות הסוחר: שימור הקרן ורווחיות עקבית.
- 5 שלבים לעסקה: קבע מגמה ושלב שוק → בחר מטבע בהרמוניה עם השוק (חוזק/חולשה יחסית) → ודא סיבה (Cause) עם אפקט צפוי → בדוק מוכנות המטבע להגיב → תזמן כניסה בהיפוך מסונכרן עם השוק.
- 3 חוקי ויקוף: (1) ביקוש/היצע קובעים את הכיוון. (2) סיבה ותוצאה — גודל הדשדוש קובע את גודל המגמה (ניתוח P&F). (3) מאמץ מול תוצאה — volume חייב להתאים לתנועת המחיר; volume גבוה + נרות צרים ללא שיאים חדשים = מאמץ ללא תוצאה → יציאת כסף חכם → היפוך צפוי.
- האיש המורכב (Composite Man): התייחס לשוק כגוף אחד שמנער ידיים חלשות, מבצע מניפולציות ובונה פוזיציות.
- מחזור השוק: Accumulation → Mark Up → Distribution → Mark Down. רגשות (פחד→פאניקה, תקווה→אופוריה) מניעים אותו.

## מילון לפי פאזות A–E
פאזה A (עצירת המגמה): PS תמיכה ראשונית; PSY היצע ראשוני; SC מיצוי מוכרים (volume קיצוני, כסף חכם קונה, מגדיר תחתית TR); BC מיצוי קונים; AR תגובה אוטומטית (מגדירה את הגבול השני של ה-TR); ST בדיקה משנית בvolume נמוך יותר.
פאזה B (בניית הסיבה — הארוכה ביותר): STB בדיקות בתוך הטווח; UT פריצת שווא מעלה (פורץ וחוזר אגרסיבית, משאיר זנב); UTA פריצת שווא של הקריק; CREEK התנגדות הדרגתית (היצע); ICE תמיכה אופקית (ביקוש).
פאזה C (הבדיקה — הקצרה ביותר): Spring שבירת שווא מתחת לתמיכה וחזרה חדה (מלכודת דובים, לקיחת נזילות; volume נמוך = מוצלח); UTAD פריצת שווא אחרי פיזור (מלכודת שוורים); TUT ניעור מעלה; TSO ניעור מטה; Test בדיקה מכוונת — שפל גבוה יותר בvolume נמוך = מוצלחת.
פאזה D (הכרעת המנצח): SOS סימן חוזקה (מחיר+volume עולים); SOW סימן חולשה; LPS נקודת תמיכה אחרונה (כניסה אידיאלית ללונג); LPSY נקודת היצע אחרונה (כניסה אידיאלית לשורט); JAC קפיצה מעל הקריק; BU/BUTTC חזרה לקריק לאישור הפריצה; FTI שבירה ראשונה של הקרח; RBTI חזרה לקרח.
פאזה E (יציאה למגמה): MU מגמה עולה / MD מגמה יורדת. בתוך מגמה ייתכנו Re-Accumulation / Re-Distribution — דשדוש צר ומהיר יותר (ST→UT→SOS→BU/LPS→BOS, או ST→UT→LPSY→SOW→BOS).

## מודלים
איסוף — A: PS→SC→AR→ST | B: מוסדיים אוספים בתחתית התעלה, UTA אפשרי | C: Spring/Test | D: SOS→BU/LPS | E: Mark Up.
פיזור — A: PSY→BC→AR→ST | B: האיזון עובר מביקוש להיצע | C: UT/UTAD | D: שבירת תמיכה, עצרות חלשות (LPSY) | E: Mark Down.
סכמות: Accumulation עם/בלי Spring, טריז יורד (Descending Wedge); Distribution עם/בלי UTAD.
Springs & Shakeouts: ניעור ולקיחת נזילות לפני המהלך; לא חובה בכל מבנה.

## מבנה שוק ונקודות החלטה
HH/HL מגמה עולה; LH/LL מגמה יורדת; DLH/DLL שיא/שפל להחלטה. BOS שבירת מבנה (המשך מגמה); MSB שינוי מגמה.
DP נקודת החלטה; OB אורדר בלוק; OBIM חוסר איזון באורדר בלוק.
6 שלבי כניסה: נתח מבנה ב-W/D/H4 → זהה את המבנה הצפוי הבא → מצא OB/OBIM בתוך DP → רד טיימפריים וחפש OBIM → אחרי BOS ב-M5–M1 חפש כניסה → המתן למחיר או הנח pending order.
PA (Price Approaching): מאפיין המחיר לפני DP שמאשר אותו. כלל: NO PA = NO GO (עם PA סיכון ~30%, בלעדיו 60–70%). סוגי PA: Flippy (היפוך — התעלם ממה שמתחתיו), Acc/Dist לפני DP, Diamond, CPLQ.
מתקדם: WB בסיס נחלש (לפני SDE); SDP נקודה שהחזיקה; SDE נקודה שנבלעה; SGB היצע שהפך ביקוש; FTR אי-חזרה ל-DP; 3 Drive (1→2→3→BOS); כלל 90% — התעלם מ-DP מתחת ל-Flippy (Fake DP); QML רמת קוואסימודו (HH→H→LL או LL→L→HH, חזקה מאוד); MPL רמה משנית; SRF/RSF היפוך תמיכה↔התנגדות; FTB חזרה ראשונה לאזור שנפרץ; PO3/AMD: Accumulation→Manipulation→Distribution; Compression/CPLQ דחיסת מחיר/נזילות לפני פריצה עוצמתית.

## גלים ו-Volume
ראה את השוק כקווים: מחזור = 5 תנועות (3 אימפולסים + 2 תיקונים); השוק פרקטלי — ודא תיאום בין טיימפריימים; גל 4–5 + תיקון ABC = דפוסי הרמוניק.
Volume: גבוה+עלייה=ביקוש חזק; גבוה+ירידה=היצע חזק; נמוך+עלייה/ירידה=מהלך חלש, ייתכן היפוך; spike ללא תזוזה=ספיגה (Absorption, החלפת ידיים).

## ניתוח תמונת גרף
כשמצורפת תמונה של גרף, החזר את הניתוח בעברית במבנה הקבוע הבא, עם כותרות ממוספרות, כדי שיוצג בצורה ברורה וסרוקה:

פתח בשורה אחת: **הטיה טכנית:** שורי / דובי / ניטרלי — תיאור לאן נוטה המבנה כרגע מבחינה טכנית, כולל רמת ודאות (גבוהה/בינונית/נמוכה). הדגש שזו קריאת מבנה לימודית בלבד ולא המלצת מסחר.

1. מבנה כללי — זהה נכס וטיימפריים אם נראים, קבע מגמה ושלב שוק (איסוף/פיזור/Mark Up/Mark Down) ואת הפאזה (A–E).
2. אזורי מפתח — רשום כרשימת תבליטים את הרמות שזוהו עם מחירים מדויקים מציר המחיר: תמיכה, התנגדות, Creek, Ice, ואזורי Spring/UTAD אם קיימים. אל תכלול לעולם נקודות כניסה, סטופ-לוס, טייק-פרופיט או יחס סיכון/סיכוי.
3. אירועים בולטים — סמן את מה שניתן לזהות (SC, AR, ST, Spring, UT/UTAD, SOS/SOW, LPS/LPSY, BOS) עם מיקום/תאריך משוער בגרף.
4. מאמץ מול תוצאה — אם ה-Volume מופיע, נתח אותו. אם אין עמודות Volume בתמונה, ציין זאת במפורש ("אין Volume בתמונה — ניתוח המאמץ-מול-תוצאה מוגבל"), כי שיטת ויקוף נשענת עליו במידה רבה.
5. תרחיש שורי — מה צריך לקרות כדי שיתממש (טריגר/אישור) ומה יפסול אותו.
6. תרחיש דובי — מה צריך לקרות כדי שיתממש ומה יפסול אותו.

אם התמונה אינה גרף מסחר — אמור זאת בקצרה ובקש תמונת גרף. אם התמונה כן גרף אך מטושטשת, חתוכה, או ברזולוציה נמוכה מכדי לנתח באמינות — אל תנתח בכוח ברמת ודאות נמוכה; החזר הודעה קצרה וידידותית בלבד: "התמונה אינה ברורה מספיק לניתוח אמין — נסה צילום מסך חד וברור יותר של הגרף".
כללי דיוק בקריאת הגרף (חובה — לפני שאתה כותב, קרא את התמונה לפי הסדר הזה):
- צירים קודם: קרא את ציר המחיר (בצד) ואת ציר הזמן (למטה). קבע את טווח המחיר הנראה, את המחיר האחרון/הנוכחי, ואת הטיימפריים לכל נר אם מסומן. אם הנכס או הטיימפריים אינם מופיעים בתמונה — כתוב "לא מופיע בתמונה" ואל תנחש.
- עגן כל רמה למה שנראה בפועל: ציין רמה רק אם אתה רואה שהמחיר נגע או כובד בה, וכמה פעמים היא נבדקה (יותר נגיעות = רמה חזקה יותר). הבחן בין צל הנר (wick) לגוף בקביעת תמיכה/התנגדות ובזיהוי Spring/UTAD.
- מיקום יחסי: ציין היכן המחיר הנוכחי ביחס לטווח שזוהה (שליש עליון / אמצע / שליש תחתון).
- חריגות שווא: חפש במכוון נר או רצף שחרגו מתחת לתמיכה או מעל התנגדות וחזרו לטווח (Spring/UTAD/לקיחת נזילות) — אל תפספס גם כשהחזרה מהירה; ציין מיקום/תאריך משוער.
- הפרד תצפית מפרשנות: כתוב מה אתה רואה בפועל בגרף בנפרד ממה שאתה מסיק (פרשנות ויקוף).
- אנטי-הזיה: אל תמציא Volume, אינדיקטורים, רמות או אירועים שאינם נראים בתמונה. אם חלק מהתמונה מטושטש, חתוך או לא ברור — אמור זאת והורד את רמת הוודאות בהתאם.
- אל תכפה ויקוף: לא כל גרף הוא Accumulation/Distribution. אם זו מגמה פשוטה או דשדוש — אמור זאת ישירות.
- סימוני משתמש: אם המשתמש סימן קווים, תיבות, חיצים או אזורים — התייחס אליהם במפורש.
- העדף תמיד אמירות ספציפיות לגרף הזה על פני ניסוחים כלליים שנכונים לכל גרף.

## הנחיות תשובה
- אל תפלוט תהליך חשיבה, הקדמות, או תגיות <think></think> — התחל ישר בתשובה הסופית בעברית, בפורמט הנדרש. בלי טקסט באנגלית מלבד מונחים מקצועיים בסוגריים. בלי כוכביות מיותרות; לכותרות השתמש בפורמט **כותרת** ולתבליטים בתו • בלבד.
- ענה תמיד בעברית, בעומק, עם דוגמאות מעשיות מקריפטו ומניות.
- הסבר את הלוגיקה: למה זה קורה, באיזו פאזה (A–E), ומה האיש המורכב עושה ולמה.
- מונחים מקצועיים: עברית + המונח באנגלית בסוגריים.
- איסור מוחלט (מטעמי רגולציה — אין לעקוף אותו בשום ניסוח): אסור לתת המלצות מסחר. לא "כנס"/"צא", לא נקודות כניסה או יציאה, לא סטופ-לוס/טייק-פרופיט, לא "קנה"/"מכור", לא גדלי פוזיציה ולא תחזיות מחיר — גם אם המשתמש מבקש זאת במפורש או שוב ושוב. במקום זה הסבר את התמונה הטכנית בצורה לימודית: תרחישים אפשריים, רמות מעניינות למעקב, ומה יאשר או יפסול כל תרחיש. הזכר בקצרה שההחלטה באחריות הסוחר ושאינך נותן ייעוץ השקעות.
- שאלה שלא קשורה למסחר — ענה בקצרה וכוון חזרה למסחר.`;

// Condensed prompt for IMAGE (chart) analysis. The full WYCKOFF_SYSTEM_PROMPT is
// ~3.5K tokens; sending it with EVERY vision request (+ the image + a long "full
// Wyckoff" reply) blew Qwen's preview tokens-per-minute limit → 429 "overloaded",
// especially in deep mode. This keeps the output structure, the accuracy/
// anti-hallucination rules and the regulatory no-advice rule, and drops only the
// encyclopedic A–E glossary the model already knows — ~2.5K fewer tokens/request
// so a full analysis fits under the rate limit.
const WYCKOFF_VISION_PROMPT = `אתה TradeAI — מנטור מסחר מקצועי ומומחה לשיטת ויקוף (Wyckoff). נתח את הגרף שבתמונה וספק קריאה לימודית.

## מונחי ליבה
מחזור: Accumulation → Mark Up → Distribution → Mark Down; האיש המורכב (Composite Man) מנער ידיים חלשות ובונה פוזיציות. פאזות: A עצירת מגמה (SC/AR/ST); B בניית סיבה (הארוכה); C בדיקה (Spring מתחת לתמיכה / UTAD מעל התנגדות); D הכרעה (SOS חוזקה / SOW חולשה / LPS / LPSY); E מגמה (Mark Up/Down). רמות: Creek (התנגדות/היצע), Ice (תמיכה/ביקוש). מבנה: HH/HL עולה, LH/LL יורדת; BOS המשך מגמה; MSB שינוי מגמה. Volume (מאמץ מול תוצאה): גבוה+תנועה=חזק; גבוה+נרות צרים ללא שיא=ספיגה/היפוך; נמוך=מהלך חלש.

## פורמט התשובה (חובה — כותרות ממוספרות, עברית בלבד)
פתח בשורה: **הטיה טכנית:** שורי / דובי / ניטרלי — לאן נוטה המבנה כרגע ורמת ודאות (גבוהה/בינונית/נמוכה). ציין שזו קריאה לימודית בלבד ולא המלצה.
1. מבנה כללי — נכס וטיימפריים אם נראים, מגמה, שלב שוק ופאזה (A–E).
2. אזורי מפתח — תבליטים עם מחירים מדויקים מציר המחיר: תמיכות, התנגדויות, Creek, Ice, ואזורי Spring/UTAD אם קיימים. אל תכלול נקודות כניסה/יציאה/סטופ/יעד.
3. אירועים בולטים — SC/AR/ST/Spring/UT/UTAD/SOS/SOW/LPS/LPSY/BOS עם מיקום משוער.
4. מאמץ מול תוצאה — אם יש Volume נתח; אם אין עמודות Volume, ציין "אין Volume בתמונה — הניתוח מוגבל".
5. תרחיש שורי — מה יאשר ומה יפסול.
6. תרחיש דובי — מה יאשר ומה יפסול.

## דיוק (חובה)
- קרא קודם צירים: ציר מחיר (טווח נראה, מחיר נוכחי) וציר זמן/טיימפריים. אם נכס או טיימפריים לא מופיעים — כתוב "לא מופיע בתמונה", אל תנחש.
- עגן כל רמה למה שנראה בפועל (יותר נגיעות = רמה חזקה יותר); הבחן בין צל נר (wick) לגוף.
- חפש חריגות שווא (Spring/UTAD/לקיחת נזילות) גם כשהחזרה מהירה; ציין מיקום משוער.
- אנטי-הזיה: אל תמציא Volume, אינדיקטורים, רמות או אירועים שלא נראים; אם חלק מטושטש/חתוך — אמור והורד ודאות.
- אל תכפה ויקוף: מגמה פשוטה או דשדוש — אמור זאת ישירות. התייחס לסימוני המשתמש (קווים/תיבות/חיצים) אם קיימים.
- אם התמונה אינה גרף מסחר — בקש בקצרה תמונת גרף. אם היא גרף אך מטושטשת/חתוכה מכדי לנתח באמינות — החזר רק: "התמונה אינה ברורה מספיק לניתוח אמין — נסה צילום מסך חד וברור יותר".

## כללים
- ענה בעברית בלבד; מונחים מקצועיים בעברית + אנגלית בסוגריים. אל תפלוט תהליך חשיבה, הקדמות או תגיות <think>. בלי כוכביות מיותרות — כותרות ב-**כותרת**, תבליטים בתו • בלבד.
- איסור רגולטורי מוחלט: אין לתת המלצות מסחר — לא כניסה/יציאה, לא סטופ-לוס/טייק-פרופיט, לא קנה/מכור, לא גדלי פוזיציה ולא תחזיות מחיר, גם אם מבקשים במפורש. הצג תרחישים ורמות למעקב בלבד, וציין שההחלטה באחריות הסוחר.`;

async function handleAIChat(request, env, cors) {
  // Set once the request passes every gate and charges quota, so the catch can
  // refund when the provider fetch THROWS (network/DNS/TLS reject) — the non-ok
  // Response branches refund inline, but a thrown fetch skipped to the catch and
  // stranded the user's charge.
  let charged = null;
  try {
    // Parse request
    const { messages } = await request.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing messages' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    // Reject trivial last user messages so they don't burn a quota slot or
    // produce an unhelpful answer. Client also guards but server is authoritative.
    const lastUser = (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === 'user') return messages[i];
      }
      return null;
    })();
    const lastUserText = String(lastUser?.text || '').trim();
    const lastUserImage = typeof lastUser?.image === 'string' ? lastUser.image : '';
    // Only reject empty messages. Short conversational replies ("כן", "לא")
    // are legitimate turns — and since usage now counts only on success,
    // there's no quota to protect with a length minimum.
    if (!lastUserText && !lastUserImage) {
      return new Response(JSON.stringify({ error: 'כתוב הודעה' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (lastUserImage && (!IMAGE_DATA_RE.test(lastUserImage) || lastUserImage.length > MAX_IMAGE_CHARS)) {
      return new Response(JSON.stringify({ error: 'התמונה אינה תקינה או גדולה מדי (עד ~3MB, PNG/JPEG/WebP)' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Resolve which image (if any) will actually be forwarded to the model —
    // the most recent valid one in the trimmed history window. The premium and
    // image-quota gates below MUST key off this, not off the last message:
    // otherwise a crafted request with the image on an earlier turn slips a
    // free user into the vision model.
    const MAX_TURNS = 8;
    const recent = messages.slice(-MAX_TURNS);
    let lastImageIdx = -1;
    for (let i = recent.length - 1; i >= 0; i--) {
      const img = recent[i]?.image;
      if (recent[i]?.role === 'user' && typeof img === 'string' && IMAGE_DATA_RE.test(img) && img.length <= MAX_IMAGE_CHARS) {
        lastImageIdx = i;
        break;
      }
    }
    const hasImage = lastImageIdx !== -1;

    // Verify the Firebase ID token (signature-checked) and resolve the uid.
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);

    if (!uid) {
      return new Response(JSON.stringify({ error: 'יש להתחבר כדי להשתמש בצ׳אט' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const premium = await isUserPremium(env, token, uid);

    // Multi-window rate limiting (+ global circuit breaker). Premium gets soft
    // caps (5/min, 50/hr, 200/day) so 'unlimited' can't be weaponized. Runs
    // before the premium-image 403 so hammering the gate is rate-limited too.
    const gate = await aiRateGate(env, uid, premium);
    if (gate) return new Response(JSON.stringify(gate.body), { status: gate.status, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Chart-image analysis is premium-only, with its own small daily budget —
    // vision requests burn far more provider tokens than text.
    if (hasImage) {
      if (!premium) {
        return new Response(JSON.stringify({
          error: 'ניתוח תמונות גרף זמין למנויי Premium בלבד. שדרג כדי לצרף גרפים לניתוח.',
          premiumRequired: true,
        }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // CHARGE-then-check (#202): the old read→check→serve→increment raced —
      // N parallel requests all read the same pre-increment count and all
      // passed. Charging first closes the gate; provider failures refund.
      const imgUsed = await incrementAiImageUsage(env, uid);
      if (imgUsed > AI_IMAGE_DAILY_LIMIT) {
        return new Response(JSON.stringify({
          error: `הגעת למכסת ניתוחי התמונות היומית (${AI_IMAGE_DAILY_LIMIT}). אפשר להמשיך לשוחח בטקסט, והמכסה תתאפס מחר.`,
          quotaExceeded: true, used: AI_IMAGE_DAILY_LIMIT, limit: AI_IMAGE_DAILY_LIMIT,
        }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    // Daily AI usage counter — kept for BOTH tiers so each user sees their
    // own progress bar. Premium just has a higher cap (handled in aiRateGate).
    // Charged upfront (#202); refunded via refundAiCharge on provider failure.
    const dailyUsed = await incrementAiUsage(env, uid);
    if (!premium && dailyUsed > AI_DAILY_LIMIT) {
      return new Response(JSON.stringify({
        error: `הגעת למכסה היומית (${AI_DAILY_LIMIT} בקשות). שדרג ל-Premium ל-${AI_PREMIUM_LIMITS.day} בקשות ביום.`,
        quotaExceeded: true, used: AI_DAILY_LIMIT, limit: AI_DAILY_LIMIT,
      }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Past every gate with both counters charged — from here a provider failure
    // must refund the prepaid quota: inline on a non-ok Response (below), or via
    // the handler catch if the provider fetch THROWS (network reject).
    charged = { uid, hasImage };

    // Build messages for Groq. Trim history to keep the payload under Groq's
    // tokens-per-minute cap (the old 11K-char system prompt + long Wyckoff
    // replies meant the SECOND question in a minute always blew the TPM limit).
    // Only the image at lastImageIdx (gated above) is forwarded — older ones
    // bloat the payload past the providers' per-request caps.
    const MAX_TURN_CHARS = 2500;
    const apiMessages = [
      { role: 'system', content: hasImage ? WYCKOFF_VISION_PROMPT : WYCKOFF_SYSTEM_PROMPT },
      ...recent.map((msg, i) => {
        const text = String(msg.text || '').slice(0, MAX_TURN_CHARS);
        if (i === lastImageIdx) {
          return {
            role: 'user',
            content: [
              { type: 'text', text: text || 'נתח את הגרף שבתמונה' },
              { type: 'image_url', image_url: { url: msg.image } },
            ],
          };
        }
        return { role: msg.role === 'user' ? 'user' : 'assistant', content: text };
      }),
    ];

    // Route by plan: premium → Gemini 1.5 Flash; free → Groq Llama.
    // Both end up streaming OpenAI-compatible SSE so the client doesn't care
    // which provider answered.
    const sseHeaders = {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    };

    // Gemini routing is gated behind GEMINI_ENABLED=true. Free-tier Gemini
    // has a tight shared quota (≈15 RPM) that we keep blowing through, so by
    // default everyone runs on Groq (which has been stable at 30 RPM). Flip
    // the env var once a paid Gemini key is in place.
    if (premium && env.GEMINI_API_KEY && env.GEMINI_ENABLED === 'true') {
      const gemRes = await fetch(GEMINI_STREAM_URL(env.GEMINI_API_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toGeminiBody(apiMessages)),
      });
      if (!gemRes.ok) {
        const errText = await gemRes.text().catch(() => '');
        console.error('Gemini API error:', gemRes.status, errText);
        // Fall back to Groq with up to 3 attempts (exponential backoff). The
        // free-tier shared key quotas are tight (Gemini 15 RPM, Groq 30 RPM)
        // so spaced retries usually clear the limit within a few seconds.
        const callGroq = () => fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
          body: JSON.stringify({ model: hasImage ? GROQ_VISION_MODEL : GROQ_MODEL, ...reasoningOpt(hasImage ? GROQ_VISION_MODEL : GROQ_MODEL), messages: apiMessages, temperature: 0.7, max_tokens: 1500, stream: true, stream_options: { include_usage: true } }),
        });
        const delays = [0, 2000, 4000]; // immediate, +2s, +4s = ~6s total worst-case
        let groqFallback;
        for (const wait of delays) {
          if (wait) await new Promise((r) => setTimeout(r, wait));
          groqFallback = await callGroq();
          if (groqFallback.ok) {
            return new Response(meterStream(env, groqFallback.body, { hasImage }), { headers: sseHeaders });
          }
          if (groqFallback.status !== 429 && groqFallback.status < 500) break; // 4xx (≠429) non-retryable; 429/5xx keep retrying
        }
        const fbErrText = await groqFallback.text().catch(() => '');
        console.error('Groq fallback also failed:', groqFallback.status, fbErrText);
        const rateLimited = gemRes.status === 429 || groqFallback.status === 429;
        const friendly = rateLimited
          ? 'שני ספקי ה-AI עמוסים. המתן 10–20 שניות ונסה שוב.'
          : `שגיאת AI: ${gemRes.status}/${groqFallback.status}`;
        // Refund the prepaid quota charge — a failed call must not burn it.
        await refundAiCharge(env, uid, hasImage);
        // 429 (not 502) for rate limits, so the client's own backoff retries too.
        return new Response(JSON.stringify({
          error: friendly,
          gemini: gemRes.status,
          groq: groqFallback.status,
        }), { status: rateLimited ? 429 : 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      return new Response(meterStream(env, await geminiStreamToOpenAI(gemRes.body), { hasImage }), { headers: sseHeaders });
    }

    // Free tier (or premium without a Gemini key configured) → Groq, with
    // retries: the shared key has tight per-minute token limits, so back off
    // and retry inside the worker (worst case ~7.5s) before surfacing an error.
    const callGroq = (model) => fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        ...reasoningOpt(model),
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1500,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    // 429 = transient rate limit → back off and retry the SAME model. 404 = the
    // model id was decommissioned (exactly what killed Llama 4 Scout) → retrying
    // it is futile, so switch to the fallback model ONCE, immediately. This makes
    // provider model-churn self-healing instead of surfacing a hard 404 to users.
    let groqModel = hasImage ? GROQ_VISION_MODEL : GROQ_MODEL;
    const groqFallbackModel = hasImage ? GROQ_VISION_FALLBACK_MODEL : GROQ_FALLBACK_MODEL;
    let switchedModel = false;
    let groqResponse;
    for (const wait of [0, 2500, 5000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      groqResponse = await callGroq(groqModel);
      if (groqResponse.ok) {
        return new Response(meterStream(env, groqResponse.body, { hasImage }), { headers: sseHeaders });
      }
      if (groqResponse.status === 404 && !switchedModel && groqFallbackModel !== groqModel) {
        console.error(`Groq model ${groqModel} returned 404 (decommissioned) — switching to ${groqFallbackModel}`);
        switchedModel = true;
        groqModel = groqFallbackModel;
        groqResponse = await callGroq(groqModel);
        if (groqResponse.ok) {
          return new Response(meterStream(env, groqResponse.body, { hasImage }), { headers: sseHeaders });
        }
      }
      if (groqResponse.status !== 429 && groqResponse.status < 500) break; // 4xx (≠429) non-retryable; 429/5xx keep retrying
    }

    const errText = await groqResponse.text().catch(() => '');
    console.error('Groq API error:', groqResponse.status, errText);
    // Refund the prepaid quota charge — a failed call must not burn it.
    await refundAiCharge(env, uid, hasImage);
    // 429 (not 502) for rate limits, so the client's own backoff retries too.
    const rateLimited = groqResponse.status === 429;
    return new Response(
      JSON.stringify({ error: rateLimited ? 'ספק ה-AI עמוס כרגע, נסה שוב בעוד רגע' : `שגיאת AI: ${groqResponse.status}` }),
      { status: rateLimited ? 429 : 502, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('AI Chat error:', err);
    // A thrown provider fetch lands here AFTER charging — refund so a transient
    // network blip doesn't silently burn the user's quota slot(s).
    if (charged) await refundAiCharge(env, charged.uid, charged.hasImage);
    return new Response(JSON.stringify({ error: 'שגיאה פנימית' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}

// ==================== AI Project Description ====================

const COACH_SYSTEM_PROMPT = `אתה מנטור מסחר אישי שמנתח את היומן של הסוחר וכותב לו דו"ח קצר וחד בעברית.

## פלט נדרש (חובה):
- בעברית בלבד, טבעית וזורמת (לא תרגום מילולי)
- 3 חלקים בלבד, בסדר הזה — כל אחד עם כותרת בדיוק בפורמט הזה:
  **חוזקות**
  **חולשות**
  **המלצות לפעולה**
- אם יבוקש דו"ח Premium מורחב — הוסף חלק רביעי: **תובנות מתקדמות**.
- תחת כל כותרת: 2–5 בולטים. כל בולט מתחיל ב"• " (תו בולט עברי). הימנע ממספור.
- בדיוק כך: **כותרת** בשורה משלה, ואז שורת בולטים, אחת לשורה.

## אסור (חובה לציית):
- אסור להתחיל שורה ב-#, ##, ### או כל סוג של אות-מספר-נקודה (1.).
- אסור לקרוא לסעיף "מסקנות", "סיכום" או כל כותרת אחרת מלבד הארבע המוגדרות.
- אסור: תחזיות מחיר, "בוליש/בריש", פסיכולוגיה כללית ("תשמור על קור רוח"), פתיחות שיווקיות, אזכור שאתה AI, סלוגנים.
- אסור להמציא נתונים — השתמש רק במה שמופיע ב-stats.
- בלי משפט פתיחה ("הנה ניתוח..."). תתחיל ישר בשורה: **חוזקות**.

## איכות התוכן:
- כל בולט קצר, ענייני, מסתמך על מספר אחד לפחות מה-stats.
- המלצות = פעולה ספציפית למסחר ("הפסק לסחור [מטבע] עד שתבקטסט [תנאי]"), לא טיפים גנריים ("התנהל בזהירות").
- אל תחזור על נתון שכבר הצגת בסעיף קודם.

## המפתח "psychology" (רק אם הוא קיים ב-stats):
הצלבה בין יומן הבוקר/ערב של הסוחר לבין העסקאות שנסגרו באותם ימים. כל המספרים שם כבר חושבו — אסור לחשב מחדש, לסכם או להסיק מספר שלא כתוב שם במפורש.
- אם המפתח קיים, חובה לשלב לפחות בולט אחד שנשען עליו. זו לא "פסיכולוגיה כללית" אלא ממצא כספי מדוד, ולכן מותר.
- "psychology.findings" הן שורות מוכנות ומדויקות. מותר לצטט או לנסח אותן מחדש, אסור לשנות בהן מספר.
- כל ההשוואות הן מול "psychology.baseline" — הממוצע של הסוחר עצמו בימים מתועדים, לא מול אפס ולא מול השוק.
- דלי שמסומן "thin": true נשען על פחות מ-minSampleForConclusion עסקאות. מותר להזכיר אותו רק עם הסתייגות מפורשת ("מדגם קטן מכדי להסיק"), ואסור לבנות עליו המלצה.
- אם המפתח לא קיים — אל תיגע בנושא ואל תבקש מהסוחר למלא יומן, אלא אם מיקוד הדו"ח המפורש הוא psychology. במקרה כזה אמור בבולט הראשון שאין עדיין ימים שבהם מולא יומן בוקר וגם נסגרה עסקה, ומה צריך למלא כדי לאפשר את המדידה.

## המפתח "planAudit" (רק אם הוא קיים ב-stats):
הצלבה בין תוכנית המסחר שהסוחר כתב לבין מה שהוא באמת עשה. גם כאן כל המספרים כבר חושבו — אסור להסיק מספר שלא כתוב.
- "planAudit.findings" הן חריגות מנוסחות ומסודרות לפי העלות הכספית שלהן. התייחס אליהן לפי הסדר.
- "compliance" משווה עסקאות שעמדו בתוכנית מול עסקאות שחרגו ממנה. אם החריגות דווקא הרוויחו יותר — אמור זאת: הבעיה בתוכנית, לא במשמעת.
- "notMeasurable" הוא כלל שהסוחר הגדיר ולא ניתן היה לבדוק. אם יש שם משהו, הזכר אותו ב"המלצות לפעולה" עם הפעולה שתאפשר לבדוק אותו (למשל להזין יתרת פתיחה ליומן).
- דלי עם "thin": true נשען על פחות מ-minSampleForConclusion עסקאות — הסתייגות חובה, אסור לבנות עליו המלצה.
- אסור להציע לסוחר לשנות את התוכנית רק כדי להתאים אותה למה שהוא עשה בפועל, אלא אם המספרים מראים שהחריגות רווחיות יותר.
- "compliance" מכסה רק עסקאות שאחד הכללים באמת בדק. "unmeasuredTrades" הן עסקאות שנשמרו בלי מטבע/טיימפריים/סשן ולכן לא נכללו — אם הערך גדול מאפס, ציין זאת ואל תציג את ההשוואה כאילו היא מכסה את כל העסקאות.
- אם "positions.conclusive" הוא false — אסור לקבוע שלא חרגת ממספר הפוזיציות. הנתונים פשוט לא מאפשרים לדעת.
- אם המפתח לא קיים — אל תיגע בנושא, אלא אם מיקוד הדו"ח המפורש הוא planAudit. במקרה כזה אמור בבולט הראשון שאין תוכנית פעילה להשוות מולה ומה צריך להגדיר בה.

## אל תערבב בין שתי מדידות המשמעת:
"psychology.discipline" הוא דיווח עצמי של הסוחר ביומן הערב, ברמת יום. "planAudit.compliance" הוא מדידה של חריגה מכללי התוכנית הכתובים, ברמת עסקה. הם יכולים לסתור זה את זה, וזו לא טעות. אם שניהם קיימים — אסור לאחד אותם לבולט אחד או להציג מספר אחד כאילו הוא מאשש את השני. ציין ליד כל מספר מאיזו מדידה הוא בא.`;

// Maps the quick-prompt the user clicked (stats.focus) to an explicit directive.
// Without this the model gets the same generic 4-section report every time —
// the focus key sits unused inside the stats JSON. Each directive re-centers the
// WHOLE report on the specific question, while keeping the fixed section format
// the UI parser expects.
const COACH_FOCUS_INSTRUCTIONS = {
  overview: 'הסוחר ביקש סקירה כללית של התקופה: הביצועים המרכזיים, המגמה הכללית, ומה הכי בולט לטובה ולרעה.',
  losses: 'הסוחר שאל: "איפה אני מפסיד הכי הרבה?". מקד את כל הדו"ח באיתור מקורות ההפסד — אילו מטבעות, סשנים, כיוונים או אסטרטגיות אחראים לרוב ההפסד, ומה בדיוק לעצור או לתקן.',
  topPair: 'הסוחר שאל: "מה המטבע הכי רווחי שלי?". מקד את כל הדו"ח במטבע/ות הרווחי/ים ביותר לפי ה-P&L — מה עובד שם, ואיך למנף את זה. ציין את שם המטבע המדויק והמספרים שלו.',
  mistakes: 'הסוחר שאל: "מה 3 הטעויות הכי גדולות שלי?". תחת "חולשות" פרט בדיוק 3 טעויות התנהלות מרכזיות לפי הנתונים, ותחת "המלצות לפעולה" תן תיקון קונקרטי לכל אחת.',
  sessionEdge: 'הסוחר שאל: "איזה סשן הכי רווחי?". מקד את כל הדו"ח בהשוואת סשני המסחר (bySession) — מתי כדאי לסחור ומתי להימנע, עם המספרים.',
  compareMonth: 'הסוחר שאל: "איך החודש מול הקודם?". מקד את כל הדו"ח בהשוואה בין התקופות — מה השתפר, מה הידרדר, ולמה, עם המספרים משני הצדדים.',
  strategyEdge: 'הסוחר שאל: "איזו אסטרטגיה מצליחה?". מקד את כל הדו"ח בהשוואת האסטרטגיות (byStrategy) — איזו מניבה הכי טוב ואיזו לזנוח, עם המספרים.',
  planAudit: 'הסוחר שאל: "האם אני עומד בתוכנית שלי?". מקד את כל הדו"ח במפתח planAudit. "חוזקות" = הכללים שהוא כן שומר עליהם ומה זה מכניס לו. "חולשות" = החריגות לפי סדר העלות. "המלצות לפעולה" = כלל אכיפה קונקרטי אחד לכל חריגה ("אל תפתח פוזיציה שלישית באותו יום"), ולא "תהיה ממושמע יותר". אם המפתח planAudit חסר — אמור בבולט הראשון שאין תוכנית פעילה להשוות מולה, והסבר מה צריך להגדיר בה.',
  psychology: 'הסוחר שאל: "כמה מצב הראש עולה לי?". מקד את כל הדו"ח במפתח psychology — תרגם רגש בוקר, רמת מוכנות, שגרת טרום-מסחר ועמידה בתוכנית לסכום כסף לעסקה מול ה-baseline שלו. "המלצות לפעולה" חייבות להיות כללי סינון קונקרטיים ("אל תפתח פוזיציה בימים שדירגת מוכנות מתחת ל-X"), לא עצות רגשיות. אם המפתח psychology חסר — אמור זאת מפורשות בבולט הראשון והסבר שצריך למלא יומן בוקר בימי מסחר.',
};

// Backtest mode — same 4-section output format (so the client parser is shared)
// but analysing STRATEGY VALIDATION on historical data, measured in R
// (risk units), not dollars.
const BACKTEST_COACH_SYSTEM_PROMPT = `אתה אנליסט אסטרטגיות מסחר שמנתח יומן בקטסט (בדיקת אסטרטגיה על נתוני עבר) וכותב דו"ח חד בעברית. הנתונים נמדדים ב-R (יחידות סיכון), לא בדולרים — R חיובי = רווח בכפולות הסיכון.

## פלט נדרש (חובה):
- בעברית בלבד, טבעית וזורמת (לא תרגום מילולי).
- 3 חלקים בלבד, בסדר הזה — כל אחד עם כותרת בדיוק בפורמט:
  **חוזקות**
  **חולשות**
  **המלצות לפעולה**
- אם יבוקש דו"ח מורחב — הוסף חלק רביעי: **תובנות מתקדמות**.
- תחת כל כותרת: 2–5 בולטים. כל בולט מתחיל ב"• " (תו בולט עברי). בלי מספור.
- בדיוק כך: **כותרת** בשורה משלה, ואז שורות בולטים, אחת לשורה.

## אסור (חובה לציית):
- אסור להתחיל שורה ב-#, ##, ### או אות-מספר-נקודה (1.).
- אסור כותרות אחרות מלבד הארבע המוגדרות.
- אסור: תחזיות מחיר, "בוליש/בריש", אזכור שאתה AI, סלוגנים, פתיחות שיווקיות.
- אסור להמציא נתונים — רק מה שמופיע ב-stats.
- בלי משפט פתיחה. תתחיל ישר בשורה: **חוזקות**.

## איכות התוכן (חשוב):
- זו בדיקת אסטרטגיה, לא מסחר חי. הערך את ה-EDGE: האם האסטרטגיה רווחית (תוחלת R חיובית, Profit Factor מעל 1)?
- התייחס לגודל המדגם: מתחת ל-~20 עסקאות הסק בזהירות וציין במפורש שהמדגם קטן.
- אתר את הצירופים הרווחיים ביותר (אסטרטגיה × סשן × זוג × טיימפריים) לפי ממוצע R ו-Win Rate, ואת המפסידים.
- כל בולט קצר, ומסתמך על מספר אחד לפחות מה-stats.
- המלצות = פעולה ספציפית ("התמקד ב-[אסטרטגיה] בסשן [X] — ממוצע [R]R; זנח [Y] עם תוחלת שלילית"), לא טיפים גנריים.`;

// Polymarket wallet analyst — reads a smart-money wallet's public stats and
// positions and gives a structured Hebrew read. Same 4-section contract as the
// coach prompts so the client parser is shared.
const PM_ANALYST_SYSTEM_PROMPT = `אתה אנליסט שווקי-חיזוי שמנתח ארנק ציבורי ב-Polymarket (פלטפורמת הימורים על אירועים) וכותב דו"ח חד בעברית. הנתונים: ביצועי 30 יום (רווח, ROI, מחזור), פוזיציות פתוחות (שוק, תוצאה, שווי, רווח, נתח-מהתיק), ורווח ממומש מול לא-ממומש.

## פלט נדרש (חובה):
- בעברית בלבד, טבעית וזורמת.
- 3 חלקים בלבד, בסדר הזה — כל אחד עם כותרת בדיוק בפורמט:
  **חוזקות**
  **חולשות**
  **המלצות לפעולה**
- אם יבוקש דו"ח מורחב — הוסף חלק רביעי: **תובנות מתקדמות**.
- תחת כל כותרת: 2–5 בולטים. כל בולט מתחיל ב"• ". בלי מספור.

## אסור (חובה לציית):
- אסור להתחיל שורה ב-#, ##, ### או אות-מספר-נקודה (1.).
- אסור כותרות אחרות מלבד הארבע המוגדרות.
- אסור: המלצה להמר, הבטחת רווח, אזכור שאתה AI, פתיחות שיווקיות.
- אסור להמציא נתונים — רק מה שמופיע ב-stats.
- בלי משפט פתיחה. תתחיל ישר בשורה: **חוזקות**.

## איכות התוכן (חשוב):
- הערך את סגנון הארנק: ROI גבוה על מחזור נמוך = צלף סלקטיבי; מחזור ענק עם ROI דק = טוחן נפח.
- נתח ריכוזיות: פוזיציה עם נתח-מהתיק גבוה (30%+) = הימור-אמונה; פיזור רחב = ניהול סיכון.
- רווח לא-ממומש גדול מול ממומש = הרווח עדיין בסיכון; ציין זאת.
- זהה התמחות לפי נושאי השווקים בפוזיציות (ספורט/פוליטיקה/קריפטו...).
- המלצות = מה למי שעוקב אחרי הארנק כדאי לבדוק ("שים לב לפוזיציית [X] — 40% מהתיק"), לא ייעוץ הימורים.
- כל בולט מסתמך על מספר אחד לפחות מה-stats. מותר ואף רצוי לציין סיכונים.`;

// Personal analyst — the user's OWN Polymarket workspace: the wallets they
// track, what those wallets did recently, their saved strategies and the
// markets matching them right now. A daily-brief voice, not a wallet report.
const PM_BRIEF_SYSTEM_PROMPT = `אתה האנליסט האישי של המשתמש לשווקי-חיזוי (Polymarket). אתה מקבל את סביבת העבודה שלו: הארנקים שהוא עוקב אחריהם וביצועיהם, מהלכים אחרונים שלהם, האסטרטגיות ששמר, והשווקים שתואמים להן כרגע. אתה כותב לו תדרוך אישי חד בעברית.

## פלט נדרש (חובה):
- בעברית בלבד, בגוף שני ("הארנקים שלך", "האסטרטגיה שלך"), טבעית וזורמת.
- 3 חלקים בלבד, בסדר הזה — כל אחד עם כותרת בדיוק בפורמט:
  **חוזקות**
  **חולשות**
  **המלצות לפעולה**
- אם יבוקש דו"ח מורחב — הוסף חלק רביעי: **תובנות מתקדמות**.
- תחת כל כותרת: 2–5 בולטים. כל בולט מתחיל ב"• ". בלי מספור.

## אסור (חובה לציית):
- אסור להתחיל שורה ב-#, ##, ### או אות-מספר-נקודה (1.).
- אסור כותרות אחרות מלבד הארבע המוגדרות.
- אסור: המלצה להמר או להיכנס לפוזיציה, הבטחת רווח, אזכור שאתה AI, פתיחות שיווקיות.
- אסור להמציא נתונים — רק מה שמופיע ב-stats. אם חלק ריק (אין ארנקים במעקב / אין אסטרטגיה) — אמור זאת מפורשות והמלץ להשלים אותו, אבל רק כשהמפתח מופיע ב-JSON עם ערך ריק; רשימה שנחתכה (ראה "_truncated") אינה מעקב ריק.
- בלי משפט פתיחה. תתחיל ישר בשורה: **חוזקות**.

## איכות התוכן (חשוב):
- "חוזקות" = מה מסודר אצלו: איכות הארנקים שבמעקב (ציון/ROI), אסטרטגיה מוגדרת היטב, התאמות איכותיות שנמצאו.
- "חולשות" = פערים: מעקב ריק או אחרי ארנקים חלשים, אסטרטגיה רחבה מדי (יותר מדי התאמות = לא מסננת) או צרה מדי (אפס התאמות), ריכוז יתר בנושא אחד.
- "המלצות לפעולה" = צעדים קונקרטיים על סביבת העבודה: "הדק את רצפת הנזילות ל-X", "הוסף למעקב את [ארנק] — ROI [Y]", "בדוק את [שוק] — [N] ארנקים חכמים נכנסו", "צמצם את חלון הזמן".
- קשר בין הדברים: אם ארנק במעקב נכנס לשוק שתואם לאסטרטגיה — זו התובנה הכי חשובה, ציין אותה ראשונה.
- כל בולט מסתמך על מספר או שם אחד לפחות מה-stats.`;

const BACKTEST_FOCUS_INSTRUCTIONS = {
  overview: 'הסוחר ביקש סקירה כללית של הבקטסט: האם האסטרטגיה רווחית, מה ה-edge, ומה הכי בולט לטובה ולרעה.',
  profit: 'הסוחר שאל: "איפה אני מרוויח הכי הרבה?". מקד את כל הדו"ח בצירופים הרווחיים ביותר (אסטרטגיה/סשן/זוג/טיימפריים) לפי ממוצע R וסה"כ R — איפה ה-edge ואיך למקסם אותו.',
  strategy: 'הסוחר שאל: "איזו אסטרטגיה הכי טובה?". השווה את האסטרטגיות (byStrategy) — איזו מניבה תוחלת R חיובית ואיזו לזנוח, עם המספרים.',
  planReview: 'הסוחר שאל: "האם תוכנית הבקטסט שלי רווחית?". תן פסק דין ברור על ה-edge (תוחלת R, Profit Factor, Win Rate), התייחס לגודל המדגם, ומה נדרש כדי להפוך את התוכנית לברת-מסחר חי.',
  improve: 'הסוחר שאל: "מה לשפר?". מקד את הדו"ח בחולשות הניתנות לתיקון — צירופים מפסידים לזנוח, טיימפריימים/סשנים חלשים, ומה לבדוק יותר לפני מעבר למסחר חי.',
};

// ---- coach stats payload packing ----
// The prompt that follows the "אסור להמציא נתונים" rule must not be handed a
// JSON fragment. The budget below is measured in ESTIMATED TOKENS, not
// characters, because the thing it protects is a TOKEN bucket: one shared Groq
// free-tier key serves chat + coach + coin descriptions + digest (see
// groqFetchWithRetry), and its per-minute budget on the 70B is what a runaway
// payload actually breaks. Characters are a 3-4x wrong proxy for that — ASCII
// JSON runs ~3-4 chars/token while Hebrew (strategy names, market questions,
// notes) runs closer to 1 char/token in these BPE vocabularies, so a
// Hebrew-heavy payload sails through a char cap and then 429s.
// Sizing: deep = 5000 prompt tokens + ~900 system + 1400 answer ≈ 7.3K/run —
// inside the per-minute window, and ~13 deep runs against the 100K-tokens/day
// budget referenced below. Neither model's CONTEXT is the constraint
// (llama-3.3-70b 128K, gemini-2.0-flash 1M); the rate buckets are. Raise these
// only together with what the client sends, not instead of it.
const COACH_STATS_BUDGET_SHORT = 2500;
const COACH_STATS_BUDGET_DEEP = 5000;
// Successive trim passes: max array elements kept, max string length kept.
// Arrays lose their TAIL — every payload we send is ranked or most-recent-first
// (bestTrades/worstTrades, byPair, trackedWallets, topMatches), so the head is
// the part worth keeping.
const COACH_STATS_LADDER = [
  { arr: 40, str: 600 },
  { arr: 24, str: 400 },
  { arr: 12, str: 300 },
  { arr: 8, str: 220 },
  { arr: 5, str: 160 },
  { arr: 3, str: 120 },
  { arr: 2, str: 90 },
  { arr: 1, str: 60 },
];
// stats is client-supplied; cap the recursion. Real payloads are <= 4 deep.
const COACH_STATS_MAX_DEPTH = 12;
// Absolute floor for a payload that cannot be trimmed into budget at all (only
// reachable with a crafted request — e.g. hundreds of top-level keys with huge
// NAMES, which no trimming of values can shrink). Pure ASCII, ~25 tokens, and
// contains NO client-controlled text: it always parses and always fits.
const COACH_STATS_OVERFLOW = '{"_truncated":{"_all":"payload exceeded the size limit - nothing was sent"}}';

// Appended to EVERY coach system prompt. Without it the modes that are ordered
// to announce an empty section (PM_BRIEF_SYSTEM_PROMPT: "אם חלק ריק … אמור זאת
// מפורשות") would read a trimmed section as an empty one and tell the user they
// track no wallets. Lives in the SYSTEM message on purpose — nothing derived
// from the client payload may be interpolated into the prompt outside the
// ```json fence.
const COACH_TRUNCATION_RULE = `

## נתונים חתוכים (חובה):
- ה-JSON עלול להישלח מקוצר בגלל מגבלת גודל. אם מופיע בו מפתח "_truncated" — הערכים שם מציינים כמה פריטים מתוך כמה נשלחו בכל רשימה (למשל "6 of 24").
- במקרה כזה הסתמך רק על מה שקיבלת, וציין שהמדגם חלקי אם זה משנה למסקנה.
- מה שנחתך אינו "ריק": אל תסיק שאין שם נתונים, אל תמציא אותם, ואל תמליץ להשלים חלק שרק נחתך. "ריק" ייאמר רק כשהמפתח עצמו מופיע ב-JSON עם ערך ריק.`;

// ~tokens for a serialized payload. ASCII at 3 chars/token, everything else at
// 1 — both deliberately pessimistic, so the estimate never under-states cost.
function estimateCoachTokens(str) {
  let ascii = 0;
  for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) < 128) ascii += 1;
  return Math.ceil(ascii / 3) + (str.length - ascii);
}

// Cut without leaving a dangling half of a surrogate pair behind.
function cutCoachText(str, max) {
  let out = str.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  // Never end inside a token. psychology.findings and planAudit.findings are
  // pre-phrased sentences the prompt authorises the model to quote verbatim, so
  // a cut landing inside "$612.40" would hand it "$612." as a real figure. Back
  // up to the last space, but only when that keeps most of the budgeted text —
  // the floor preserves the "a string is never emptied" invariant for
  // space-free strings.
  const sp = out.lastIndexOf(' ');
  if (sp > max * 0.6) out = out.slice(0, sp);
  return out.trimEnd();
}

// Trim VALUES, never keys. Invariants that the callers rely on:
//   * every key at every level survives;
//   * a non-empty array never becomes empty (>= 1 element is always kept);
//   * a string is never emptied.
// That is what makes "this section is empty" impossible to infer falsely from a
// trimmed payload.
function trimCoachValue(value, path, caps, report, depth) {
  if (depth > COACH_STATS_MAX_DEPTH) {
    report.depth += 1;
    return '[nested]';
  }
  if (typeof value === 'string') {
    if (value.length <= caps.str) return value;
    report.strings += 1;
    return `${cutCoachText(value, caps.str)}…`;
  }
  if (Array.isArray(value)) {
    const keep = value.length ? Math.max(1, Math.min(value.length, caps.arr)) : 0;
    if (keep < value.length) {
      const seen = report.arrays.get(path) || { kept: 0, total: 0, places: 0 };
      seen.kept += keep;
      seen.total += value.length;
      seen.places += 1;
      report.arrays.set(path, seen);
    }
    const out = [];
    for (let i = 0; i < keep; i++) out.push(trimCoachValue(value[i], `${path}[]`, caps, report, depth + 1));
    return out;
  }
  if (value && typeof value === 'object') {
    // Null prototype: a literal "__proto__" key in the client JSON then lands as
    // a plain own property instead of hitting the prototype setter and silently
    // disappearing (which would break the "every key survives" invariant).
    const out = Object.create(null);
    for (const k of Object.keys(value)) {
      out[k] = trimCoachValue(value[k], path ? `${path}.${k}` : k, caps, report, depth + 1);
    }
    return out;
  }
  return value; // number | boolean | null
}

function coachTruncationNote(report) {
  const note = Object.create(null);
  for (const [path, seen] of report.arrays) {
    note[path] = seen.places > 1
      ? `${seen.kept} of ${seen.total} (across ${seen.places} lists)`
      : `${seen.kept} of ${seen.total}`;
  }
  if (report.strings) note._strings = `${report.strings} long text values shortened`;
  if (report.depth) note._depth = `${report.depth} deeply nested values replaced`;
  return note;
}

// Fit `stats` into `budget` estimated tokens WITHOUT ever emitting broken JSON.
// The previous `JSON.stringify(stats).slice(0, 6000)` cut mid-structure, so the
// model got malformed JSON inside a ```json fence and invented the missing tail.
// Dropping whole top-level keys instead is no better: a missing section is
// indistinguishable from an empty one, and the prompts order the model to call
// out empty sections. So keep EVERY key and trim the CONTENTS — array tails and
// over-long strings — reporting inside the JSON, under "_truncated", how much of
// each list was sent ("6 of 24"). The return value always parses and is always
// within budget; nothing client-controlled escapes into the prompt.
// stats comes from request.json(), so it is plain JSON data: JSON.stringify here
// cannot throw and cannot return undefined.
function packCoachStats(stats, budget) {
  const asIs = JSON.stringify(stats);
  if (estimateCoachTokens(asIs) <= budget) return asIs;
  for (const caps of COACH_STATS_LADDER) {
    const report = { arrays: new Map(), strings: 0, depth: 0 };
    const trimmed = trimCoachValue(stats, '', caps, report, 0);
    const note = coachTruncationNote(report);
    if (Object.keys(note).length) trimmed._truncated = note;
    const json = JSON.stringify(trimmed);
    if (estimateCoachTokens(json) <= budget) return json;
  }
  return COACH_STATS_OVERFLOW;
}

async function handleAICoach(request, env, cors) {
  try {
    const body = await request.json().catch(() => ({}));
    const { stats, depth = 'short', mode = 'journal' } = body || {};
    // Arrays are rejected too: every caller sends a keyed object, and the
    // packer's whole contract is per-SECTION reporting, which a bare array has
    // no place to carry.
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
      return new Response(JSON.stringify({ error: 'Missing stats' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    // Mode swaps the system prompt + focus set; everything else (auth,
    // rate gate, quota, provider failover) is shared.
    const isBacktest = mode === 'backtest';
    const isPolymarket = mode === 'polymarket';       // one public wallet
    const isPmBrief = mode === 'polymarket-brief';    // the user's own workspace
    let systemPrompt = COACH_SYSTEM_PROMPT;
    if (isBacktest) systemPrompt = BACKTEST_COACH_SYSTEM_PROMPT;
    if (isPolymarket) systemPrompt = PM_ANALYST_SYSTEM_PROMPT;
    if (isPmBrief) systemPrompt = PM_BRIEF_SYSTEM_PROMPT;
    // All four modes forbid inventing data; all four can now receive a trimmed
    // payload, so all four need the rule that says a trimmed list is not an
    // empty one (see packCoachStats).
    systemPrompt += COACH_TRUNCATION_RULE;
    // Polymarket modes have no quick-prompts — an empty set keeps journal
    // directives from leaking into those reports.
    let focusSet = COACH_FOCUS_INSTRUCTIONS;
    if (isBacktest) focusSet = BACKTEST_FOCUS_INSTRUCTIONS;
    if (isPolymarket || isPmBrief) focusSet = {};
    let dataLabel = 'נתוני העסקאות';
    if (isBacktest) dataLabel = 'נתוני הבקטסט';
    if (isPolymarket) dataLabel = 'נתוני הארנק';
    if (isPmBrief) dataLabel = 'סביבת העבודה שלך';
    // NOTE: the stats payload is serialized further down, AFTER the premium
    // lookup — its budget is depth-aware (see packCoachStats).

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) {
      return new Response(JSON.stringify({ error: 'יש להתחבר כדי להשתמש בתכונה זו' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const premium = await isUserPremium(env, token, uid);

    // Shared rate gate + circuit breaker (same windows as /ai-chat).
    const gate = await aiRateGate(env, uid, premium);
    if (gate) return new Response(JSON.stringify(gate.body), { status: gate.status, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Free users get 5 coach runs/month tracked separately from the daily AI
    // quota — Premium is unmetered (covered by the soft caps in aiRateGate).
    // NOTE: the slot is charged only AFTER a successful provider response
    // (below), mirroring /ai-coin-description — a Groq 429 must not burn one
    // of the user's 5 monthly analyses.
    let chargeCoachQuota = null;
    if (!premium) {
      const monthKey = `coach:${uid}:${getIsraelDateStr().slice(0, 7)}`;
      const used = parseInt((await env.ALERTS_KV.get(monthKey)) || '0', 10) || 0;
      const FREE_COACH_PER_MONTH = 5;
      if (used >= FREE_COACH_PER_MONTH) {
        return new Response(JSON.stringify({
          error: `הגעת למכסה החודשית של ניתוחי AI (${FREE_COACH_PER_MONTH}). שדרג ל-Premium לניתוחים ללא הגבלה.`,
          quotaExceeded: true, used, limit: FREE_COACH_PER_MONTH,
        }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // 60-day TTL so the entry survives the month it covers.
      chargeCoachQuota = () => env.ALERTS_KV.put(monthKey, String(used + 1), { expirationTtl: 60 * 60 * 24 * 60 });
    }

    // Turn the clicked quick-prompt (stats.focus) into an explicit, prominent
    // directive so each button yields a genuinely different, focused report.
    // Own-property lookup only — a focus like "constructor" must not resolve
    // through the prototype chain into the prompt.
    const focusKey = typeof stats.focus === 'string' ? stats.focus : '';
    const focusText = Object.prototype.hasOwnProperty.call(focusSet, focusKey) ? focusSet[focusKey] : null;
    const focusLine = focusText
      ? `## מיקוד הדו"ח (חובה):\n${focusText}\nכל סעיף בדו"ח חייב לענות על השאלה הזו — אל תיתן דו"ח כללי.\n\n`
      : '';

    // Structure-aware size cap. A blind slice handed the model a JSON fragment;
    // packCoachStats keeps every section, trims list tails instead, and reports
    // what it trimmed INSIDE the fenced JSON ("_truncated"). Nothing derived
    // from the client payload is interpolated outside the fence.
    const statsStr = packCoachStats(stats, premium && depth === 'deep' ? COACH_STATS_BUDGET_DEEP : COACH_STATS_BUDGET_SHORT);

    const userPrompt =
      focusLine +
      (premium && depth === 'deep' ? 'יבוקש דו"ח Premium מורחב.\n' : 'יבוקש דו"ח קצר.\n') +
      `${dataLabel} (JSON):\n\`\`\`json\n${statsStr}\n\`\`\``;

    const groqRes = await groqFetchWithRetry(env, {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: premium && depth === 'deep' ? 1400 : 700,
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '');
      console.error('Coach groq error:', groqRes.status, errText);
      // Second provider: both Groq models exhausted/down → one Gemini attempt
      // before surfacing an error (e.g. the 70B's 100K-tokens/day budget dying
      // mid-evening must not kill the feature).
      const gemText = await geminiGenerateFallback(env, systemPrompt, userPrompt, premium && depth === 'deep' ? 1400 : 700);
      if (gemText) {
        if (chargeCoachQuota) await chargeCoachQuota();
        return new Response(JSON.stringify({ ok: true, text: gemText, premium }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: groqRes.status === 429 ? 'ה-AI עמוס כרגע, נסה שוב בעוד רגע' : `שגיאת AI: ${groqRes.status}` }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    if (chargeCoachQuota) await chargeCoachQuota();
    return new Response(JSON.stringify({ ok: true, text, premium }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('AI coach error:', err);
    return new Response(JSON.stringify({ error: 'שגיאה פנימית' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}

const PROJECT_DESC_SYSTEM_PROMPT = `אתה כתב קריפטו מקצועי. תפקידך לכתוב מאמרון קצר, ברור ואובייקטיבי בעברית על הפרויקט שמאחורי מטבע קריפטו.

## הנחיות כתיבה:
- כתוב ב-3-4 פסקאות קצרות (פסקה = שורה ריקה ביניהן)
- אורך כולל: 600-900 תווים
- פסקה ראשונה: מה הפרויקט עושה, מתי הושק, ומי עומד מאחוריו
- פסקה שנייה: הטכנולוגיה והייחוד (consensus, layer, שפה וכו')
- פסקה שלישית: שימושים מעשיים והאקוסיסטם
- פסקה רביעית (אופציונלי): מצב נוכחי / כיוון עתידי
- אפשר להדגיש מונחים חשובים עם **bold** (לדוגמה: **Proof of Stake**)
- כתוב בעברית טבעית וזורמת — לא תרגום מילולי
- מונחים טכניים: בעברית + אנגלית בסוגריים (לדוגמה: שכבה שנייה (Layer 2))
- בלי כותרות (#), רק טקסט שוטף
- בלי המלצות השקעה, בלי "בוליש"/"בריש", בלי תחזיות מחיר
- אם המטבע לא מוכר לך — כתוב את מה שאתה כן יודע ואל תמציא נתונים
- אל תזכיר מחיר נוכחי, market cap, או נתונים שמשתנים`;

async function handleAIProjectDescription(request, env, cors) {
  try {
    const { coinName, symbol } = await request.json();
    if (!coinName || String(coinName).length > 80 || (symbol && String(symbol).length > 20)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid coinName' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Verify the Firebase ID token (signature-checked).
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) {
      return new Response(JSON.stringify({ error: 'יש להתחבר כדי להשתמש בתכונה זו' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const premium = await isUserPremium(env, token, uid);

    // Multi-window rate limiting + global circuit breaker (shared with /ai-chat).
    const gate = await aiRateGate(env, uid, premium);
    if (gate) return new Response(JSON.stringify(gate.body), { status: gate.status, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Free-tier daily quota — charged UPFRONT (#202, mirrors /ai-chat): the
    // old read→check→serve→increment raced under parallel requests. A failed
    // provider call refunds the charge below.
    if (!premium) {
      const dailyUsed = await incrementAiUsage(env, uid);
      if (dailyUsed > AI_DAILY_LIMIT) {
        return new Response(JSON.stringify({
          error: `הגעת למכסה היומית (${AI_DAILY_LIMIT} בקשות). שדרג ל-Premium לשימוש ללא הגבלה.`,
          quotaExceeded: true, used: AI_DAILY_LIMIT, limit: AI_DAILY_LIMIT,
        }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    const userPrompt = `כתוב מאמרון על הפרויקט שמאחורי המטבע ${coinName}${symbol ? ` (${String(symbol).toUpperCase()})` : ''}.`;

    const groqResponse = await groqFetchWithRetry(env, {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: PROJECT_DESC_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 900,
      stream: false,
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errText);
      // Refund the prepaid charge — a failed call must not burn the quota.
      if (!premium) await refundAiCharge(env, uid, false);
      return new Response(JSON.stringify({ error: groqResponse.status === 429 ? 'ספק ה-AI עמוס כרגע, נסה שוב בעוד רגע' : `שגיאת AI: ${groqResponse.status}` }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const data = await groqResponse.json();
    const text = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ text }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('AI Project Description error:', err);
    return new Response(JSON.stringify({ error: 'שגיאה פנימית' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}

// ==================== AI News Digest ====================
// One digest for ALL users: cron pulls the RSS feeds server-side, a single
// Groq call clusters duplicate stories and ranks what actually matters, and
// the result sits in KV (news:digest:{market}). Clients read the prepared
// blob — zero AI cost per user, no client-side CORS/rss2json dependency.

const NEWS_FEEDS = {
  crypto: [
    { key: 'cointelegraph', label: 'CoinTelegraph', rss: 'https://cointelegraph.com/rss' },
    { key: 'coindesk', label: 'CoinDesk', rss: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { key: 'decrypt', label: 'Decrypt', rss: 'https://decrypt.co/feed' },
    { key: 'theblock', label: 'The Block', rss: 'https://www.theblock.co/rss.xml' },
    { key: 'beincrypto', label: 'BeInCrypto', rss: 'https://beincrypto.com/feed/' },
    { key: 'cryptoslate', label: 'CryptoSlate', rss: 'https://cryptoslate.com/feed/' },
  ],
  stocks: [
    { key: 'yahoofinance', label: 'Yahoo Finance', rss: 'https://finance.yahoo.com/news/rssindex' },
    { key: 'marketwatch', label: 'MarketWatch', rss: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
    { key: 'cnbc', label: 'CNBC', rss: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
    { key: 'investing', label: 'Investing.com', rss: 'https://www.investing.com/rss/news_25.rss' },
    { key: 'nasdaq', label: 'Nasdaq', rss: 'https://www.nasdaq.com/feed/rssoutbound?category=Markets' },
  ],
};

const NEWS_DIGEST_REFRESH_MIN = 30;
const NEWS_MAX_HEADLINES = 60;   // cap what we send to the model
const NEWS_MAX_AGE_HOURS = 24;   // ignore older items

// Minimal RSS <item> extraction. Workers have no DOMParser; the feeds above
// are standard RSS 2.0 so tag-level regex extraction is sufficient and avoids
// shipping an XML parser.
function rssTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

// Feed links end up as <a href> for every user, so a compromised feed must
// not be able to smuggle a javascript:/data: URL through the digest.
const NEWS_LINK_RE = /^https?:\/\//i;

function parseRssItems(xml, source) {
  const items = [];
  const rssBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of rssBlocks.slice(0, 20)) {
    const title = rssTag(block, 'title');
    const link = rssTag(block, 'link');
    const pubDate = rssTag(block, 'pubDate') || rssTag(block, 'dc:date');
    if (title && NEWS_LINK_RE.test(link)) {
      items.push({ title, link, pubDate, sourceKey: source.key, sourceLabel: source.label });
    }
  }
  if (items.length) return items;
  // Atom fallback (<entry> + <link href="..."/>) so a feed that switches
  // format degrades gracefully instead of vanishing from the digest.
  const atomBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of atomBlocks.slice(0, 20)) {
    const title = rssTag(block, 'title');
    const linkM = block.match(/<link[^>]*href="([^"]+)"/i);
    const link = linkM ? linkM[1].replace(/&amp;/g, '&') : ''; // XML-escaped attr
    const pubDate = rssTag(block, 'published') || rssTag(block, 'updated');
    if (title && NEWS_LINK_RE.test(link)) {
      items.push({ title, link, pubDate, sourceKey: source.key, sourceLabel: source.label });
    }
  }
  return items;
}

const NEWS_EDITOR_BASE = `אתה עורך חדשות בכיר בדסק שוקי הון. תקבל רשימת כותרות (JSON) שנאספו ממספר אתרי חדשות ב-24 השעות האחרונות.

המשימה: לזהות את 5-7 הסיפורים שבאמת חשובים לסוחר, ולדרג אותם.

כללים:
- קבץ כותרות שמסקרות את אותו סיפור (אותו אירוע = סיפור אחד). סיקור על ידי כמה מקורות הוא אות לחשיבות.
- דלג על ספאם, פרסומות, ניתוחי מחיר גנריים, וכתבות דעה שוליות.
- headline: כותרת חדה בעברית (עד 12 מילים). why: שורה אחת בעברית — למה זה חשוב לסוחר עכשיו.
- ids: מזהי הכותרות המקוריות ששייכות לסיפור (לפחות אחת).

החזר JSON בלבד, במבנה:
{"stories":[{"ids":[3,17],"headline":"...","why":"...","impact":"high","category":"רגולציה"}]}`;

const NEWS_EDITOR_PROMPTS = {
  crypto: `${NEWS_EDITOR_BASE}

ספציפית לשוק הקריפטו:
- impact: "high" רק לאירוע שבאמת מזיז שוק (רגולציה, ETF, פריצה גדולה, החלטת ריבית, קריסה/אימוץ מוסדי). אחרת "medium".
- category: אחת מ: "רגולציה", "מאקרו", "שוק", "טכנולוגיה", "אבטחה", "אימוץ".`,
  stocks: `${NEWS_EDITOR_BASE}

ספציפית לשוק המניות:
- impact: "high" רק לאירוע שבאמת מזיז שוק (החלטת ריבית/פד, דוח של ענקית טק, מיזוג גדול, נתון מאקרו מפתיע, קריסה). אחרת "medium".
- category: אחת מ: "מאקרו", "דוחות", "שוק", "טכנולוגיה", "רגולציה", "סחורות".`,
};

async function buildNewsDigest(env, market) {
  const feeds = NEWS_FEEDS[market] || [];
  if (!feeds.length || !env.GROQ_API_KEY) return null;

  // Cheap per-market lock so a cron tick and an on-demand request can't both
  // burn a provider call. KV get→put isn't atomic; the worst case is one
  // duplicate build, which is harmless.
  const lockKey = `news:digest:lock:${market}`;
  if (await env.ALERTS_KV.get(lockKey)) return null;
  await env.ALERTS_KV.put(lockKey, '1', { expirationTtl: 120 });

  try {
    const results = await Promise.allSettled(feeds.map(async (source) => {
      const r = await fetch(source.rss, {
        headers: { 'User-Agent': 'Mozilla/5.0 TradeOS' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`${source.key} ${r.status}`);
      return parseRssItems(await r.text(), source);
    }));

    const cutoff = Date.now() - NEWS_MAX_AGE_HOURS * 3600_000;
    const headlines = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .filter((it) => {
        const t = Date.parse(it.pubDate);
        return !Number.isFinite(t) || t >= cutoff; // keep items with unparseable dates
      })
      .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
      .slice(0, NEWS_MAX_HEADLINES);
    if (headlines.length < 5) return null; // most feeds down — keep the old digest

    const modelInput = headlines.map((h, i) => ({
      id: i,
      title: h.title.slice(0, 200),
      source: h.sourceLabel,
    }));

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: NEWS_EDITOR_PROMPTS[market] || NEWS_EDITOR_PROMPTS.crypto },
          { role: 'user', content: JSON.stringify(modelInput) },
        ],
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
    });
    if (!groqRes.ok) {
      console.error('news digest groq error:', groqRes.status, await groqRes.text().catch(() => ''));
      return null;
    }
    const data = await groqRes.json();
    let parsed;
    try { parsed = JSON.parse(data.choices?.[0]?.message?.content || ''); } catch { return null; }
    const rawStories = Array.isArray(parsed?.stories) ? parsed.stories : [];

    // Map the model's headline ids back to real links ourselves — the model
    // never sees URLs, so it can't hallucinate them.
    const stories = rawStories.slice(0, 8).map((s) => {
      const ids = (Array.isArray(s.ids) ? s.ids : [])
        .map(Number) // LLMs in JSON mode drift to "3" — coerce before validating
        .filter((i) => Number.isInteger(i) && i >= 0 && i < headlines.length);
      if (!ids.length) return null;
      return {
        headline: String(s.headline || '').slice(0, 160),
        why: String(s.why || '').slice(0, 240),
        impact: s.impact === 'high' ? 'high' : 'medium',
        category: String(s.category || 'שוק').slice(0, 20),
        sources: ids.slice(0, 4).map((i) => ({
          label: headlines[i].sourceLabel,
          link: headlines[i].link,
          title: headlines[i].title.slice(0, 200),
        })),
      };
    }).filter((s) => s && s.headline);
    if (!stories.length) return null;

    const digest = { market, updatedAt: Date.now(), stories };
    await env.ALERTS_KV.put(`news:digest:${market}`, JSON.stringify(digest), { expirationTtl: 60 * 60 * 24 * 2 });
    await env.ALERTS_KV.put(`news:digest:${market}:ts`, String(digest.updatedAt), { expirationTtl: 60 * 60 * 24 * 2 });
    return digest;
  } catch (err) {
    console.error('news digest build failed:', err);
    return null;
  } finally {
    await env.ALERTS_KV.delete(lockKey).catch(() => {});
  }
}

// ---- Feed translation (batch, KV-cached) ------------------------------------
// Titles/descriptions are English; users read Hebrew. Translations are cached
// in KV keyed by a content hash, so across ALL users each article costs one
// provider call ever.

// SHA-256 (truncated) of the content. A cryptographic hash is required here:
// the KEY is derived from user-submitted title/desc and the VALUE is a shared,
// cross-user cache entry, so a collision-prone hash (e.g. djb2) would let a
// user craft input that collides with a real headline's key and poison what
// every other user sees under that headline.
async function newsHash(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

const NEWS_TRANSLATE_PROMPT = `אתה מתרגם חדשות פיננסיות מאנגלית לעברית.
תקבל JSON: רשימת פריטים עם id, title, desc.
תרגם לעברית טבעית וזורמת (לא מילולית). שמות חברות, מטבעות, מדדים וטיקרים נשארים באנגלית.
אל תוסיף מידע שלא קיים במקור. אם desc ריק — החזר desc ריק.
החזר JSON בלבד: {"items":[{"id":0,"title":"...","desc":"..."}]}`;

// Translation is high-volume/low-difficulty — run it on Groq's small instant
// model, which has a much higher tokens-per-minute allowance than the 70B
// (the 70B budget is reserved for chat/coach/digest). Falls back to the main
// model if the instant model is ever retired (4xx).
const NEWS_TRANSLATE_MODEL = 'llama-3.1-8b-instant';

async function groqTranslateCall(env, missing, model) {
  return fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: NEWS_TRANSLATE_PROMPT },
        { role: 'user', content: JSON.stringify(missing) },
      ],
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    }),
  });
}

async function handleNewsTranslate(request, env, cors) {
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };
  try {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    // Light per-user gate: normal use is ≤3 batches per feed load.
    const minute = await bumpWindow(env, `newstr:min:${uid}`, 60);
    if (minute.count > 10) {
      return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429, headers: jsonHeaders });
    }

    const body = await request.json().catch(() => ({}));
    // Keep batches small: input+output must fit the per-minute token budget
    // even when several batches arrive back-to-back on a feed load. Do NOT
    // drop empty-title items here — the client maps the response back by array
    // position, so dropping a slot would shift every later translation onto
    // the wrong article. Empty slots are simply skipped and left null.
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 12).map((it) => ({
      title: String(it?.title || '').slice(0, 300),
      desc: String(it?.desc || '').slice(0, 200),
    }));
    if (!items.some((it) => it.title)) return new Response(JSON.stringify({ error: 'no items' }), { status: 400, headers: jsonHeaders });

    // Key on the TITLE only: titles are stable across feed refreshes, whereas
    // descriptions can drift (view counts, edits) and would cause a permanent
    // cache miss → a recurring provider call for the same article. null key for
    // empty-title slots keeps `out` index-aligned with what the client sent.
    const keys = await Promise.all(items.map(async (it) => (it.title ? `news:tr:${await newsHash(it.title)}` : null)));
    const out = await Promise.all(keys.map((k) => (k ? env.ALERTS_KV.get(k, 'json') : null)));

    const missing = [];
    items.forEach((it, i) => { if (it.title && !out[i]) missing.push({ id: i, title: it.title, desc: it.desc }); });

    if (missing.length && env.GROQ_API_KEY) {
      // Respect + contribute to the same global daily AI ceiling as chat/coach,
      // plus a per-user daily cap — the translate route must not be an
      // unmetered path to drain the shared Groq/KV budget.
      const gKey = `aiglobal:${getIsraelDateStr()}`;
      const [g, uDay] = await Promise.all([
        env.ALERTS_KV.get(gKey, 'json'),
        env.ALERTS_KV.get(`newstr:day:${uid}`, 'json'),
      ]);
      const overCeiling = (g && g.count >= AI_GLOBAL_DAILY_CEILING) || (uDay && uDay.count >= 60);
      if (overCeiling) {
        // Serve whatever is already cached; skip new provider work.
        return new Response(JSON.stringify({ items: out }), { headers: jsonHeaders });
      }

      let groqRes = await groqTranslateCall(env, missing, NEWS_TRANSLATE_MODEL);
      if (!groqRes.ok && groqRes.status >= 400 && groqRes.status < 500 && groqRes.status !== 429) {
        // Model gone/renamed — one retry on the main model.
        groqRes = await groqTranslateCall(env, missing, GROQ_MODEL);
      }
      if (groqRes.ok) {
        // Count this provider call against both ceilings.
        await Promise.all([
          bumpWindow(env, gKey, AI_WINDOWS_SEC.day),
          bumpWindow(env, `newstr:day:${uid}`, AI_WINDOWS_SEC.day),
        ]);
        const data = await groqRes.json();
        let parsed;
        try { parsed = JSON.parse(data.choices?.[0]?.message?.content || ''); } catch { parsed = null; }
        for (const tr of (Array.isArray(parsed?.items) ? parsed.items : [])) {
          const i = Number(tr?.id);
          if (!Number.isInteger(i) || i < 0 || i >= items.length || out[i] || !tr?.title || !keys[i]) continue;
          const entry = { title: String(tr.title).slice(0, 300), desc: String(tr.desc || '').slice(0, 400) };
          out[i] = entry;
          await env.ALERTS_KV.put(keys[i], JSON.stringify(entry), { expirationTtl: 60 * 60 * 24 * 3 }).catch(() => {});
        }
      } else {
        console.error('news translate groq error:', groqRes.status);
      }
    }

    // Aligned array; null where no translation is available (client falls back
    // to the original English).
    return new Response(JSON.stringify({ items: out }), { headers: jsonHeaders });
  } catch (err) {
    console.error('news translate error:', err);
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: jsonHeaders });
  }
}

// Cron hook: rebuild each market's digest when it's older than
// NEWS_DIGEST_REFRESH_MIN. Reads only the tiny :ts keys per tick.
async function refreshNewsDigest(env) {
  for (const market of Object.keys(NEWS_FEEDS)) {
    if (!NEWS_FEEDS[market].length) continue;
    try {
      const ts = parseInt((await env.ALERTS_KV.get(`news:digest:${market}:ts`)) || '0', 10);
      if (ts && Date.now() - ts < NEWS_DIGEST_REFRESH_MIN * 60_000) continue;
      await buildNewsDigest(env, market);
    } catch (e) {
      console.error(`news digest refresh failed (${market}):`, e);
    }
  }
}

// ==================== Contact Developer ====================

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function handleContact(request, env, cors) {
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };
  try {
    // Verify Firebase ID token
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'יש להתחבר כדי לשלוח הודעה' }), { status: 401, headers: jsonHeaders });
    }

    // Verify the token SIGNATURE first — never trust an unverified JWT payload.
    // The uid used for rate-limiting and identity must come from the verified
    // result, otherwise an attacker could forge a uid and bypass the limit.
    const uid = await verifyFirebaseToken(token);
    if (!uid) {
      return new Response(JSON.stringify({ error: 'יש להתחבר מחדש' }), { status: 401, headers: jsonHeaders });
    }

    // Safe to decode the payload now (signature verified) for display fields only.
    let tokenEmail = null;
    let tokenName = null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      tokenEmail = payload.email || null;
      tokenName = payload.name || null;
    } catch { /* display fields only */ }

    // Parse body
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < 3) {
      return new Response(JSON.stringify({ error: 'ההודעה חייבת להכיל לפחות 3 תווים' }), { status: 400, headers: jsonHeaders });
    }
    if (message.length > 2000) {
      return new Response(JSON.stringify({ error: 'ההודעה חורגת מ-2000 תווים' }), { status: 400, headers: jsonHeaders });
    }

    // Rate limiting — 3 messages per hour per user
    const rlKey = `ratelimit:contact:${uid}`;
    const rlData = await env.ALERTS_KV.get(rlKey, 'json');
    const now = Date.now();
    if (rlData && now - rlData.start < 3600000) {
      if (rlData.count >= 3) {
        return new Response(JSON.stringify({ error: 'נשלחו יותר מדי הודעות. נסה שוב בעוד שעה.' }), { status: 429, headers: jsonHeaders });
      }
      await env.ALERTS_KV.put(rlKey, JSON.stringify({ start: rlData.start, count: rlData.count + 1 }), { expirationTtl: 3700 });
    } else {
      await env.ALERTS_KV.put(rlKey, JSON.stringify({ start: now, count: 1 }), { expirationTtl: 3700 });
    }

    // Optional display info from client (not trusted for security, just UI)
    const clientName = typeof body.displayName === 'string' ? body.displayName : null;
    const name = clientName || tokenName || 'משתמש ללא שם';

    // Deliver to the developer — Web Push (uid-keyed, best-effort) + an email
    // copy with the full message (#219: the app has no external bot anymore).
    let pushSent = 0;
    if (env.DEV_UID) {
      try {
        const r = await sendPushToUser(env, env.DEV_UID, {
          title: `📨 הודעה חדשה מ-${name}`,
          body: message.length > 180 ? `${message.slice(0, 177)}…` : message,
          url: '/admin',
        });
        pushSent = r.sent || 0;
      } catch { /* best-effort — email below is the reliable channel */ }
    }

    // Recipients: pinned override if set, otherwise every admin with an email
    // (same resolution as the weekly digest).
    let recipients = env.MAIL_TO_ADMIN_OVERRIDE ? [env.MAIL_TO_ADMIN_OVERRIDE] : [];
    if (!recipients.length && env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        recipients = (await listAllUsersAdmin(env))
          .filter((u) => u.role === 'admin' && u.email)
          .map((u) => u.email);
      } catch { /* fall through — the push may still have landed */ }
    }
    let emailOk = false;
    if (recipients.length) {
      const html = emailShell({
        headline: '📨 הודעה חדשה מ-TradeOS',
        intro: `${escapeHtml(name)} (${escapeHtml(tokenEmail || 'ללא מייל')}) שלח/ה הודעה מהאפליקציה.`,
        body:
          `<p style="margin:0 0 12px;font-size:12px;color:#7d8492">UID: <code>${escapeHtml(uid)}</code></p>` +
          `<p style="margin:0;font-size:14px;color:#e6e9ef;white-space:pre-wrap;text-align:right">${escapeHtml(message)}</p>`,
        ctaText: 'פתח את פאנל הניהול',
        ctaUrl: 'https://tradeos-91a58.web.app/admin',
      });
      for (const to of recipients) {
        const r = await sendEmail(env, {
          to,
          subject: `📨 פנייה חדשה — ${name}`,
          html,
          replyTo: tokenEmail || undefined,
        });
        if (r.ok) emailOk = true;
      }
    }

    if (!pushSent && !emailOk) {
      console.error('Contact: no delivery channel succeeded (set DEV_UID with a push subscription, or MAIL_TO_ADMIN_OVERRIDE / RESEND_API_KEY)');
      return new Response(JSON.stringify({ error: 'שגיאה בשליחת ההודעה' }), { status: 502, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (err) {
    console.error('Contact handler error:', err);
    return new Response(JSON.stringify({ error: 'שגיאה פנימית' }), { status: 500, headers: jsonHeaders });
  }
}

// ==================== HTTP Handler ====================

const ALLOWED_ORIGINS = [
  'https://tradeos-91a58.web.app',
  'https://tradeos-91a58.firebaseapp.com',
  'https://trade-os.tradeos.workers.dev',
  'https://trade-os-staging.tradeos.workers.dev',
];
// Firebase Hosting preview channels have URLs like
// https://tradeos-91a58--CHANNEL-HASH.web.app and are created automatically
// by GitHub Actions for every develop/feature branch and PR — they need to be
// able to call the Worker so we can test changes end-to-end before merging.
const PREVIEW_ORIGIN_RE = /^https:\/\/tradeos-91a58--[a-z0-9-]+\.web\.app$/i;
function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN_RE.test(origin);
}

// Serve a Binance /api/v3 request from Bybit, returning Binance-shaped JSON.
// ==================== News → price attribution ================================
// Answers "why did the price move", which is a different and far more honest
// question than "will it move". Detection is PRICE-first because only ~16% of
// headlines coincide with any price anomaly; the news is only ever the
// explanation. The scoring itself lives in ./newsImpact.js so it can be unit
// tested outside the Worker runtime.
//
// Subrequest budget per run: 1 news + 1 ticker list + IMPACT_SCAN_TOP klines.
const IMPACT_REFRESH_MIN = 10;    // matches the cron tick; the work is cheap
const IMPACT_SCAN_TOP = 8;        // candidates promoted to a kline read
const IMPACT_WINDOW_BARS = 3;     // 3 x 5m = the 15-minute move window
const IMPACT_BASELINE_BARS = 24;  // 2h of 5m bars as the volume baseline
const IMPACT_MIN_QUOTE_VOL = 5_000_000; // ignore illiquid pairs entirely

// Normalize the fast-news feed into the shape newsImpact expects. Anything
// without a title or a timestamp is dropped rather than defaulted.
async function fetchFastNews() {
  try {
    const r = await fetch(FAST_NEWS_API, { headers: { Accept: 'application/json' } });
    if (!r.ok) return [];
    const raw = await r.json();
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => ({
      id: x._id || x.url || '',
      title: String(x.title || '').slice(0, 300),
      url: typeof x.url === 'string' ? x.url : '',
      // sourceName is the outlet ("WSJ"); source is the channel ("Blogs").
      // Corroboration must count outlets, so the outlet wins when present.
      source: String(x.sourceName || x.source || '').slice(0, 60),
      ms: Number(x.time) || 0,
      symbols: Array.isArray(x.symbols) ? x.symbols.slice(0, 8) : [],
    })).filter((n) => n.title && n.ms);
  } catch {
    return [];
  }
}

// The short-window move for one symbol, measured against its own recent volume
// rather than a global constant — a 3x volume spike means something different
// on BTC than on a microcap.
async function symbolWindowMove(symbol) {
  const raw = await bybitAsBinance('klines', new URLSearchParams({
    symbol, interval: '5m', limit: String(IMPACT_BASELINE_BARS + IMPACT_WINDOW_BARS),
  }));
  if (!raw) return null;
  let rows;
  try { rows = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(rows) || rows.length < IMPACT_BASELINE_BARS + IMPACT_WINDOW_BARS) return null;

  const window = rows.slice(-IMPACT_WINDOW_BARS);
  const baseline = rows.slice(0, rows.length - IMPACT_WINDOW_BARS);
  const openPrice = Number(window[0][1]);
  const closePrice = Number(window[window.length - 1][4]);
  if (!(openPrice > 0) || !(closePrice > 0)) return null;

  const windowVol = window.reduce((sum, k) => sum + (Number(k[5]) || 0), 0) / window.length;
  const baseVol = baseline.reduce((sum, k) => sum + (Number(k[5]) || 0), 0) / baseline.length;
  if (!(baseVol > 0)) return null;

  return {
    symbol,
    changePct: ((closePrice - openPrice) / openPrice) * 100,
    volumeX: windowVol / baseVol,
    windowMin: IMPACT_WINDOW_BARS * 5,
  };
}

// One ticker call prices every listed pair; only the few moving RIGHT NOW are
// worth a kline read, so the expensive step stays bounded however many pairs
// the exchange lists.
//
// Candidates are ranked against a price snapshot from the previous run, not by
// 24h change. That distinction was found by running this live: TRUMPUSDT ranked
// first on 24h change while its actual 15-minute move was +0.04%, so a 24h
// ranking spends the whole kline budget on coins that moved hours ago and never
// looks at the one spiking this minute. The snapshot costs one KV read and one
// write, and yields a real short-window mover list across every symbol.
async function scanCandidateMoves(env) {
  const rawTickers = await bybitAsBinance('ticker/24hr', new URLSearchParams());
  if (!rawTickers) return [];
  let tickers;
  try { tickers = JSON.parse(rawTickers); } catch { return []; }
  if (!Array.isArray(tickers)) return [];

  const liquid = tickers.filter((t) => String(t.symbol || '').endsWith('USDT')
    && (Number(t.quoteVolume) || 0) >= IMPACT_MIN_QUOTE_VOL
    && Number(t.lastPrice) > 0);

  const prev = (await env.ALERTS_KV.get('news:impact:prices', 'json')) || {};
  const snapshot = {};
  for (const t of liquid) snapshot[t.symbol] = Number(t.lastPrice);
  // Written before the kline reads so a later failure still advances the
  // baseline — a stuck snapshot would inflate every subsequent delta.
  await env.ALERTS_KV.put('news:impact:prices', JSON.stringify(snapshot), { expirationTtl: 60 * 60 * 3 });

  const ranked = liquid
    .map((t) => {
      const before = Number(prev[t.symbol]) || 0;
      const nowPrice = Number(t.lastPrice);
      // No baseline yet (first run, or a newly listed pair) — fall back to the
      // 24h figure so the very first run still produces something.
      const delta = before > 0
        ? ((nowPrice - before) / before) * 100
        : (Number(t.priceChangePercent) || 0);
      return { symbol: t.symbol, delta };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, IMPACT_SCAN_TOP)
    .map((t) => t.symbol);

  const settled = await Promise.allSettled(ranked.map(symbolWindowMove));
  return settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
}

async function buildNewsImpact(env) {
  const now = Date.now();
  const [news, moves] = await Promise.all([fetchFastNews(), scanCandidateMoves(env)]);
  const index = buildMentionIndex(news, { now, windowMin: ATTRIBUTION_WINDOW_MIN });
  const findings = attributeMoves(moves, index, { now }).map((f) => ({ ...f, text: describeFinding(f) }));

  // What the market is loudest about right now, whether or not price moved.
  // Shown as context; it is explicitly NOT a signal and carries no direction.
  const loudest = [...index.values()]
    .filter((m) => m.sources.length >= 2)
    .sort((a, b) => b.sources.length - a.sources.length)
    .slice(0, 6)
    .map((m) => ({
      key: m.key, kind: m.kind, entity: m.entity, title: m.title, url: m.url,
      sourceCount: m.sources.length, sources: m.sources.slice(0, 6),
      ageMin: Math.max(0, Math.round((now - m.newestMs) / 60000)),
    }));

  return {
    updatedAt: now,
    newsCount: news.length,
    scanned: moves.length,
    findings,
    loudest,
  };
}

async function refreshNewsImpact(env) {
  try {
    const ts = parseInt((await env.ALERTS_KV.get('news:impact:ts')) || '0', 10);
    if (Date.now() - ts < IMPACT_REFRESH_MIN * 60 * 1000) return;
    const impact = await buildNewsImpact(env);
    await env.ALERTS_KV.put('news:impact', JSON.stringify(impact), { expirationTtl: 60 * 60 * 6 });
    await env.ALERTS_KV.put('news:impact:ts', String(impact.updatedAt), { expirationTtl: 60 * 60 * 6 });
  } catch (err) {
    console.error('news impact refresh failed:', err);
  }
}

// Covers the two endpoints the app actually uses — ticker/24hr (single symbol
// or a symbols=[...] batch) and klines. Returns a JSON string, or null when
// the subpath isn't covered / Bybit fails (caller then falls back to stale).
async function bybitAsBinance(subPath, searchParams) {
  try {
    if (subPath.startsWith('ticker/24hr')) {
      const r = await fetch('https://api.bybit.com/v5/market/tickers?category=spot', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) return null;
      const j = await r.json();
      const bySym = {};
      for (const t of (j?.result?.list || [])) bySym[t.symbol] = t;
      const toBinance = (t) => ({
        symbol: t.symbol,
        lastPrice: t.lastPrice,
        // Binance reports percent units; Bybit's price24hPcnt is a fraction.
        priceChangePercent: String((parseFloat(t.price24hPcnt) || 0) * 100),
        highPrice: t.highPrice24h,
        lowPrice: t.lowPrice24h,
        volume: t.volume24h,
        quoteVolume: t.turnover24h,
        // Binance exposes a 24h trade count and the market-overview screen
        // filters dead pairs with count >= 1000. Bybit has no equivalent, so
        // report a passing constant and let the real $-volume filter decide.
        count: '100000',
      });
      const single = searchParams.get('symbol');
      if (single) {
        const t = bySym[single];
        return t ? JSON.stringify(toBinance(t)) : null;
      }
      const batch = searchParams.get('symbols');
      if (batch) {
        let wanted = [];
        try { wanted = JSON.parse(batch); } catch { return null; }
        return JSON.stringify(wanted.map((s) => bySym[s]).filter(Boolean).map(toBinance));
      }
      // No symbol filter — the full ticker list (market overview builds its
      // top-10 / gainers-losers / trending / categories from this one call).
      return JSON.stringify((j?.result?.list || []).map(toBinance));
    }

    if (subPath.startsWith('klines')) {
      const symbol = searchParams.get('symbol');
      if (!symbol) return null;
      const interval = searchParams.get('interval') || '1d';
      const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 1000);
      const MAP = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1d': 'D', '1w': 'W', '1M': 'M' };
      const byInterval = MAP[interval];
      if (!byInterval) return null;
      // Default spot; the Wyckoff scanner passes category=linear (perpetual) so
      // its data matches the perp contracts the trader actually charts.
      const category = (searchParams.get('category') === 'linear') ? 'linear' : 'spot';
      // Optional explicit time window — Binance uses startTime/endTime (ms);
      // Bybit's kline endpoint takes start/end (ms). Forward when present.
      const startTime = searchParams.get('startTime');
      const endTime = searchParams.get('endTime');
      let bybitUrl = `https://api.bybit.com/v5/market/kline?category=${category}&symbol=${encodeURIComponent(symbol)}&interval=${byInterval}&limit=${limit}`;
      if (startTime) bybitUrl += `&start=${encodeURIComponent(startTime)}`;
      if (endTime) bybitUrl += `&end=${encodeURIComponent(endTime)}`;
      const r = await fetch(bybitUrl, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) return null;
      const j = await r.json();
      const list = j?.result?.list || [];
      if (!list.length) return null;
      // Bybit returns newest-first [start, open, high, low, close, volume,
      // turnover]; Binance is oldest-first 12-field arrays. The app reads
      // indices 0 (openTime), 4 (close) and 5 (volume).
      const rows = list.slice().reverse().map((k) => [
        Number(k[0]), k[1], k[2], k[3], k[4], k[5], 0, k[6], 0, '0', '0', '0',
      ]);
      return JSON.stringify(rows);
    }

    return null; // subpath not covered (depth, trades, …)
  } catch {
    return null;
  }
}

async function handleRequest(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  const cors = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'POST' && path === '/daily-stats') {
    try {
      // Auth: require a valid Firebase token; ignore any uid in the body and use
      // the token's uid so a caller can only write their own daily stats.
      const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
      const uid = await verifyFirebaseToken(token);
      if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const { stats } = await request.json();
      if (!stats) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      // uid-keyed for the Web Push daily summary (#219).
      await env.ALERTS_KV.put(`dailystats:u:${uid}:${getIsraelDateStr()}`, JSON.stringify(stats), { expirationTtl: 172800 });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch { return new Response(JSON.stringify({ error: 'Invalid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  }

  // Per-user notification schedule (journal reminder / daily summary /
  // economic calendar). Stored per-uid plus a rolled-up blob so the cron
  // reads ONE key per tick.
  if ((request.method === 'POST' || request.method === 'GET') && path === '/notify-settings') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (request.method === 'GET') {
      const s = await env.ALERTS_KV.get(`usettings:${uid}`, 'json');
      return new Response(JSON.stringify({ ok: true, settings: s || DEFAULT_SETTINGS }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const body = await request.json().catch(() => ({}));
    const hhmm = (v, dflt) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : dflt);
    const s = {
      journal: { enabled: body?.journal?.enabled === true, time: hhmm(body?.journal?.time, '21:00') },
      summary: { enabled: body?.summary?.enabled === true, time: hhmm(body?.summary?.time, '22:00') },
      calendar: { enabled: body?.calendar?.enabled === true },
    };
    await env.ALERTS_KV.put(`usettings:${uid}`, JSON.stringify(s));
    const all = (await env.ALERTS_KV.get('usettings:ALL', 'json')) || {};
    const anyOn = s.journal.enabled || s.summary.enabled || s.calendar.enabled;
    if (anyOn) all[uid] = s; else delete all[uid];
    await env.ALERTS_KV.put('usettings:ALL', JSON.stringify(all));
    return new Response(JSON.stringify({ ok: true, settings: s }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Economic calendar proxy — fetch Forex Factory server-side (no CORS, no
  // dependency on the flaky public allorigins proxy), with edge caching.
  if (request.method === 'GET' && path === '/calendar') {
    try {
      const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
        headers: { 'User-Agent': 'Mozilla/5.0 TradeOS' },
        cf: { cacheTtl: 1800, cacheEverything: true },
      });
      if (!r.ok) return new Response(JSON.stringify({ error: 'upstream' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      const body = await r.text();
      return new Response(body, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' } });
    } catch {
      return new Response(JSON.stringify({ error: 'fetch failed' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  // News → price attribution. Public read of the cron-prepared blob, same
  // reasoning as the digest below: public data, and the expensive part already
  // happened on the cron. A cold cache builds on demand so the first visitor
  // after a KV expiry still gets an answer.
  if (request.method === 'GET' && path === '/news/impact') {
    let impact = await env.ALERTS_KV.get('news:impact', 'json');
    if (!impact) {
      impact = await buildNewsImpact(env);
      await env.ALERTS_KV.put('news:impact', JSON.stringify(impact), { expirationTtl: 60 * 60 * 6 });
      await env.ALERTS_KV.put('news:impact:ts', String(impact.updatedAt), { expirationTtl: 60 * 60 * 6 });
    }
    return new Response(JSON.stringify(impact), {
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
    });
  }

  // AI news digest — public read of the cron-prepared KV blob (news is public
  // data; the expensive part is the build, which is lock-guarded). A cold
  // cache (first request ever / after KV expiry) builds on demand.
  if (request.method === 'GET' && path === '/news/digest') {
    const market = url.searchParams.get('market') === 'stocks' ? 'stocks' : 'crypto';

    // Edge cache — the digest is public non-credentialed data, so serve repeat
    // hits from Cloudflare's cache with ZERO KV reads (a scripted loop would
    // otherwise cost 1 KV read each). ACAO '*' avoids caching a per-origin
    // header. Keyed by market via a normalized cache-key URL.
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.tradeos.internal/news/digest?market=${market}`);
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    let digest = await env.ALERTS_KV.get(`news:digest:${market}`, 'json');
    if (!digest) {
      // Negative-cache the cold-start build: the endpoint is public, so
      // without this a persistent build failure (Groq down, feeds down)
      // would turn every request into 6 feed fetches + a provider call.
      const recentlyFailed = await env.ALERTS_KV.get(`news:digest:${market}:fail`);
      if (!recentlyFailed) {
        digest = await buildNewsDigest(env, market);
        // Only negative-cache a GENUINE failure — a null from lock contention
        // (another build in flight) must not pin an empty digest.
        if (!digest) {
          const locked = await env.ALERTS_KV.get(`news:digest:lock:${market}`);
          if (!locked) await env.ALERTS_KV.put(`news:digest:${market}:fail`, '1', { expirationTtl: 300 });
        }
      }
    }

    const resp = new Response(JSON.stringify(digest || { market, updatedAt: 0, stories: [] }), {
      headers: {
        ...cors, 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json',
        // A real digest is edge+browser cacheable; the empty fallback must not
        // be, or a client racing the first build would pin "no stories".
        'Cache-Control': digest ? 'public, max-age=120' : 'no-store',
      },
    });
    if (digest) await cache.put(cacheKey, resp.clone());
    return resp;
  }

  if (request.method === 'POST' && path === '/news/translate') {
    return handleNewsTranslate(request, env, cors);
  }

  // CoinGecko proxy (avoids browser rate-limits). Cached in Cloudflare's edge
  // cache (free, unlimited) — NOT in KV: the cache key is caller-controlled
  // (subpath + querystring), so an unauthenticated loop with a varying
  // parameter used to cost one KV write per request and exhaust the shared
  // daily write quota (alerts, coupons, AI quotas, push registrations) in
  // seconds. Subpaths are whitelisted to exactly what the app calls, so this
  // can't be driven as an open proxy either.
  if (request.method === 'GET' && path.startsWith('/cg/')) {
    const subPath = path.slice(4); // remove '/cg/'
    // coins/markets, coins/{id}, coins/{id}/market_chart, search,
    // simple/price, global — the full set the client uses (coingeckoApi,
    // coinImageCache, MarketOverview, Dashboard).
    const CG_ALLOWED = /^(coins\/[a-z0-9_-]{1,64}(\/market_chart)?|search|simple\/price|global)$/;
    if (!CG_ALLOWED.test(subPath)) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const cgUrl = `https://api.coingecko.com/api/v3/${subPath}${url.search}`;
    const ttl = subPath.startsWith('coins/markets') ? 3600 : 300; // 1h for markets, 5m for details/chart
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.tradeos.internal/cg/${subPath}${url.search}`);
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
      // Browser-like UA — CoinGecko's free tier 403s bare server-side fetches
      // from Cloudflare egress IPs but generally serves browser-looking ones.
      const res = await fetch(cgUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      if (!res.ok) return new Response(JSON.stringify({ error: res.status }), { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
      const text = await res.text();
      // ACAO '*' — public non-credentialed data, so the edge-cached copy
      // isn't pinned to a single requesting origin (news/digest pattern).
      const headers = { ...cors, 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` };
      await cache.put(cacheKey, new Response(text, { headers: { ...headers, 'X-Cache': 'HIT' } }));
      return new Response(text, { headers: { ...headers, 'X-Cache': 'MISS' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  // Binance proxy (avoids browser CORS/geo issues). Edge-cached, not KV —
  // same quota-exhaustion reasoning as /cg/ above.
  if (request.method === 'GET' && path.startsWith('/bnb/')) {
    const subPath = path.slice(5); // remove '/bnb/'
    // klines + ticker/24hr — the only endpoints the client calls
    // (coingeckoApi.fetchKlines, MarketOverview bulk tickers).
    const BNB_ALLOWED = /^(klines|ticker\/24hr)$/;
    if (!BNB_ALLOWED.test(subPath)) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    // api.binance.com returns 403 to Cloudflare Worker egress IPs in many
    // regions. data-api.binance.vision is Binance's public market-data mirror
    // (same /api/v3 surface — ticker, klines, depth) and isn't geo-blocked, so
    // we try the main host first and fall back to the vision mirror.
    const BNB_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
    const cache = caches.default;
    // Cache API keys are URLs — no 512-byte KV key limit, so long symbol
    // lists no longer need hashing.
    const cacheKey = new Request(`https://cache.tradeos.internal/bnb/${subPath}${url.search}`);
    const staleKey = new Request(`https://cache.tradeos.internal/bnb-stale/${subPath}${url.search}`);
    const ttl = 60; // prices refresh via client polling anyway
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;

      let res = null;
      let lastStatus = 0;
      for (const host of BNB_HOSTS) {
        const r = await fetch(`${host}/api/v3/${subPath}${url.search}`, { headers: { 'Accept': 'application/json' } });
        if (r.ok) { res = r; break; }
        lastStatus = r.status;
      }

      // Both Binance hosts blocked (403 from this CF colo) — translate the
      // request to Bybit and answer in Binance's response shape, so every
      // client consumer (coin details, klines charts, bulk tickers) keeps
      // working without changes.
      let text = null;
      if (res) {
        text = await res.text();
      } else {
        text = await bybitAsBinance(subPath, url.searchParams);
      }
      if (text === null) {
        // Bybit translation didn't cover this subpath / upstream failed —
        // serve the last good copy if we have one, but don't let the browser
        // pin the stale snapshot for its remaining hour.
        const stale = await cache.match(staleKey);
        if (stale) {
          const r = new Response(stale.body, stale);
          r.headers.set('Cache-Control', 'no-store');
          return r;
        }
        return new Response(JSON.stringify({ error: lastStatus }), { status: lastStatus || 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const headers = { ...cors, 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
      await cache.put(cacheKey, new Response(text, { headers: { ...headers, 'Cache-Control': `public, max-age=${ttl}`, 'X-Cache': 'HIT' } }));
      await cache.put(staleKey, new Response(text, { headers: { ...headers, 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'STALE' } }));
      return new Response(text, { headers: { ...headers, 'Cache-Control': `public, max-age=${ttl}`, 'X-Cache': res ? 'MISS' : 'BYBIT' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  // CME futures quotes (delayed) via Yahoo Finance chart API, KV-cached.
  // GET /fut/quotes?symbols=ES,NQ,GC — whitelisted symbols only, so this can't
  // be driven as an open proxy. Returns { ES: { price, change24h }, ... }.
  // Crypto spot quotes via Bybit, KV-cached. Binance (api.binance.com AND the
  // data-api.binance.vision mirror) and CoinGecko all return 403 to Cloudflare
  // Worker egress IPs, but api.bybit.com is reachable (the /exchange routes
  // already use it). GET /cx/quotes?symbols=BTC,ETH → { BTC: { price, change24h } }.
  if (request.method === 'GET' && path === '/cx/quotes') {
    // Validate symbol shape so an unauthenticated loop can't mint unbounded
    // cache keys (was: any caller string → its own cache entry).
    const wanted = (url.searchParams.get('symbols') || '')
      .split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{1,15}$/.test(s)).slice(0, 60);
    if (!wanted.length) return new Response(JSON.stringify({ error: 'no symbols' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Edge cache (free/unlimited), NOT KV — /cx polled at ~its TTL was writing
    // ~2,880 KV puts/day per open tab, a primary cause of the KV quota breach.
    const cache = caches.default;
    const ckey = wanted.join(',');
    const freshKey = new Request(`https://cache.tradeos.internal/cx/${ckey}`);
    const staleKeyReq = new Request(`https://cache.tradeos.internal/cx-stale/${ckey}`);
    try {
      const hit = await cache.match(freshKey);
      if (hit) return hit;

      // One call returns every spot ticker; we pick the ones we want.
      const r = await fetch('https://api.bybit.com/v5/market/tickers?category=spot', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) {
        const stale = await cache.match(staleKeyReq);
        if (stale) return stale;
        return new Response(JSON.stringify({ error: r.status }), { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const j = await r.json();
      const list = j?.result?.list || [];
      const bySym = {};
      for (const t of list) bySym[t.symbol] = t; // e.g. BTCUSDT
      const out = {};
      for (const sym of wanted) {
        const t = bySym[`${sym}USDT`];
        if (!t) continue;
        const price = parseFloat(t.lastPrice);
        if (!Number.isFinite(price)) continue;
        out[sym] = { price, change24h: (parseFloat(t.price24hPcnt) || 0) * 100 }; // price24hPcnt is a fraction
      }
      const text = JSON.stringify(out);
      const h = { ...cors, 'Content-Type': 'application/json' };
      await cache.put(freshKey, new Response(text, { headers: { ...h, 'Cache-Control': 'public, max-age=60' } }));
      await cache.put(staleKeyReq, new Response(text, { headers: { ...h, 'Cache-Control': 'public, max-age=3600' } }));
      return new Response(text, { headers: { ...h, 'X-Cache': 'MISS' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  if (request.method === 'GET' && path === '/fut/quotes') {
    // Yahoo continuous-contract tickers for the contracts the app supports.
    const YAHOO_FUT = {
      ES: 'ES=F', MES: 'MES=F', NQ: 'NQ=F', MNQ: 'MNQ=F', YM: 'YM=F', MYM: 'MYM=F',
      RTY: 'RTY=F', M2K: 'M2K=F', CL: 'CL=F', MCL: 'MCL=F', NG: 'NG=F',
      GC: 'GC=F', MGC: 'MGC=F', SI: 'SI=F', ZB: 'ZB=F', ZN: 'ZN=F',
    };
    const wanted = (url.searchParams.get('symbols') || '')
      .split(',').map((s) => s.trim().toUpperCase()).filter((s) => YAHOO_FUT[s]);
    if (!wanted.length) return new Response(JSON.stringify({ error: 'no valid symbols' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Edge cache, NOT KV — same quota fix as /cx.
    const cache = caches.default;
    const ckey = wanted.join(',');
    const freshKey = new Request(`https://cache.tradeos.internal/fut/${ckey}`);
    const staleKeyReq = new Request(`https://cache.tradeos.internal/fut-stale/${ckey}`);
    try {
      const hit = await cache.match(freshKey);
      if (hit) return hit;

      const out = {};
      // Fan out per symbol (Yahoo's chart endpoint is per-ticker). Capped by the
      // whitelist (≤16) and the 120s KV cache, so upstream load stays tiny.
      await Promise.all(wanted.map(async (sym) => {
        try {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(YAHOO_FUT[sym])}?interval=1d&range=2d`,
            { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
          );
          if (!r.ok) return;
          const j = await r.json();
          const meta = j?.chart?.result?.[0]?.meta;
          const price = meta?.regularMarketPrice;
          const prev = meta?.chartPreviousClose ?? meta?.previousClose;
          if (typeof price !== 'number') return;
          out[sym] = {
            price,
            change24h: (typeof prev === 'number' && prev > 0) ? ((price - prev) / prev) * 100 : 0,
          };
        } catch { /* skip symbol on upstream failure */ }
      }));

      if (!Object.keys(out).length) {
        const stale = await cache.match(staleKeyReq);
        if (stale) return stale;
        return new Response(JSON.stringify({ error: 'upstream failed' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const text = JSON.stringify(out);
      const h = { ...cors, 'Content-Type': 'application/json' };
      await cache.put(freshKey, new Response(text, { headers: { ...h, 'Cache-Control': 'public, max-age=120' } }));
      await cache.put(staleKeyReq, new Response(text, { headers: { ...h, 'Cache-Control': 'public, max-age=3600' } }));
      return new Response(text, { headers: { ...h, 'X-Cache': 'MISS' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  // AI Chat — Groq proxy with SSE streaming
  if (request.method === 'POST' && path === '/ai-chat') {
    return handleAIChat(request, env, cors);
  }

  // AI Project Description — short article about a coin's project (non-streaming)
  if (request.method === 'POST' && path === '/ai-project-desc') {
    return handleAIProjectDescription(request, env, cors);
  }

  // AI Coach — analyze the user's trade journal stats and return a structured
  // strengths/weaknesses/actions report. Free tier: 3 reports/month, short.
  if (request.method === 'POST' && path === '/ai-coach') {
    return handleAICoach(request, env, cors);
  }

  // Contact Developer — delivered to the admins via Web Push + email
  if (request.method === 'POST' && path === '/contact') {
    return handleContact(request, env, cors);
  }

  if (path === '/health') return new Response(JSON.stringify({ status: 'ok', time: new Date().toISOString() }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  // Web Push — register a browser push subscription for the signed-in user.
  if (request.method === 'POST' && path === '/push/subscribe') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { subscription } = await request.json().catch(() => ({}));
    if (!subscription?.endpoint) return new Response(JSON.stringify({ error: 'missing subscription' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    // One KV entry per endpoint (hashed) so multiple devices each get pushes.
    const key = `push:${uid}:${hashStr(subscription.endpoint)}`;
    await env.ALERTS_KV.put(key, JSON.stringify(subscription));
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Web Push — remove a subscription (on disable / logout).
  if (request.method === 'POST' && path === '/push/unsubscribe') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { endpoint } = await request.json().catch(() => ({}));
    if (endpoint) await env.ALERTS_KV.delete(`push:${uid}:${hashStr(endpoint)}`);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Web Push — send a test notification to all of the user's devices.
  if (request.method === 'POST' && path === '/push/test') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const result = await sendPushToUser(env, uid, {
      title: 'TradeOS 🔔',
      body: 'ההתראות עובדות! תקבל התראה כשנפתחת עסקה חדשה.',
      url: '/profile',
      tag: 'test',
    });
    return new Response(JSON.stringify({ ok: true, ...result, hasVapid: !!env.VAPID_JWK }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Store exchange API credentials, encrypted at rest (AES-GCM). This is the
  // single source of truth used by both the cron poller and the on-demand
  // sync/balance/positions endpoints — the secret is sent here ONCE and never
  // returned to the client again. (/push/exchange-register kept as an alias for
  // older clients.)
  if (request.method === 'POST' && (path === '/exchange/credentials/store' || path === '/push/exchange-register')) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!env.CREDS_ENCRYPTION_KEY) return new Response(JSON.stringify({ error: 'הצפנת מפתחות לא מוגדרת בשרת (CREDS_ENCRYPTION_KEY)' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { exchange, apiKey, apiSecret, passphrase } = await request.json().catch(() => ({}));
    if (!exchange || !apiKey || !apiSecret) return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!validExchangeId(exchange)) return new Response(JSON.stringify({ error: 'invalid exchange' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    try {
      await storeExchangeCreds(env, uid, exchange, { apiKey, apiSecret, passphrase });
    } catch {
      return new Response(JSON.stringify({ error: 'failed to store credentials' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Which exchanges the caller has connected (names only — never the secrets).
  if (request.method === 'GET' && path === '/exchange/credentials/status') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const mine = (await getPushexchKeys(env)).filter((n) => n.startsWith(`pushexch:${uid}:`));
    const exchanges = mine.map((n) => n.split(':')[2]).filter(Boolean);
    return new Response(JSON.stringify({ exchanges }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Drop stored exchange keys (on disconnect / disable).
  if (request.method === 'POST' && (path === '/exchange/credentials/delete' || path === '/push/exchange-unregister')) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { exchange } = await request.json().catch(() => ({}));
    if (exchange) {
      await env.ALERTS_KV.delete(`pushexch:${uid}:${exchange}`);
      await pushexchIndexRemove(env, (n) => n === `pushexch:${uid}:${exchange}`);
    } else {
      const l = await env.ALERTS_KV.list({ prefix: `pushexch:${uid}:` });
      for (const kk of l.keys) await env.ALERTS_KV.delete(kk.name);
      await pushexchIndexRemove(env, (n) => n.startsWith(`pushexch:${uid}:`));
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Caller's own AI usage for the current day — drives the progress bar.
  // Both tiers now report a real limit so premium users see how many requests
  // they've used today (we don't want a 'unlimited' label to lull anyone into
  // burning the shared token quota).
  if (request.method === 'GET' && path === '/ai-usage') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const premium = await isUserPremium(env, token, uid);
    if (premium) {
      // Premium uses the same daily counter we accrue in /ai-chat, capped by
      // the soft AI_PREMIUM_LIMITS.day for cost safety.
      const usage = await getAiUsage(env, uid);
      const imgUsage = await getAiImageUsage(env, uid);
      return new Response(JSON.stringify({
        used: usage.used,
        limit: AI_PREMIUM_LIMITS.day,
        unlimited: false,
        premium: true,
        imageUsed: imgUsage.used,
        imageLimit: imgUsage.limit,
        date: usage.date,
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const usage = await getAiUsage(env, uid);
    return new Response(JSON.stringify(usage), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: send a push notification to a specific user.
  // Admin-only: send the weekly digest right now to the caller's email — same
  // content the Sunday cron would build, so the admin can preview/verify the
  // email flow without waiting until Sunday.
  if (request.method === 'POST' && path === '/admin/test-digest') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!env.RESEND_API_KEY) return new Response(JSON.stringify({ error: 'RESEND_API_KEY חסר ב-Worker — לא ניתן לשלוח מיילים' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });

    let users;
    try { users = await listAllUsersAdmin(env); }
    catch { return new Response(JSON.stringify({ error: 'failed to list users' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }); }

    const me = users.find((u) => u.uid === adminUid);
    // Where to send admin emails. On Resend's free default sender, the only
    // allowed recipient is the email the Resend account itself was registered
    // with — which is often DIFFERENT from the admin's TradeOS profile email
    // (Firebase Auth email vs. Resend sign-up email). MAIL_TO_ADMIN_OVERRIDE
    // lets the owner pin the destination to their Resend-account email so the
    // 403 'can only send to your own address' error doesn't fire.
    const adminTo = env.MAIL_TO_ADMIN_OVERRIDE || me?.email;
    if (!adminTo) return new Response(JSON.stringify({ error: 'admin email not found on profile' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const digest = buildAdminDigest(users);
    const il = getIsraelTime();
    const html = emailShell({
      headline: '📊 הסיכום השבועי שלך',
      intro: `הנה הדופק של TradeOS היום, ${il.toLocaleDateString('he-IL', { day: '2-digit', month: 'long' })} (בדיקה).`,
      body: digest.emailBody,
      ctaText: 'פתח את פאנל הניהול',
      ctaUrl: 'https://tradeos-91a58.web.app/admin',
    });
    const r = await sendEmail(env, { to: adminTo, subject: '[TEST] 📊 הסיכום השבועי שלך — TradeOS', html });
    if (!r.ok) {
      // Pass the actual Resend message back so the admin sees the real reason
      // (e.g. "you can only send testing emails to your own email address").
      return new Response(JSON.stringify({ error: `Resend ${r.status}: ${r.message || 'unknown error'}`, sentTo: adminTo }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, sentTo: adminTo, stats: { newUsers: digest.newUsers, upgrades: digest.upgrades, expiringSoon: digest.expiringSoon, churn: digest.churn } }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: send a branded Premium confirmation email (payment / gift) to
  // a user. The admin panel calls this right after a manual grant so buyers
  // who paid by Bit/crypto/bank transfer get a polished confirmation.
  if (request.method === 'POST' && path === '/admin/payment-email') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!env.RESEND_API_KEY) return new Response(JSON.stringify({ error: 'RESEND_API_KEY חסר ב-Worker — לא ניתן לשלוח מיילים' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { email, name, kind, amount, method, days, expires } = await request.json().catch(() => ({}));
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return new Response(JSON.stringify({ error: 'missing/invalid email' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const METHOD_LABELS = { bit: 'ביט (Bit)', crypto: 'קריפטו', transfer: 'העברה בנקאית', cash: 'מזומן', other: 'אחר' };
    const amt = Number(amount) || 0;
    const { subject, html } = buildPremiumEmail({
      kind: kind === 'gift' || amt <= 0 ? 'gift' : 'payment',
      name: String(name || '').slice(0, 80),
      amount: amt,
      methodLabel: METHOD_LABELS[method] || null,
      days: Number.isFinite(Number(days)) ? Number(days) : null,
      expiresStr: expires ? String(expires).slice(0, 40) : null,
    });
    const r = await sendEmail(env, { to: String(email), subject, html });
    if (!r.ok) {
      // Pass Resend's real message through — e.g. the test-mode "can only send
      // to your own address" error — so the admin sees exactly why.
      return new Response(JSON.stringify({ error: `Resend ${r.status}: ${r.message || r.error || 'unknown error'}`, sentTo: email }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    appendAudit(env, { kind: 'payment_email', actor: adminUid, target: email, amount: amt, days: Number(days) || null });
    return new Response(JSON.stringify({ ok: true, sentTo: email }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (request.method === 'POST' && path === '/admin/notify') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { uid, title, body, url } = await request.json().catch(() => ({}));
    if (!uid || !title || !body) {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const result = await sendPushToUser(env, uid, {
      title: String(title).slice(0, 120),
      body: String(body).slice(0, 400),
      url: typeof url === 'string' && url ? url : '/',
      tag: `admin-${Date.now()}`,
    });
    appendAudit(env, { kind: 'notify', actor: adminUid, target: uid, title: String(title).slice(0, 120), body: String(body).slice(0, 400), sent: result.sent, total: result.total });
    return new Response(JSON.stringify({ ok: true, sent: result.sent, total: result.total }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: send the same push to a list of users (a segment from the panel).
  if (request.method === 'POST' && path === '/admin/notify-bulk') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { uids, title, body, url } = await request.json().catch(() => ({}));
    if (!Array.isArray(uids) || uids.length === 0 || !title || !body) {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const capped = uids.slice(0, 500); // safety cap
    const tag = `admin-bulk-${Date.now()}`;
    const payload = { title: String(title).slice(0, 120), body: String(body).slice(0, 400), url: typeof url === 'string' && url ? url : '/', tag };
    const results = await Promise.all(capped.map((uid) => sendPushToUser(env, uid, payload).catch(() => ({ sent: 0, total: 0 }))));
    let sent = 0, recipients = 0;
    for (const r of results) { sent += r.sent || 0; if ((r.sent || 0) > 0) recipients++; }
    appendAudit(env, { kind: 'notify-bulk', actor: adminUid, targeted: capped.length, recipients, sent, title: payload.title });
    return new Response(JSON.stringify({ ok: true, sent, recipients, targeted: capped.length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: invalidate the cached premium flag for a user. Called right
  // after granting or revoking Premium so the worker reflects the new plan
  // immediately instead of waiting up to the planflag cache TTL — otherwise a
  // freshly-upgraded user stays gated out of premium-only AI features.
  if (request.method === 'POST' && path === '/admin/refresh-plan') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { uid } = await request.json().catch(() => ({}));
    if (!uid) return new Response(JSON.stringify({ error: 'missing uid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    await env.ALERTS_KV.delete(`planflag:${uid}`);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: permanently delete a user — every Firestore subcollection,
  // the user doc, the public leaderboard entry, per-user KV keys and the
  // AUTH ACCOUNT itself. Must live here and not in the client: the rules
  // make other users' data read-only for admins, and deleting somebody
  // else's Auth account requires the service account (Identity Toolkit).
  if (request.method === 'POST' && path === '/admin/delete-user') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { uid } = await request.json().catch(() => ({}));
    if (!uid || typeof uid !== 'string' || !/^[A-Za-z0-9]{10,64}$/.test(uid)) {
      return new Response(JSON.stringify({ error: 'missing uid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (uid === adminUid) {
      return new Response(JSON.stringify({ error: 'self-delete via the profile page' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const gtoken = await getFirebaseAdminToken(env);
    const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)`;
    const gh = { Authorization: `Bearer ${gtoken}`, 'Content-Type': 'application/json' };

    // Identity snapshot for the audit entry + refuse to delete another admin.
    const docRes = await fetch(`${base}/documents/users/${uid}`, { headers: gh });
    const fields = docRes.ok ? (await docRes.json())?.fields || {} : {};
    if (fields.role?.stringValue === 'admin') {
      return new Response(JSON.stringify({ error: 'cannot delete an admin' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const email = fields.email?.stringValue || null;
    const displayName = fields.displayName?.stringValue || null;

    // Every subcollection the app writes — keep in sync with the client's
    // USER_SUBCOLLECTIONS (src/services/firestoreService.js).
    const SUBS = [
      'trades', 'journals', 'backtests', 'backtestJournals', 'dca',
      'tradingPlans', 'notes', 'strategies', 'morningJournals',
      'eveningJournals', 'processes', 'signals', 'watchlist', 'settings',
    ];
    let deletedDocs = 0;
    for (const sub of SUBS) {
      let pageToken = '';
      do {
        // __name__-only mask: we only need document paths for the deletes.
        const listUrl = `${base}/documents/users/${uid}/${sub}?pageSize=300&mask.fieldPaths=__name__${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const lr = await fetch(listUrl, { headers: gh });
        if (!lr.ok) break;
        const ld = await lr.json();
        const names = (ld.documents || []).map((d) => d.name);
        pageToken = ld.nextPageToken || '';
        if (names.length) {
          await fetch(`${base}/documents:batchWrite`, {
            method: 'POST', headers: gh,
            body: JSON.stringify({ writes: names.map((n) => ({ delete: n })) }),
          });
          deletedDocs += names.length;
        }
      } while (pageToken);
    }

    await fetch(`${base}/documents/leaderboard/${uid}`, { method: 'DELETE', headers: gh }).catch(() => {});
    await fetch(`${base}/documents/users/${uid}`, { method: 'DELETE', headers: gh }).catch(() => {});

    // The Auth account — the piece no client can touch. cloud-platform scope
    // on the admin token covers Identity Toolkit.
    const authRes = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete', {
      method: 'POST', headers: gh,
      body: JSON.stringify({ localId: uid }),
    });

    // Per-user KV leftovers: plan cache + push subscriptions.
    await env.ALERTS_KV.delete(`planflag:${uid}`).catch(() => {});
    const pushKeys = await env.ALERTS_KV.list({ prefix: `push:${uid}:` });
    for (const k of pushKeys.keys) await env.ALERTS_KV.delete(k.name).catch(() => {});

    await appendAudit(env, {
      kind: 'account_deleted', source: 'admin', actor: adminUid, target: uid,
      email, displayName, docs: deletedDocs, authDeleted: authRes.ok,
    });
    return new Response(JSON.stringify({ ok: true, docs: deletedDocs, authDeleted: authRes.ok }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Self-service deletion audit — called by the client right before it
  // deletes its own Auth user (the data wipe already happened), so the admin
  // panel can show who deleted their account and when.
  if (request.method === 'POST' && path === '/account/deleted') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { email, displayName } = await request.json().catch(() => ({}));
    await appendAudit(env, {
      kind: 'account_deleted', source: 'self', actor: uid, target: uid,
      email: typeof email === 'string' ? email.slice(0, 120) : null,
      displayName: typeof displayName === 'string' ? displayName.slice(0, 80) : null,
    });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: list recent audit log entries (newest first). Optional ?limit
  // (default 200, max 500) and ?kind=… filter applied client-side after the
  // KV list (we keep one prefix to avoid scanning multiple shards).
  if (request.method === 'GET' && path === '/admin/audit') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const u = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '200', 10) || 200, 1), 500);
    const kindFilter = u.searchParams.get('kind') || '';
    const list = await env.ALERTS_KV.list({ prefix: 'audit:', limit });
    const events = [];
    for (const k of list.keys) {
      const v = await env.ALERTS_KV.get(k.name, 'json');
      if (!v) continue;
      if (kindFilter && v.kind !== kindFilter) continue;
      events.push(v);
    }
    return new Response(JSON.stringify({ ok: true, events }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: list all coupon codes.
  if (request.method === 'GET' && path === '/admin/coupons') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const list = await env.ALERTS_KV.list({ prefix: 'coupon:' });
    const coupons = [];
    for (const k of list.keys) {
      const code = k.name.slice('coupon:'.length);
      const data = await env.ALERTS_KV.get(k.name, 'json');
      if (data) coupons.push({ code, ...data });
    }
    coupons.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return new Response(JSON.stringify({ ok: true, coupons }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: create a new coupon code.
  if (request.method === 'POST' && path === '/admin/coupons') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const body = await request.json().catch(() => ({}));
    const code = normalizeCouponCode(body.code);
    const days = parseInt(body.days, 10);
    if (!COUPON_CODE_RE.test(code)) {
      return new Response(JSON.stringify({ error: 'קוד לא תקין. אותיות/ספרות, 3–32 תווים.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return new Response(JSON.stringify({ error: 'מספר ימים חייב להיות בין 1 ל-3650.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const existing = await env.ALERTS_KV.get(`coupon:${code}`);
    if (existing) {
      return new Response(JSON.stringify({ error: 'קוד עם השם הזה כבר קיים.' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const doc = {
      days,
      maxUses: Number.isFinite(parseInt(body.maxUses, 10)) && parseInt(body.maxUses, 10) > 0 ? parseInt(body.maxUses, 10) : null,
      used: 0,
      expiresAt: body.expiresAt && !Number.isNaN(new Date(body.expiresAt).getTime()) ? new Date(body.expiresAt).toISOString() : null,
      label: typeof body.label === 'string' && body.label.length <= 80 ? body.label : null,
      createdBy: adminUid,
      createdAt: new Date().toISOString(),
    };
    await env.ALERTS_KV.put(`coupon:${code}`, JSON.stringify(doc));
    appendAudit(env, { kind: 'coupon_create', actor: adminUid, code, days, maxUses: doc.maxUses, label: doc.label });
    return new Response(JSON.stringify({ ok: true, code, ...doc }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: delete a coupon (won't refund users who already redeemed).
  if (request.method === 'DELETE' && path.startsWith('/admin/coupons/')) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const code = normalizeCouponCode(decodeURIComponent(path.split('/')[3] || ''));
    if (!code) return new Response(JSON.stringify({ error: 'missing code' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    await env.ALERTS_KV.delete(`coupon:${code}`);
    appendAudit(env, { kind: 'coupon_delete', actor: adminUid, code });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Public: look up a coupon's display info (no auth) so the share landing
  // page can render the offer before the visitor signs in. Never leaks
  // createdBy or per-user redemption data.
  if (request.method === 'GET' && path.startsWith('/coupons/info/')) {
    const code = normalizeCouponCode(decodeURIComponent(path.split('/')[3] || ''));
    if (!code) return new Response(JSON.stringify({ error: 'missing code' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const coupon = await env.ALERTS_KV.get(`coupon:${code}`, 'json');
    if (!coupon) return new Response(JSON.stringify({ ok: false, error: 'not-found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    const expired = coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now();
    const usedUp = coupon.maxUses != null && coupon.used >= coupon.maxUses;
    return new Response(JSON.stringify({
      ok: true,
      code,
      days: coupon.days,
      label: coupon.label || null,
      valid: !expired && !usedUp,
      reason: expired ? 'expired' : usedUp ? 'used-up' : null,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Coupon share preview. Messaging-app crawlers don't run the SPA, so a
  // link straight to the app shows the generic site card. This route handles
  // both audiences:
  //   - Crawlers (WhatsApp/Twitter/etc) get HTML with coupon-specific
  //     Open Graph tags so the share looks nice ("X ימי Premium במתנה").
  //   - Real humans get a 302 redirect straight to the app's /redeem/:code page
  //     so they never see the worker's "redirect" page (in-app browsers like
  //     WhatsApp's WKWebView often block JS/meta-refresh and would otherwise
  //     leave the visitor stuck on a blank page).
  // Reachable as /r/:code (short) or /share/redeem/:code.
  if (request.method === 'GET' && (path.startsWith('/r/') || path.startsWith('/share/redeem/'))) {
    const code = normalizeCouponCode(decodeURIComponent(path.split('/').pop() || ''));
    const appUrl = `https://tradeos-91a58.web.app/redeem/${encodeURIComponent(code)}`;
    const ua = request.headers.get('User-Agent') || '';
    // Preview crawlers / social bots that need OG tags. We're strict here:
    // real in-app browsers (e.g. WhatsApp's WKWebView) also include 'WhatsApp'
    // in the UA, so matching that loosely would trap real users. The actual
    // preview crawler sends 'WhatsApp/<version>' WITHOUT a Mozilla prefix,
    // hence the no-Mozilla guard.
    const looksLikeBrowser = /Mozilla/i.test(ua);
    const isCrawler = !looksLikeBrowser && /WhatsApp\/|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|SkypeUriPreview|Googlebot|bingbot|Pinterest|redditbot|vkShare|Applebot|bot|crawler|spider/i.test(ua);

    // Humans → plain 200 HTML page that shows a visible coupon teaser + button
    // immediately, then auto-redirects via JS/meta-refresh. We deliberately
    // do NOT return a 302 here: when the Location target is a different-origin
    // SPA (tradeos-91a58.web.app), some Chrome and iOS Safari builds follow
    // the redirect, render NOTHING during the bootstrap, and the user ends up
    // staring at a blank page. With 200+HTML the page is always visible from
    // millisecond zero and the redirect happens on top of that.
    if (!isCrawler) {
      const escUrl = String(appUrl).replace(/"/g, '&quot;');
      const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>🎁 קוד מתנה — TradeOS Premium</title>
<meta http-equiv="refresh" content="1; url=${escUrl}">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#0a0e16;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;min-height:100vh}
  .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:380px;width:100%;background:#0f1521;border:1px solid rgba(245,158,11,0.3);border-radius:20px;padding:32px 24px;text-align:center}
  .gift{font-size:48px;margin-bottom:12px}
  h1{margin:0 0 8px;font-size:22px;color:#f59e0b}
  p{margin:0 0 24px;font-size:14px;color:#9ca3af}
  a.btn{display:block;background:#f59e0b;color:#0a0e16;padding:16px 24px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px}
  a.btn:active{background:#d97706}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="gift">🎁</div>
    <h1>קוד מתנה ל-TradeOS Premium</h1>
    <p>פותחים את הקופון…</p>
    <a class="btn" href="${escUrl}">פתחו עכשיו ↩</a>
  </div>
</div>
<script>setTimeout(function(){window.location.href="${escUrl}"},50);</script>
</body></html>`;
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const ogImage = 'https://tradeos-91a58.web.app/og-image.png?v=coupon';

    let title = '🎁 קוד מתנה ל-TradeOS Premium';
    let desc = 'מימשו את הקוד וקבלו גישה מלאה: מנטור AI בעברית, סנכרון בורסות, מעקב ארנקים והתראות חכמות.';
    const coupon = code ? await env.ALERTS_KV.get(`coupon:${code}`, 'json') : null;
    if (coupon) {
      const expired = coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now();
      const usedUp = coupon.maxUses != null && coupon.used >= coupon.maxUses;
      title = `🎁 ${coupon.days} ימי TradeOS Premium במתנה`;
      desc = `${coupon.label ? esc(coupon.label) + ' · ' : ''}הקוד ${esc(code)} ממתין לך — לחצו לממש ולפתוח את כל הפיצ'רים.`;
      if (expired || usedUp) desc = `הקוד ${esc(code)} כבר אינו פעיל. היכנסו לראות מבצעים נוספים ב-TradeOS.`;
    }

    const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${esc(appUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${ogImage}" />
<link rel="canonical" href="${esc(appUrl)}" />
</head><body><a href="${esc(appUrl)}">${esc(title)}</a></body></html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Short cache so crawlers can re-fetch but we don't recompute every hit.
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // Authenticated user: redeem a coupon. Adds `days` to whatever Premium they
  // currently have (or starts a fresh window if free). Each user can redeem
  // each code at most once; the global maxUses, if set, is enforced too.
  // The plan write is done by the worker as Firebase admin (service account)
  // because the regular self-write rule forbids users from changing their own
  // plan/planExpires.
  if (request.method === 'POST' && path === '/coupons/redeem') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'יש להתחבר כדי לממש קוד' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!env.FIREBASE_SERVICE_ACCOUNT) {
      return new Response(JSON.stringify({ error: 'מערכת הקופונים לא מוגדרת בשרת' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const code = normalizeCouponCode((await request.json().catch(() => ({}))).code);
    if (!code) return new Response(JSON.stringify({ error: 'הזן קוד קופון' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const coupon = await env.ALERTS_KV.get(`coupon:${code}`, 'json');
    if (!coupon) return new Response(JSON.stringify({ error: 'הקוד לא נמצא' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'תוקף הקוד פג' }), { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (coupon.maxUses != null && coupon.used >= coupon.maxUses) {
      return new Response(JSON.stringify({ error: 'הקוד נוצל במלואו' }), { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const redeemKey = `coupon-redeemed:${code}:${uid}`;
    if (await env.ALERTS_KV.get(redeemKey)) {
      return new Response(JSON.stringify({ error: 'כבר מימשת את הקוד הזה' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Read the user's current planExpires (via their own token; the firestore
    // rule allows owner reads) so we can extend, not overwrite, an existing
    // Premium window.
    let currentExpiryMs = 0;
    try {
      const me = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (me.ok) {
        const f = (await me.json()).fields || {};
        const raw = f.planExpires?.timestampValue || f.planExpires?.stringValue;
        if (raw) currentExpiryMs = new Date(raw).getTime() || 0;
      }
    } catch { /* default to 0 → start from now */ }

    const now = Date.now();
    const startFrom = Math.max(currentExpiryMs, now);
    const newExpiry = new Date(startFrom + coupon.days * 86400000).toISOString();

    // Mark the code as redeemed BEFORE writing the plan to prevent a double-
    // grant race; if the plan write below fails, the user can try again — the
    // marker is per-uid so they won't double-redeem either way.
    await env.ALERTS_KV.put(redeemKey, '1');

    // Enforce maxUses by COUNTING the per-uid markers after claiming (#202) —
    // the used-counter's get→+1→put raced under concurrency, letting a capped
    // coupon over-redeem. Counting claim markers shrinks the race to KV's
    // list-propagation window instead of the whole redeem flow.
    if (coupon.maxUses != null) {
      const marks = await env.ALERTS_KV.list({ prefix: `coupon-redeemed:${code}:` });
      if (marks.keys.length > coupon.maxUses) {
        await env.ALERTS_KV.delete(redeemKey); // over cap — release the claim
        return new Response(JSON.stringify({ error: 'הקוד נוצל במלואו' }), { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    const fresh = await env.ALERTS_KV.get(`coupon:${code}`, 'json');
    if (fresh) {
      fresh.used = (fresh.used || 0) + 1;
      await env.ALERTS_KV.put(`coupon:${code}`, JSON.stringify(fresh));
    }

    // Apply the plan as Firebase admin.
    const wrote = await firebaseAdminPatchUser(env, uid, {
      plan: { stringValue: 'premium' },
      planExpires: { timestampValue: newExpiry },
      planGrantedAt: { stringValue: new Date().toISOString() },
      planSource: { stringValue: `coupon:${code}` },
    }, ['plan', 'planExpires', 'planGrantedAt', 'planSource']);
    if (!wrote.ok) {
      // Roll back the marker so the user can retry, but keep the use-counter
      // bump (it's just a global counter; +1 of slack is fine and avoids a
      // race window where the counter is now-correct but the marker is gone).
      await env.ALERTS_KV.delete(redeemKey);
      return new Response(JSON.stringify({ error: 'מימוש הקופון נכשל. נסה שוב.', detail: wrote.error }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Bust the 10-minute plan cache so Premium kicks in IMMEDIATELY (#203) —
    // the admin grant path already does this via /admin/refresh-plan; without
    // it a redeeming user stayed "free" for up to 10 minutes after paying.
    await env.ALERTS_KV.delete(`planflag:${uid}`);

    appendAudit(env, { kind: 'coupon_redeem', actor: uid, code, days: coupon.days, planExpires: newExpiry });

    // Schedule the expiry reminders and push a confirmation. Both best-effort.
    schedulePlanExpiryReminders(env, uid, newExpiry).catch(() => {});
    sendPushToUser(env, uid, {
      title: '🎉 קוד הקופון מומש בהצלחה',
      body: `קיבלת ${coupon.days} ימי Premium. תוקף עד ${new Date(newExpiry).toLocaleDateString('he-IL')}.`,
      url: '/premium',
      tag: `coupon-${code}-${uid}`,
    }).catch(() => {});

    // Best-effort: branded confirmation email to the redeemer (delivery to
    // arbitrary inboxes requires a verified sender domain on Resend).
    (async () => {
      const me = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!me.ok) return;
      const f = (await me.json()).fields || {};
      const email = f.email?.stringValue;
      if (!email) return;
      const { subject, html } = buildPremiumEmail({
        kind: 'coupon',
        name: f.displayName?.stringValue || '',
        days: coupon.days,
        expiresStr: new Date(newExpiry).toLocaleDateString('he-IL'),
        code,
      });
      await sendEmail(env, { to: email, subject, html });
    })().catch(() => {});

    // Notify the admin who created the coupon that someone just redeemed it.
    if (coupon.createdBy) {
      (async () => {
        let who = 'משתמש';
        try {
          const me = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (me.ok) {
            const f = (await me.json()).fields || {};
            who = f.displayName?.stringValue || f.email?.stringValue || who;
          }
        } catch { /* keep default */ }
        const used = fresh ? fresh.used : coupon.used + 1;
        const cap = coupon.maxUses ? `${used}/${coupon.maxUses}` : `${used}`;
        await sendPushToUser(env, coupon.createdBy, {
          title: `🎫 הקופון ${code} מומש`,
          body: `${who} מימש את הקוד (${cap} שימושים). ${coupon.days} ימי Premium ניתנו.`,
          url: '/admin',
          tag: `coupon-redeem-${code}-${uid}`,
        });
      })().catch(() => {});
    }

    return new Response(JSON.stringify({
      ok: true,
      days: coupon.days,
      planExpires: newExpiry,
      label: coupon.label || null,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: schedule the two expiry reminders (3 days before + day of) for
  // a target user. Called by the admin panel right after a Premium grant.
  if (request.method === 'POST' && path === '/admin/schedule-expiry') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { uid, planExpires } = await request.json().catch(() => ({}));
    if (!uid) return new Response(JSON.stringify({ error: 'missing uid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    await schedulePlanExpiryReminders(env, uid, planExpires || null);
    appendAudit(env, { kind: 'premium_grant', actor: adminUid, target: uid, planExpires: planExpires || null });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: cancel pending expiry reminders for a user (used on revoke).
  if (request.method === 'POST' && path === '/admin/cancel-expiry') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { uid } = await request.json().catch(() => ({}));
    if (!uid) return new Response(JSON.stringify({ error: 'missing uid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    await cancelPlanExpiryReminders(env, uid);
    appendAudit(env, { kind: 'premium_revoke', actor: adminUid, target: uid });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: another user's AI usage. Verifies admin role via the caller's
  // own user doc (reads allowed by Firestore rules).
  if (request.method === 'GET' && path.startsWith('/admin/ai-usage/')) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const targetUid = path.split('/')[3];
    if (!targetUid) return new Response(JSON.stringify({ error: 'missing uid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const usage = await getAiUsage(env, targetUid);
    // Report the TARGET user's real limit — premium/admin users have the
    // premium daily cap. getAiUsage alone always reports the free limit,
    // which made the panel show "x / 20" for users the chat shows 200.
    // The admin's token can read other users' docs (allowed by rules).
    const premium = await isUserPremium(env, token, targetUid);
    // Chart-image analyses are premium-only and tracked separately, so the
    // panel can show that quota too.
    const imgUsage = premium ? await getAiImageUsage(env, targetUid) : null;
    return new Response(JSON.stringify({
      ...usage,
      limit: premium ? AI_PREMIUM_LIMITS.day : usage.limit,
      premium,
      ...(imgUsage ? { imageUsed: imgUsage.used, imageLimit: imgUsage.limit } : {}),
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: aggregate today's AI usage across ALL users (text + image),
  // with a per-user breakdown so the panel can show totals and top users.
  if (request.method === 'GET' && path === '/admin/ai-usage-global') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const date = getIsraelDateStr();
    const perUser = {};
    let totalText = 0, totalImage = 0;
    const collect = async (prefix, field) => {
      const list = await env.ALERTS_KV.list({ prefix });
      const todays = list.keys.filter((k) => k.name.endsWith(`:${date}`));
      const vals = await Promise.all(todays.map((k) => env.ALERTS_KV.get(k.name)));
      todays.forEach((k, i) => {
        const n = parseInt(vals[i], 10) || 0;
        if (!n) return;
        const uid = k.name.split(':')[1];
        if (!perUser[uid]) perUser[uid] = { text: 0, image: 0 };
        perUser[uid][field] += n;
        if (field === 'text') totalText += n; else totalImage += n;
      });
    };
    await collect('aiusage:', 'text');
    await collect('aiimg:', 'image');
    return new Response(JSON.stringify({ date, totalText, totalImage, perUser }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: daily AI stats for the last N days (default 30) — request
  // counts + real token usage, for the usage-over-time graph and accurate cost.
  if (request.method === 'GET' && path === '/admin/ai-stats') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const qDays = parseInt(new URL(request.url).searchParams.get('days') || '30', 10);
    const days = Math.min(90, Math.max(1, Number.isFinite(qDays) ? qDays : 30));
    const base = getIsraelTime();
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 86400000);
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    const stats = await Promise.all(dates.map(async (ds) => {
      const v = await env.ALERTS_KV.get(`aistat:${ds}`, 'json');
      return { date: ds, text: v?.text || 0, image: v?.image || 0, tokIn: v?.tokIn || 0, tokOut: v?.tokOut || 0 };
    }));
    return new Response(JSON.stringify({ days, stats }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: system health. Returns ONLY booleans / public info / timestamps
  // — never tokens or secrets.
  if (request.method === 'GET' && path === '/admin/health') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const cronRaw = await env.ALERTS_KV.get('cron:last');
    const cronLast = cronRaw ? parseInt(cronRaw, 10) || null : null;
    const quotas = await fetchCloudflareQuotas(env);
    // Which AI models are actually wired up right now + their daily caps, so
    // the admin panel shows the live routing (Gemini premium vs Groq fallback)
    // without hard-coding model names on the client.
    const geminiActive = env.GEMINI_ENABLED === 'true' && !!env.GEMINI_API_KEY;
    return new Response(JSON.stringify({
      time: Date.now(),
      cronLast,
      pushConfigured: !!env.VAPID_JWK,
      aiConfigured: !!env.GROQ_API_KEY,
      ai: {
        geminiActive,
        models: {
          premiumText: geminiActive ? GEMINI_MODEL : GROQ_MODEL,
          freeText: GROQ_MODEL,
          groqFallback: GROQ_MODEL,
          vision: GROQ_VISION_MODEL,
          newsTranslate: NEWS_TRANSLATE_MODEL,
        },
        limits: {
          freeDaily: AI_DAILY_LIMIT,
          premiumDaily: AI_PREMIUM_LIMITS.day,
          premiumMinute: AI_PREMIUM_LIMITS.minute,
          premiumHour: AI_PREMIUM_LIMITS.hour,
          imageDaily: AI_IMAGE_DAILY_LIMIT,
          globalCeiling: AI_GLOBAL_DAILY_CEILING,
        },
      },
      quotas,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: live connectivity self-test for the AI providers. Fires ONE
  // minimal non-streaming request at Gemini and at Groq and reports each
  // provider's real HTTP status + the first slice of any error body — so a
  // "המערכת עמוסה" can be pinned to the actual cause (bad key vs 429 vs model
  // not found) without digging through Worker logs.
  if (request.method === 'GET' && path === '/admin/ai-test') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });

    const ping = [{ role: 'user', content: 'ping' }];
    const out = { geminiEnabled: env.GEMINI_ENABLED === 'true' };

    // Gemini (non-stream)
    if (!env.GEMINI_API_KEY) {
      out.gemini = { ok: false, status: null, model: GEMINI_MODEL, error: 'GEMINI_API_KEY לא מוגדר ב-Worker' };
    } else {
      try {
        const r = await fetch(GEMINI_URL(env.GEMINI_API_KEY), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toGeminiBody(ping)),
        });
        const body = await r.text().catch(() => '');
        out.gemini = { ok: r.ok, status: r.status, model: GEMINI_MODEL, error: r.ok ? null : body.slice(0, 400) };
      } catch (e) {
        out.gemini = { ok: false, status: 0, model: GEMINI_MODEL, error: String(e).slice(0, 400) };
      }
    }

    // Groq (non-stream)
    if (!env.GROQ_API_KEY) {
      out.groq = { ok: false, status: null, model: GROQ_MODEL, error: 'GROQ_API_KEY לא מוגדר ב-Worker' };
    } else {
      try {
        const r = await fetch(GROQ_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
          body: JSON.stringify({ model: GROQ_MODEL, messages: ping, max_tokens: 5, stream: false }),
        });
        const body = await r.text().catch(() => '');
        out.groq = { ok: r.ok, status: r.status, model: GROQ_MODEL, error: r.ok ? null : body.slice(0, 400) };
      } catch (e) {
        out.groq = { ok: false, status: 0, model: GROQ_MODEL, error: String(e).slice(0, 400) };
      }
    }

    // Groq VISION models (the chart-analysis path). A text "ping" is enough to
    // verify the model id is still alive — this is exactly the check that was
    // MISSING when Llama 4 Scout was decommissioned: /admin/ai-test only pinged
    // the text model, so a 404 on the vision model went undetected until users
    // hit it. Both primary and fallback are reported so a future churn is caught.
    if (env.GROQ_API_KEY) {
      for (const [label, model] of [['groqVision', GROQ_VISION_MODEL], ['groqVisionFallback', GROQ_VISION_FALLBACK_MODEL]]) {
        try {
          const r = await fetch(GROQ_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
            body: JSON.stringify({ model, messages: ping, max_tokens: 5, stream: false }),
          });
          const body = await r.text().catch(() => '');
          out[label] = { ok: r.ok, status: r.status, model, error: r.ok ? null : body.slice(0, 400) };
        } catch (e) {
          out[label] = { ok: false, status: 0, model, error: String(e).slice(0, 400) };
        }
      }
    }

    return new Response(JSON.stringify(out), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: Firestore document counts (users/trades/payments/leaderboard)
  // via COUNT aggregation queries — COUNTS ONLY, never documents/fields/tokens.
  // The daily read/write/delete quota meters were dropped: they relied on the
  // Cloud Monitoring API, whose service-account permission model kept 403ing
  // and isn't reliably populated on the Spark plan. The panel links to the
  // Firebase console for the authoritative quota view instead. Cached 5 min in
  // KV (NOT the shared edge cache, which ignores the auth header) — written and
  // read only after auth passes, so the cache stays gated.
  if (request.method === 'GET' && path === '/admin/firebase-usage') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });

    const cached = await env.ALERTS_KV.get('fbusage:cache');
    if (cached) return new Response(cached, { headers: { ...cors, 'Content-Type': 'application/json' } });

    const counts = { users: null, trades: null, payments: null, leaderboard: null };

    try {
      const gtoken = await getFirebaseAdminToken(env);

      // 2) Document counts via COUNT aggregation. Top-level collections use a
      //    plain from; `trades` lives under users/{uid}/trades so it needs a
      //    collection-group query (allDescendants). Each is best-effort.
      const aggBase = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)`;
      const countDocs = async (collectionId, allDescendants = false) => {
        try {
          const r = await fetch(`${aggBase}/documents:runAggregationQuery`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${gtoken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              structuredAggregationQuery: {
                structuredQuery: { from: [{ collectionId, ...(allDescendants ? { allDescendants: true } : {}) }] },
                aggregations: [{ count: {}, alias: 'c' }],
              },
            }),
          });
          if (!r.ok) return null;
          // Streaming RPC → the body is an ARRAY of result objects.
          const rows = await r.json();
          const v = (Array.isArray(rows) ? rows : [rows]).find((row) => row?.result)?.result?.aggregateFields?.c?.integerValue;
          return v != null ? parseInt(v, 10) : null;
        } catch { return null; }
      };
      [counts.users, counts.trades, counts.payments, counts.leaderboard] = await Promise.all([
        countDocs('users'),
        countDocs('trades', true),
        countDocs('payments'),
        countDocs('leaderboard'),
      ]);
    } catch { /* admin token / aggregation failed — return null counts, never break the panel */ }

    const body = JSON.stringify({ ok: true, at: Date.now(), counts });
    await env.ALERTS_KV.put('fbusage:cache', body, { expirationTtl: 300 });
    return new Response(body, { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: does a user have Web Push devices registered? Returns ONLY the
  // COUNT of push:{uid}:{hash} subscription keys — never the subscriptions
  // themselves (endpoints/keys stay in KV).
  if (request.method === 'GET' && path.startsWith('/admin/push-status/')) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const targetUid = path.split('/')[3];
    if (!targetUid) return new Response(JSON.stringify({ error: 'missing uid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const list = await env.ALERTS_KV.list({ prefix: `push:${targetUid}:` });
    return new Response(JSON.stringify({ ok: true, devices: list.keys.length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Admin-only: which exchanges a user has connected. Returns ONLY the
  // exchange ids (pushexch:{uid}:{exchange} key names) — the encrypted
  // credentials never leave KV.
  if (request.method === 'GET' && path.startsWith('/admin/exchanges-status/')) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const targetUid = path.split('/')[3];
    if (!targetUid) return new Response(JSON.stringify({ error: 'missing uid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const list = await env.ALERTS_KV.list({ prefix: `pushexch:${targetUid}:` });
    const exchanges = list.keys.map((k) => k.name.split(':')[2]).filter(Boolean);
    return new Response(JSON.stringify({ ok: true, exchanges }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Trade event notifications — delivered as Web Push to the caller's own
  // registered devices (uid-keyed, #219).
  if (request.method === 'POST' && path === '/notify') {
    try {
      // Auth: require a valid token; ignore any uid in the body and use the
      // token's uid so a caller can only notify themselves.
      const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
      const uid = await verifyFirebaseToken(token);
      if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const { type, pair, direction, price, pnl, entryPrice, stopLoss, leverage, positionSize, tpIndex, isLastTp } = await request.json();
      if (!type) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

      const dirLabel = direction === 'long' ? 'Long' : 'Short';
      const lev = parseFloat(leverage) || 1;
      const entry = parseFloat(entryPrice) || 0;
      const sl = parseFloat(stopLoss) || 0;
      const posSize = parseFloat(positionSize) || 0;
      const levStr = lev > 1 ? ` · ${lev}x` : '';

      const pnlPct = (pnl != null && posSize > 0) ? ((pnl / posSize) * 100).toFixed(2) : null;
      const pnlStr = pnl != null
        ? `${fmtPnl(pnl)}${pnlPct ? ` (${pnl >= 0 ? '+' : '-'}${Math.abs(parseFloat(pnlPct))}%)` : ''}`
        : null;

      let title;
      let bodyText;
      if (type === 'entry') {
        title = `🟢 פוזיציה נפתחה — ${pair} ${dirLabel}`;
        const parts = [`כניסה ${fmtPrice(entry)}`];
        if (sl > 0) parts.push(`סטופ ${fmtPrice(sl)}`);
        if (posSize > 0) parts.push(`גודל $${posSize.toLocaleString()}`);
        bodyText = parts.join(' · ') + levStr;
      } else if (type === 'tp') {
        const tpNum = tpIndex != null ? tpIndex + 1 : '?';
        title = `✅ TP${tpNum} הושג — ${pair}${isLastTp ? ' 🏁' : ''}`;
        const parts = [`מחיר ${fmtPrice(price)}`];
        if (pnlStr) parts.push(`P&L ‏${pnlStr}`);
        parts.push(isLastTp ? 'הפוזיציה נסגרה' : 'סגירה חלקית');
        bodyText = parts.join(' · ');
      } else if (type === 'sl') {
        title = `🔴 סטופ לוס — ${pair} ${dirLabel}`;
        const parts = [`מחיר ${fmtPrice(price)}`];
        if (pnlStr) parts.push(`הפסד ‏${pnlStr}`);
        parts.push('הפוזיציה נסגרה');
        bodyText = parts.join(' · ');
      } else {
        title = `📊 ${pair} · ${dirLabel}`;
        bodyText = fmtPrice(price);
      }

      const result = await sendPushToUser(env, uid, { title, body: bodyText, url: '/' });
      return new Response(JSON.stringify({ ok: true, sent: result.sent }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  }

  // Open positions sync — fetches currently open futures positions from the exchange
  if (request.method === 'POST' && path === '/exchange/open-positions') {
    try {
      // Auth: any authenticated user may call (uses caller-supplied exchange keys).
      const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
      const uid = await verifyFirebaseToken(token);
      if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const _rl = await bumpWindow(env, `rl:exch:${uid}`, 60);
      if (_rl.count > 30) return new Response(JSON.stringify({ error: 'יותר מדי בקשות לבורסה. נסה שוב בעוד רגע.' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      const _body = await request.json().catch(() => ({}));
      const { exchange } = _body;
      if (!exchange) return new Response(JSON.stringify({ ok: false, error: 'Missing exchange' }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 });
      const _creds = await resolveExchangeCreds(env, uid, exchange);
      if (!_creds) return new Response(JSON.stringify({ ok: false, error: 'reconnect_required' }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 409 });
      const { apiKey, apiSecret, passphrase } = _creds;

      if (exchange === 'mexc') {
        const enc = new TextEncoder();
        const hmac = async (secret, msg) => {
          const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
          return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
        };
        const ts = String(Date.now());
        const signature = await hmac(apiSecret, apiKey + ts);
        const headers = { ApiKey: apiKey, 'Request-Time': ts, Signature: signature, 'Content-Type': 'application/json' };

        const res = await fetch('https://contract.mexc.com/api/v1/private/position/open_positions', { headers });
        const data = await res.json().catch(() => ({}));
        // MEXC returns success:true OR code:0 depending on endpoint
        const isOk = data.success === true || data.code === 0;
        if (!isOk) return new Response(JSON.stringify({ ok: false, error: data.message || data.msg || 'MEXC API error' }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 });

        // data.data can be: array | { resultList: [] } | { list: [] }
        const rawList = Array.isArray(data.data)
          ? data.data
          : (data.data?.resultList || data.data?.list || []);

        const csMap = await mexcContractSizes();
        const positions = rawList.map(p => {
          const posType = p.positionType ?? p.position_type ?? p.type;
          const sym = (p.symbol || '').replace(/_/g, '');
          // MEXC uses openAvgPrice or holdAvgPrice for average entry
          const entryPrice = parseFloat(p.openAvgPrice || p.open_avg_price || p.holdAvgPrice || p.hold_avg_price) || 0;
          // MEXC vol is in CONTRACTS — convert to coin units via contractSize.
          const qty = (parseFloat(p.holdVol || p.hold_vol || p.positionAmt || p.vol) || 0) * (csMap[sym] || 1);
          const entryDate = new Date(Number(p.createTime || p.openTime || p.create_time || Date.now())).toISOString();
          const tpMx = parseFloat(p.takeProfitPrice || p.take_profit_price || 0) || 0;
          const liqMx = parseFloat(p.liquidatePrice || p.liquidate_price || p.liqPrice || 0) || 0;
          return {
            pair: sym,
            direction: posType === 1 ? 'long' : 'short',
            entryPrice,
            quantity: qty,
            leverage: parseFloat(p.leverage) || 1,
            stopLoss: parseFloat(p.stopLossPrice || p.stop_loss_price || 0) || 0,
            positionSize: qty * entryPrice,
            fees: 0,
            status: 'open',
            source: 'mexc',
            externalId: String(p.positionId || p.position_id || sym + '_' + ts),
            orderType: 'market',
            entryDate,
            tps: tpMx > 0 ? [tpMx] : [],
            exits: null,
            tpReached: [],
            result: null,
            journalId: null,
            liquidationPrice: liqMx > 0 ? liqMx : null,
            session: sessionFromDate(entryDate),
          };
        });
        return new Response(JSON.stringify({ ok: true, positions, count: positions.length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      if (exchange === 'bybit') {
        const enc = new TextEncoder();
        const hmac = async (secret, msg) => {
          const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
          return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
        };
        const ts = Date.now().toString();
        const recvWindow = '5000';
        const qs = 'category=linear&settleCoin=USDT';
        const sign = await hmac(apiSecret, ts + apiKey + recvWindow + qs);
        const res = await fetch(`https://api.bybit.com/v5/position/list?${qs}`, {
          headers: { 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-SIGN': sign, 'X-BAPI-RECV-WINDOW': recvWindow },
        });
        const data = await res.json();
        if (data.retCode !== 0) return new Response(JSON.stringify({ ok: false, error: data.retMsg || `Bybit ${data.retCode}` }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 });
        const list = (data.result?.list || []).filter((p) => parseFloat(p.size) > 0);
        const positions = list.map((p) => {
          const entryPrice = parseFloat(p.avgPrice) || 0;
          const qty = parseFloat(p.size) || 0;
          const tp = parseFloat(p.takeProfit) || 0;
          // Bybit's `createdTime` is the FIRST time a position was ever
          // opened on this symbol — for a freshly opened position it can be
          // months old. `updatedTime` matches the latest activity (≈ open
          // time when the position was just opened), which is what the user
          // expects in their journal.
          const entryDate = p.updatedTime
            ? new Date(parseInt(p.updatedTime)).toISOString()
            : (p.createdTime ? new Date(parseInt(p.createdTime)).toISOString() : new Date().toISOString());
          const liqPrice = parseFloat(p.liqPrice) || 0;
          return {
            pair: p.symbol,
            direction: p.side === 'Buy' ? 'long' : 'short',
            entryPrice,
            quantity: qty,
            leverage: parseFloat(p.leverage) || 1,
            stopLoss: parseFloat(p.stopLoss) || 0,
            positionSize: qty * entryPrice,
            fees: 0,
            status: 'open',
            source: 'bybit',
            externalId: String(p.positionIdx != null ? `${p.symbol}_${p.positionIdx}_${p.updatedTime || p.createdTime}` : `${p.symbol}_${p.updatedTime || p.createdTime}`),
            orderType: 'market',
            entryDate,
            // Carry the live TP from Bybit so the imported trade already has
            // the planned target set (the trade form stores `tps` as plain
            // price numbers).
            tps: tp > 0 ? [tp] : [],
            exits: null,
            tpReached: [],
            result: null,
            journalId: null,
            // Bybit-only extras the journal can show alongside the trade.
            liquidationPrice: liqPrice > 0 ? liqPrice : null,
            session: sessionFromDate(entryDate),
          };
        });
        return new Response(JSON.stringify({ ok: true, positions, count: positions.length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      if (exchange === 'okx') {
        const enc = new TextEncoder();
        const hmacB64 = async (secret, msg) => {
          const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
          return btoa(String.fromCharCode(...new Uint8Array(sig)));
        };
        const tsIso = new Date().toISOString();
        const p = '/api/v5/account/positions?instType=SWAP';
        const sign = await hmacB64(apiSecret, tsIso + 'GET' + p);
        const res = await fetch(`https://www.okx.com${p}`, {
          headers: { 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-TIMESTAMP': tsIso, 'OK-ACCESS-PASSPHRASE': passphrase || '', 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.code !== '0') return new Response(JSON.stringify({ ok: false, error: `OKX ${data.code}: ${data.msg || 'error'}` }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 });
        const positions = (data.data || []).filter((p2) => parseFloat(p2.pos) !== 0).map((p2) => {
          const parts = (p2.instId || '').split('-');
          const pair = parts.length >= 2 ? (parts[0] + parts[1]).toUpperCase() : (p2.instId || '').toUpperCase();
          const entryPrice = parseFloat(p2.avgPx) || 0;
          const qty = Math.abs(parseFloat(p2.pos) || 0);
          const entryDate = p2.cTime ? new Date(parseInt(p2.cTime)).toISOString() : new Date().toISOString();
          const liq = parseFloat(p2.liqPx) || 0;
          const tp = parseFloat(p2.tpTriggerPx || 0) || 0;
          return {
            pair,
            direction: p2.posSide === 'short' || parseFloat(p2.pos) < 0 ? 'short' : 'long',
            entryPrice,
            quantity: qty,
            leverage: parseFloat(p2.lever) || 1,
            stopLoss: parseFloat(p2.slTriggerPx || 0) || 0,
            positionSize: qty * entryPrice,
            fees: 0,
            status: 'open',
            source: 'okx',
            externalId: String(p2.posId || `${pair}_${p2.cTime}`),
            orderType: 'market',
            entryDate,
            tps: tp > 0 ? [tp] : [],
            exits: null,
            tpReached: [],
            result: null,
            journalId: null,
            liquidationPrice: liq > 0 ? liq : null,
            session: sessionFromDate(entryDate),
          };
        });
        return new Response(JSON.stringify({ ok: true, positions, count: positions.length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      if (exchange === 'bitget') {
        const enc = new TextEncoder();
        const hmacB64 = async (secret, msg) => {
          const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
          return btoa(String.fromCharCode(...new Uint8Array(sig)));
        };
        const ts = String(Date.now());
        const p = '/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT';
        const sign = await hmacB64(apiSecret, ts + 'GET' + p);
        const res = await fetch(`https://api.bitget.com${p}`, {
          headers: { 'ACCESS-KEY': apiKey, 'ACCESS-SIGN': sign, 'ACCESS-TIMESTAMP': ts, 'ACCESS-PASSPHRASE': passphrase || '', 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.code !== '00000') return new Response(JSON.stringify({ ok: false, error: `Bitget ${data.code}: ${data.msg || 'error'}` }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 });
        const list = (Array.isArray(data.data) ? data.data : (data.data?.list || [])).filter((p2) => parseFloat(p2.total || p2.openSize || 0) > 0);
        const positions = list.map((p2) => {
          const pair = (p2.symbol || '').replace(/_.*/, '').toUpperCase();
          const entryPrice = parseFloat(p2.openPriceAvg || p2.averageOpenPrice) || 0;
          const qty = parseFloat(p2.total || p2.openSize) || 0;
          const entryDate = p2.cTime ? new Date(parseInt(p2.cTime)).toISOString() : new Date().toISOString();
          const liq = parseFloat(p2.liquidationPrice || 0) || 0;
          const tp = parseFloat(p2.presetStopSurplusPrice || 0) || 0;
          return {
            pair,
            direction: p2.holdSide === 'short' ? 'short' : 'long',
            entryPrice,
            quantity: qty,
            leverage: parseFloat(p2.leverage) || 1,
            stopLoss: parseFloat(p2.presetStopLossPrice || 0) || 0,
            positionSize: qty * entryPrice,
            fees: 0,
            status: 'open',
            source: 'bitget',
            externalId: String(p2.positionId || `${pair}_${p2.cTime}`),
            orderType: 'market',
            entryDate,
            tps: tp > 0 ? [tp] : [],
            exits: null,
            tpReached: [],
            result: null,
            journalId: null,
            liquidationPrice: liq > 0 ? liq : null,
            session: sessionFromDate(entryDate),
          };
        });
        return new Response(JSON.stringify({ ok: true, positions, count: positions.length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ ok: false, error: 'Exchange not supported for open positions sync' }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 500 });
    }
  }

  // Futures wallet balance — read-only across the supported exchanges so the
  // app can show "Bybit: $1,234" on each connected exchange card instead of
  // making the user type a starting balance every time.
  if (request.method === 'POST' && path === '/exchange/balance') {
    try {
      // Auth: any authenticated user may call (uses caller-supplied exchange keys).
      const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
      const uid = await verifyFirebaseToken(token);
      if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const _rl = await bumpWindow(env, `rl:exch:${uid}`, 60);
      if (_rl.count > 30) return new Response(JSON.stringify({ error: 'יותר מדי בקשות לבורסה. נסה שוב בעוד רגע.' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      const _body = await request.json().catch(() => ({}));
      const { exchange } = _body;
      if (!exchange) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing exchange' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const _creds = await resolveExchangeCreds(env, uid, exchange);
      if (!_creds) return new Response(JSON.stringify({ ok: false, error: 'reconnect_required' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
      const { apiKey, apiSecret, passphrase } = _creds;
      const enc = new TextEncoder();
      const hmacHex = async (secret, msg) => {
        const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      };
      const hmacB64 = async (secret, msg) => {
        const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
        return btoa(String.fromCharCode(...new Uint8Array(sig)));
      };

      let balance = 0;

      if (exchange === 'bybit') {
        const ts = Date.now().toString();
        const recvWindow = '5000';
        const qs = 'accountType=UNIFIED';
        const sig = await hmacHex(apiSecret, ts + apiKey + recvWindow + qs);
        const res = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${qs}`, {
          headers: { 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-SIGN': sig, 'X-BAPI-RECV-WINDOW': recvWindow },
        });
        const data = await res.json();
        if (data.retCode !== 0) throw new Error(data.retMsg || `Bybit ${data.retCode}`);
        balance = parseFloat(data.result?.list?.[0]?.totalEquity) || 0;
      }

      else if (exchange === 'mexc') {
        const ts = String(Date.now());
        const sig = await hmacHex(apiSecret, apiKey + ts);
        const res = await fetch('https://contract.mexc.com/api/v1/private/account/assets', {
          headers: { ApiKey: apiKey, 'Request-Time': ts, Signature: sig, 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (!(data.success === true || data.code === 0)) throw new Error(data.message || data.msg || 'MEXC error');
        const rawList = Array.isArray(data.data) ? data.data : (data.data?.list || []);
        // Sum equity across stablecoin assets (USDT/USDC) as USD-equivalent
        for (const a of rawList) {
          const cur = (a.currency || a.coin || '').toUpperCase();
          if (cur === 'USDT' || cur === 'USDC') {
            balance += parseFloat(a.equity || a.available || 0) || 0;
          }
        }
      }

      else if (exchange === 'okx') {
        const ts = new Date().toISOString();
        const p = '/api/v5/account/balance';
        const sign = await hmacB64(apiSecret, ts + 'GET' + p);
        const res = await fetch(`https://www.okx.com${p}`, {
          headers: { 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-TIMESTAMP': ts, 'OK-ACCESS-PASSPHRASE': passphrase || '', 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.code !== '0') throw new Error(`OKX ${data.code}: ${data.msg || 'error'}`);
        balance = parseFloat(data.data?.[0]?.totalEq) || 0;
      }

      else if (exchange === 'bitget') {
        const ts = String(Date.now());
        const p = '/api/v2/mix/account/accounts?productType=USDT-FUTURES';
        const sign = await hmacB64(apiSecret, ts + 'GET' + p);
        const res = await fetch(`https://api.bitget.com${p}`, {
          headers: { 'ACCESS-KEY': apiKey, 'ACCESS-SIGN': sign, 'ACCESS-TIMESTAMP': ts, 'ACCESS-PASSPHRASE': passphrase || '', 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.code !== '00000') throw new Error(`Bitget ${data.code}: ${data.msg || 'error'}`);
        const list = Array.isArray(data.data) ? data.data : [];
        for (const a of list) {
          balance += parseFloat(a.usdtEquity || a.equity || 0) || 0;
        }
      }

      else {
        return new Response(JSON.stringify({ ok: false, error: 'Exchange not supported' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ ok: true, balance, currency: 'USD' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  // On-chain wallet net worth + holdings via Moralis (read-only public data).
  // Auth-gated so it can't be used to burn the Moralis quota anonymously.
  if (request.method === 'POST' && path === '/wallet') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    // Per-user rate limit — /wallet fans out several Moralis calls, so a tight
    // loop could burn the shared MORALIS quota for everyone.
    const _wrl = await bumpWindow(env, `rl:wallet:${uid}`, 60);
    if (_wrl.count > 15) return new Response(JSON.stringify({ ok: false, error: 'יותר מדי בקשות, נסה שוב בעוד רגע.' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!env.MORALIS_API_KEY) return new Response(JSON.stringify({ ok: false, error: 'מעקב ארנקים לא מוגדר בשרת' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    try {
      const { address } = await request.json().catch(() => ({}));
      const a = address || '';
      const isEvm = /^0x[a-fA-F0-9]{40}$/.test(a);
      // Bitcoin: bech32 (bc1…) or legacy/P2SH (1…/3…, ≤35 chars). Checked
      // before Solana since legacy BTC and Solana both use base58 — length
      // disambiguates (Solana keys are 40–44 chars).
      const isBtc = /^bc1[a-z0-9]{25,62}$/.test(a) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a);
      const isSol = !isEvm && !isBtc && /^[1-9A-HJ-NP-Za-km-z]{40,44}$/.test(a);
      if (!isEvm && !isBtc && !isSol) {
        return new Response(JSON.stringify({ ok: false, error: 'כתובת ארנק לא תקינה (EVM / Solana / Bitcoin)' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const mHeaders = { 'X-API-Key': env.MORALIS_API_KEY, accept: 'application/json' };

      // ---- Bitcoin (mempool.space for balance + Binance for price) ----
      if (isBtc) {
        const r = await fetch(`https://mempool.space/api/address/${a}`);
        if (!r.ok) return new Response(JSON.stringify({ ok: false, error: `Bitcoin lookup failed (${r.status})` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
        const d = await r.json().catch(() => ({}));
        const cs = d.chain_stats || {}; const ms = d.mempool_stats || {};
        const sats = (cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0) + (ms.funded_txo_sum || 0) - (ms.spent_txo_sum || 0);
        const btc = sats / 1e8;
        let price = 0;
        try { const pr = await fetch(`${BINANCE_SPOT}/ticker/price?symbol=BTCUSDT`); price = parseFloat((await pr.json()).price) || 0; } catch { /* price optional */ }
        const usd = btc * price;
        const tokens = btc > 0 ? [{ symbol: 'BTC', name: 'Bitcoin', usd, amount: btc, chain: 'bitcoin', logo: null }] : [];
        return new Response(JSON.stringify({ ok: true, totalUsd: usd, chains: usd > 0 ? [{ chain: 'bitcoin', usd }] : [], tokens }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // ---- Solana ----
      if (isSol) {
        const sol = 'https://solana-gateway.moralis.io';
        const pRes = await fetch(`${sol}/account/mainnet/${encodeURIComponent(a)}/portfolio`, { headers: mHeaders });
        const pData = await pRes.json().catch(() => ({}));
        if (!pRes.ok) return new Response(JSON.stringify({ ok: false, error: pData.message || `Moralis ${pRes.status}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

        const price = async (mint) => {
          try {
            const r = await fetch(`${sol}/token/mainnet/${mint}/price`, { headers: mHeaders });
            if (!r.ok) return 0;
            const d = await r.json();
            return parseFloat(d.usdPrice) || 0;
          } catch { return 0; }
        };

        let totalUsd = 0;
        let tokens = [];

        // Native SOL.
        const nativeSol = parseFloat(pData.nativeBalance?.solana ?? pData.nativeBalance?.lamports / 1e9) || 0;
        if (nativeSol > 0) {
          const sp = await price('So11111111111111111111111111111111111111112'); // wrapped SOL
          const usd = nativeSol * sp;
          if (usd > 0) { totalUsd += usd; tokens.push({ symbol: 'SOL', name: 'Solana', usd, amount: nativeSol, chain: 'solana', logo: null }); }
        }

        // SPL tokens — price the top handful (bounded to protect the quota).
        for (const tok of (pData.tokens || []).slice(0, 15)) {
          const amount = parseFloat(tok.amount ?? tok.amountFormatted) || 0;
          if (amount <= 0 || !tok.mint) continue;
          const pr = await price(tok.mint);
          const usd = amount * pr;
          if (usd < 1) continue;
          totalUsd += usd;
          tokens.push({ symbol: tok.symbol || '?', name: tok.name || '', usd, amount, chain: 'solana', logo: tok.logo || null });
        }

        tokens.sort((a, b) => b.usd - a.usd);
        return new Response(JSON.stringify({ ok: true, totalUsd, chains: [{ chain: 'solana', usd: totalUsd }], tokens }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // ---- EVM ----
      const base = 'https://deep-index.moralis.io/api/v2.2';

      // 1) Net worth (total + per-chain).
      const nwRes = await fetch(`${base}/wallets/${address}/net-worth?exclude_spam=true&exclude_unverified_contracts=true`, { headers: mHeaders });
      const nw = await nwRes.json().catch(() => ({}));
      if (!nwRes.ok) return new Response(JSON.stringify({ ok: false, error: nw.message || `Moralis ${nwRes.status}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      const totalUsd = parseFloat(nw.total_networth_usd) || 0;
      const chains = (nw.chains || [])
        .map((c) => ({ chain: c.chain, usd: parseFloat(c.networth_usd) || 0 }))
        .filter((c) => c.usd > 0)
        .sort((a, b) => b.usd - a.usd);

      // 2) Token holdings for the top chains that actually hold value (bounded).
      let tokens = [];
      for (const c of chains.slice(0, 4)) {
        try {
          const tRes = await fetch(`${base}/wallets/${address}/tokens?chain=${c.chain}&exclude_spam=true`, { headers: mHeaders });
          const t = await tRes.json().catch(() => ({}));
          if (tRes.ok && Array.isArray(t.result)) {
            for (const tok of t.result) {
              const usd = parseFloat(tok.usd_value) || 0;
              if (usd < 1) continue; // ignore dust
              tokens.push({
                symbol: tok.symbol || '?',
                name: tok.name || '',
                usd,
                amount: parseFloat(tok.balance_formatted) || 0,
                chain: c.chain,
                logo: tok.logo || null,
              });
            }
          }
        } catch { /* one chain failing shouldn't drop the whole wallet */ }
      }
      tokens.sort((a, b) => b.usd - a.usd);
      tokens = tokens.slice(0, 30);

      return new Response(JSON.stringify({ ok: true, totalUsd, chains, tokens }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  // Exchange trade sync — signs HMAC on behalf of the frontend so secrets stay server-side
  if (request.method === 'POST' && path === '/exchange/sync') {
    try {
      // Auth: any authenticated user may call (uses caller-supplied exchange keys).
      const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
      const uid = await verifyFirebaseToken(token);
      if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const _rl = await bumpWindow(env, `rl:exch:${uid}`, 60);
      if (_rl.count > 30) return new Response(JSON.stringify({ error: 'יותר מדי בקשות לבורסה. נסה שוב בעוד רגע.' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      const _body = await request.json().catch(() => ({}));
      const { exchange, limit = 50, days = 0, debug = false } = _body;
      if (!exchange) {
        return new Response(JSON.stringify({ error: 'Missing exchange' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // Credentials come from the encrypted server-side store (keyed by uid),
      // never from the request body. A legacy client still sending them is
      // transparently migrated by resolveExchangeCreds.
      const _creds = await resolveExchangeCreds(env, uid, exchange);
      if (!_creds) return new Response(JSON.stringify({ error: 'reconnect_required', message: 'התחבר מחדש לבורסה' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
      const { apiKey, apiSecret, passphrase } = _creds;
      // When debug is set we echo back the raw upstream rows (first few) so we
      // can see exactly which fields an exchange returns (e.g. hunting for SL/TP).
      let debugRaw = null;

      // Optional time-window import. days=0 → keep the legacy "recent N" behavior.
      // Otherwise paginate per-exchange back to `sinceMs`, bounded so a single
      // request can't run away (Worker CPU + exchange rate limits).
      const DAY_MS = 24 * 60 * 60 * 1000;
      const sinceMs = days > 0 ? Date.now() - days * DAY_MS : 0;
      const MAX_TRADES = 1500;   // hard cap on returned rows
      const MAX_REQUESTS = 30;   // hard cap on upstream calls per sync

      const enc = new TextEncoder();
      const hmac = async (secret, msg) => {
        const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      };

      let trades = [];

      if (exchange === 'mexc') {
        // Normalize MEXC timestamp: handles both seconds and milliseconds
        const toMs = ts => {
          if (!ts) return 0;
          const n = parseInt(ts);
          return n > 1e12 ? n : n * 1000;
        };

        const mexcHeaders = ts => ({
          'ApiKey': apiKey, 'Request-Time': ts,
          'Content-Type': 'application/json',
        });
        const mexcSign = async (ts, paramStr) => ({
          'Signature': await hmac(apiSecret, apiKey + ts + paramStr),
        });
        const buildParams = (obj) =>
          Object.keys(obj).sort().map(k => `${k}=${obj[k]}`).join('&');

        // MEXC retains ~90 days of position history. Use the requested window
        // (capped at 90d), else the legacy 89-day default.
        const mexcFloor = Date.now() - 89 * DAY_MS;
        const startTime = String(days > 0 ? Math.max(sinceMs, mexcFloor) : mexcFloor);

        // ── Step 1: Fetch position history (paginated when a window is set) ──
        let positions = [];
        if (days > 0) {
          for (let page = 1; page <= MAX_REQUESTS && positions.length < MAX_TRADES; page++) {
            const tsP = Date.now().toString();
            const ps = buildParams({ page_num: String(page), page_size: '100', start_time: startTime });
            const r = await fetch(
              `https://contract.mexc.com/api/v1/private/position/list/history_positions?${ps}`,
              { headers: { ...mexcHeaders(tsP), ...(await mexcSign(tsP, ps)) } }
            );
            const d = await r.json();
            if (d.code !== 0) throw new Error(`MEXC ${d.code}: ${d.message || 'error'}`);
            const raw = d.data;
            const chunk = Array.isArray(raw) ? raw : (raw?.resultList || raw?.list || []);
            if (!chunk.length) break;
            positions = positions.concat(chunk);
            if (chunk.length < 100) break; // last page
          }
        } else {
          const ts1 = Date.now().toString();
          const posParamStr = buildParams({ page_num: '1', page_size: String(Math.min(limit, 100)), start_time: startTime });
          const posRes = await fetch(
            `https://contract.mexc.com/api/v1/private/position/list/history_positions?${posParamStr}`,
            { headers: { ...mexcHeaders(ts1), ...(await mexcSign(ts1, posParamStr)) } }
          );
          const posData = await posRes.json();
          if (posData.code !== 0) throw new Error(`MEXC ${posData.code}: ${posData.message || 'error'}`);
          const rawPos = posData.data;
          positions = Array.isArray(rawPos) ? rawPos : (rawPos?.resultList || rawPos?.list || []);
        }

        if (debug) debugRaw = positions.slice(0, 3);

        // ── Step 2: Fetch order history to (a) recover accurate exit times
        // from close orders (sides 2/4) and (b) recover the configured SL/TP
        // for each position from its opening order (sides 1/3). MEXC's
        // position-history endpoint doesn't expose SL/TP.
        // pool[symbol][side] = sorted array of { fillTime, used, sl, tp }
        const pool = {};
        try {
          const ts2 = Date.now().toString();
          const ordParamStr = buildParams({ page_num: '1', page_size: '200', start_time: startTime, states: '2' });
          const ordRes = await fetch(
            `https://contract.mexc.com/api/v1/private/order/list/history_orders?${ordParamStr}`,
            { headers: { ...mexcHeaders(ts2), ...(await mexcSign(ts2, ordParamStr)) } }
          );
          const ordData = await ordRes.json();
          if (ordData.code === 0) {
            const orders = ordData.data?.resultList || ordData.data?.list || (Array.isArray(ordData.data) ? ordData.data : []);
            for (const o of orders) {
              const side = parseInt(o.side);
              if (side !== 1 && side !== 2 && side !== 3 && side !== 4) continue;
              const sym = o.symbol;
              const fillTime = toMs(o.updateTime || o.update_time || o.createTime || o.create_time);
              if (!fillTime) continue;
              if (!pool[sym]) pool[sym] = {};
              if (!pool[sym][side]) pool[sym][side] = [];
              // SL/TP only exist on opening orders. Names vary in MEXC's
              // contract endpoints — try the common shapes.
              const sl = side === 1 || side === 3
                ? parseFloat(o.stopLossPrice || o.stop_loss_price || o.slPrice || o.sl_price || 0) || 0
                : 0;
              const tp = side === 1 || side === 3
                ? parseFloat(o.takeProfitPrice || o.take_profit_price || o.tpPrice || o.tp_price || 0) || 0
                : 0;
              pool[sym][side].push({ fillTime, used: false, sl, tp });
            }
            for (const sym of Object.keys(pool))
              for (const side of Object.keys(pool[sym]))
                pool[sym][side].sort((a, b) => a.fillTime - b.fillTime);
          }
        } catch (_) { /* order history optional — fall back to entryDate */ }

        // ── Step 3: Match positions → opening + closing orders ───────────
        // Each position is paired with the earliest close order after its open
        // (for exitDate) and the latest open order at-or-before its open (for
        // SL/TP). Process oldest-first so each order is consumed once.
        const exitTimeById = new Map();
        const slTpById = new Map();
        const sorted = [...positions].sort((a, b) =>
          toMs(a.createTime || a.openTime || 0) - toMs(b.createTime || b.openTime || 0)
        );
        for (const p of sorted) {
          const posType = p.positionType ?? p.position_type;
          const openSide = posType === 1 ? 1 : 3;
          const closeSide = posType === 1 ? 4 : 2;
          const sym = p.symbol;
          const openMs = toMs(p.createTime || p.openTime || p.create_time || p.openTimestamp);
          const posId = String(p.id || sym + '_' + openMs);

          // Closing order → exit time.
          const closes = pool[sym]?.[closeSide];
          if (closes) {
            const idx = closes.findIndex(o => !o.used && o.fillTime > openMs);
            if (idx >= 0) {
              closes[idx].used = true;
              exitTimeById.set(posId, closes[idx].fillTime);
            }
          }

          // Opening order → SL/TP. Allow ±2 min tolerance around the
          // position's createTime to absorb minor clock skew.
          const opens = pool[sym]?.[openSide];
          if (opens) {
            const TOL = 2 * 60 * 1000;
            let bestIdx = -1;
            let bestDelta = Infinity;
            for (let i = 0; i < opens.length; i++) {
              const o = opens[i];
              if (o.used) continue;
              const d = Math.abs(o.fillTime - openMs);
              if (d <= TOL && d < bestDelta) { bestDelta = d; bestIdx = i; }
            }
            if (bestIdx >= 0) {
              opens[bestIdx].used = true;
              slTpById.set(posId, { sl: opens[bestIdx].sl, tp: opens[bestIdx].tp });
            }
          }
        }

        // ── Step 4: Build trade objects ───────────────────────────────────
        const csMap = await mexcContractSizes();
        trades = positions.map(p => {
          const openMs = toMs(p.createTime || p.openTime || p.create_time || p.openTimestamp);
          const entryDate = openMs > 0 ? new Date(openMs).toISOString() : new Date().toISOString();
          const sym = p.symbol || '';
          const posId = String(p.id || sym + '_' + openMs);
          const closeMs = exitTimeById.get(posId) || 0;
          const rawUpdateMs = toMs(p.updateTime || p.update_time || p.closeTime || p.close_time || 0);
          const exitDate = closeMs > openMs
            ? new Date(closeMs).toISOString()
            : rawUpdateMs > openMs
              ? new Date(rawUpdateMs).toISOString()
              : entryDate;
          const posType = p.positionType ?? p.position_type;
          const fees = Math.abs(parseFloat(p.fee || p.fees || p.closeFee || p.close_fee || p.holdFee || p.totalFee || 0) || 0);
          // Prefer SL/TP captured from the opening order; fall back to any
          // values that happened to live on the position object itself.
          const slTp = slTpById.get(posId) || {};
          const slMexc = (slTp.sl > 0 ? slTp.sl : parseFloat(p.stopLossPrice || p.stop_loss_price || 0)) || 0;
          const tpMexc = (slTp.tp > 0 ? slTp.tp : parseFloat(p.takeProfitPrice || p.take_profit_price || 0)) || 0;
          return {
            pair: sym.replace(/_/g, ''),
            direction: posType === 1 ? 'long' : 'short',
            entryPrice: parseFloat(p.openAvgPrice || p.open_avg_price) || 0,
            exitPrice: parseFloat(p.closeAvgPrice || p.close_avg_price) || 0,
            // MEXC vol is in CONTRACTS — convert to coin units via contractSize.
            quantity: (parseFloat(p.closeVol || p.close_vol || p.holdVol || p.hold_vol) || 0) * (csMap[sym.replace(/_/g, '')] || 1),
            leverage: parseFloat(p.leverage) || 1,
            pnlFromExchange: parseFloat(p.realised || p.realisedPnl || p.realise || p.realised_pnl) || 0,
            fees,
            entryDate,
            exitDate,
            stopLoss: slMexc,
            tps: tpMexc > 0 ? [tpMexc] : [],
            source: 'mexc',
            externalId: posId,
            session: sessionFromDate(entryDate),
          };
        });
      }

      else if (exchange === 'bybit') {
        const recvWindow = '5000';
        const bybitClosed = async (qs) => {
          const tsW = Date.now().toString();
          const sigW = await hmac(apiSecret, tsW + apiKey + recvWindow + qs);
          const r = await fetch(`https://api.bybit.com/v5/position/closed-pnl?${qs}`, {
            headers: { 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': tsW, 'X-BAPI-SIGN': sigW, 'X-BAPI-RECV-WINDOW': recvWindow },
          });
          const d = await r.json();
          if (d.retCode !== 0) throw new Error(d.retMsg || `Bybit error ${d.retCode}`);
          return d.result || {};
        };

        let list = [];
        if (days > 0) {
          // closed-pnl allows a max 7-day window per request → walk windows back
          // to sinceMs, paging within each window via nextPageCursor.
          const WIN = 7 * DAY_MS;
          let reqs = 0;
          for (let winEnd = Date.now(); winEnd > sinceMs && reqs < MAX_REQUESTS && list.length < MAX_TRADES;) {
            const winStart = Math.max(sinceMs, winEnd - WIN);
            let cursor = '';
            do {
              const qs = `category=linear&limit=100&startTime=${winStart}&endTime=${winEnd}${cursor ? `&cursor=${cursor}` : ''}`;
              const result = await bybitClosed(qs);
              reqs++;
              list = list.concat(result.list || []);
              cursor = result.nextPageCursor || '';
            } while (cursor && reqs < MAX_REQUESTS && list.length < MAX_TRADES);
            winEnd = winStart;
          }
        } else {
          const result = await bybitClosed(`category=linear&limit=${Math.min(limit, 200)}`);
          list = result.list || [];
        }

        // Pull the recent order history once so we can recover the SL/TP that
        // each closed position had configured — closed-pnl itself doesn't
        // expose them, so we match the opening order by symbol+side+time.
        const ohTs = Date.now().toString();
        const ohQs = 'category=linear&limit=100';
        const ohSig = await hmac(apiSecret, ohTs + apiKey + recvWindow + ohQs);
        const ohRes = await fetch(`https://api.bybit.com/v5/order/history?${ohQs}`, {
          headers: { 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': ohTs, 'X-BAPI-SIGN': ohSig, 'X-BAPI-RECV-WINDOW': recvWindow },
        });
        const ohData = await ohRes.json().catch(() => ({}));
        const rawOrders = ohData.retCode === 0 ? (ohData.result?.list || []) : [];
        const openingOrders = rawOrders.filter((o) =>
          o.orderStatus === 'Filled' && o.reduceOnly !== true && parseFloat(o.qty) > 0
        );
        if (debug) debugRaw = { closedPnl: list.slice(0, 5), orderHistory: rawOrders.slice(0, 15) };

        trades = list.map(p => {
          const exitDate = p.updatedTime ? new Date(parseInt(p.updatedTime)).toISOString() : new Date().toISOString();
          // Real trading fees: closed-pnl carries openFee + closeFee per
          // record (the old execFee/cumExecFee fields don't exist on this
          // endpoint, which is why fees always imported as 0).
          // toPrecision(10) trims the float-sum noise (openFee+closeFee could
          // land on e.g. 5.07900000003, which then showed as a 12-digit number
          // in the edit form).
          const feesRaw = Math.abs(parseFloat(p.openFee) || 0) + Math.abs(parseFloat(p.closeFee) || 0)
            || Math.abs(parseFloat(p.execFee || p.tradingFee || p.cumExecFee || 0) || 0);
          const fees = feesRaw ? +feesRaw.toPrecision(10) : 0;
          // Bybit's closed-pnl `side` is the side of the CLOSING order — a
          // long position is closed by a Sell, so the POSITION side is the
          // opposite (verified against a real account: a long imported as
          // short before this flip).
          const posSide = p.side === 'Sell' ? 'Buy' : 'Sell';
          const entryPrice = parseFloat(p.avgEntryPrice || p.entryPrice) || 0;
          const quantity = parseFloat(p.qty) || 0;
          const direction = posSide === 'Buy' ? 'long' : 'short';
          const exitPrice = parseFloat(p.avgExitPrice || p.exitPrice) || 0;
          // Match the opening order to recover its configured SL/TP, order
          // type, and the exact entry time. A LIMIT entry is PLACED long
          // before it FILLS, so comparing only createdTime missed it — prefer
          // a fill-price match (order avgPrice ≈ position avg entry), then
          // fall back to the nearest order in time (fill or placement) within
          // 30 minutes.
          const positionStart = parseInt(p.createdTime) || 0;
          const exitMs = parseInt(p.updatedTime) || positionStart;
          const timeDist = (o) => Math.min(
            Math.abs((parseInt(o.updatedTime) || Infinity) - positionStart),
            Math.abs((parseInt(o.createdTime) || Infinity) - positionStart)
          );
          // Only orders that FILLED before the position closed can be its
          // opener — without this bound, an order from days later within 0.2%
          // of the entry price could attach to an old position whose real
          // opener already fell off the 100-order history, producing an
          // entryDate AFTER exitDate (negative duration, edit form blocked).
          const cands = openingOrders
            .filter((o) => o.symbol === p.symbol && o.side === posSide &&
              (parseInt(o.updatedTime) || parseInt(o.createdTime) || 0) <= exitMs + 60 * 1000)
            .sort((a, b) => timeDist(a) - timeDist(b));
          const priceMatch = cands.find((o) => {
            const ap = parseFloat(o.avgPrice) || 0;
            return ap > 0 && entryPrice > 0 && Math.abs(ap - entryPrice) <= entryPrice * 0.002;
          });
          const match = priceMatch || (cands[0] && timeDist(cands[0]) < 30 * 60 * 1000 ? cands[0] : null);
          let stopLoss = match ? (parseFloat(match.stopLoss) || 0) : 0;
          if (!stopLoss) {
            // SL set from Bybit's position panel (not attached to the entry
            // order) lives on its own conditional StopLoss order — take its
            // trigger price when it was created during the position's window.
            // Only orders on the CLOSING side (p.side) belong to this
            // position, and the EARLIEST one is the original stop — rawOrders
            // is newest-first, so grabbing the first match took a stop that
            // was later MOVED (e.g. to break-even), reporting riskAmount ≈ 0
            // and an absurd R (a 2% winner showed ~20R).
            const slOrds = rawOrders.filter((o) =>
              o.symbol === p.symbol &&
              o.side === p.side &&
              /stoploss/i.test(o.stopOrderType || '') &&
              parseFloat(o.triggerPrice) > 0 &&
              (parseInt(o.createdTime) || 0) >= positionStart - 10 * 60 * 1000 &&
              (parseInt(o.createdTime) || 0) <= exitMs + 10 * 60 * 1000
            );
            const slOrd = slOrds.length
              ? slOrds.reduce((a, b) => ((parseInt(b.createdTime) || 0) < (parseInt(a.createdTime) || 0) ? b : a))
              : null;
            if (slOrd) stopLoss = parseFloat(slOrd.triggerPrice) || 0;
          }
          const tp = match ? (parseFloat(match.takeProfit) || 0) : 0;
          // Clamp to the close time — entry can never come after exit.
          const entryMs = Math.min(exitMs, match
            ? (parseInt(match.updatedTime) || parseInt(match.createdTime) || positionStart)
            : positionStart);
          const entryDate = entryMs ? new Date(entryMs).toISOString() : exitDate;
          // Auto-derived risk ($) and realized R — only when a real SL exists.
          const slDist = stopLoss > 0 ? Math.abs(entryPrice - stopLoss) : 0;
          const riskAmount = slDist > 0 ? Number((slDist * quantity).toPrecision(6)) : 0;
          // UNSIGNED |reward|/risk — the whole app stores R unsigned and adds
          // the sign from pnl at display/export time (formatRR, calculateRR),
          // so a signed value here rendered "--0.60R" and flipped the CSV sign.
          const rrRatio = slDist > 0 && exitPrice > 0
            ? Number((Math.abs(exitPrice - entryPrice) / slDist).toFixed(2))
            : 0;
          return {
            pair: p.symbol,
            direction,
            orderType: match?.orderType === 'Limit' ? 'limit' : 'market',
            entryPrice,
            exitPrice,
            quantity,
            leverage: parseFloat(p.leverage) || 1,
            // Bybit's `closedPnl` is ALREADY NET of fees (openFee + closeFee).
            // The whole app treats pnlFromExchange as GROSS and derives
            // netPnl = pnl - fees, so passing the net value here subtracted the
            // fees a SECOND time — a real $10.02 net win imported as ~$6.45.
            // Add the fees back to get the true gross, and the downstream
            // `- fees` lands on exactly the net that Bybit displays.
            pnlFromExchange: (parseFloat(p.closedPnl) || 0) + fees,
            fees,
            entryDate,
            exitDate,
            stopLoss,
            riskAmount,
            rrRatio,
            tps: tp > 0 ? [tp] : [],
            source: 'bybit',
            externalId: p.orderId || String(p.createdTime || Math.random()),
            session: sessionFromDate(entryDate),
            // Temporary (stripped after merging): the matched opening order,
            // used as a stable position identity for the multi-TP grouping.
            _openOrderId: match?.orderId || '',
          };
        });

        // Bybit's closed-pnl returns ONE ROW PER CLOSING ORDER, so a position
        // that closed across several TPs arrives as several rows and used to
        // import as several separate journal trades. Rows of the same position
        // share pair+direction+avgEntryPrice — merge those (when their close
        // times are within a week of each other) into a single trade whose
        // exits[] carries the TP1/TP2/… breakdown, like a manually-entered
        // multi-TP trade.
        const posGroups = new Map();
        for (const t of trades) {
          // Group by the matched OPENING order when we have one — grouping by
          // entry price alone merged two DIFFERENT positions that happened to
          // fill at the same limit price within the window into one trade
          // with a combined qty and a fabricated TP1/TP2 breakdown.
          const key = t._openOrderId
            ? `${t.pair}|${t.direction}|#${t._openOrderId}`
            : `${t.pair}|${t.direction}|${t.entryPrice}`;
          if (!posGroups.has(key)) posGroups.set(key, []);
          posGroups.get(key).push(t);
        }
        const MERGE_WINDOW_MS = 7 * DAY_MS;
        const mergedTrades = [];
        for (const rows of posGroups.values()) {
          rows.sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
          let cluster = [];
          const flush = () => {
            if (!cluster.length) return;
            if (cluster.length === 1) { mergedTrades.push({ ...cluster[0], externalIds: [cluster[0].externalId] }); cluster = []; return; }
            const totalQty = cluster.reduce((s, r) => s + r.quantity, 0);
            const exits = cluster.map((r) => ({
              price: r.exitPrice,
              percent: totalQty > 0 ? Math.round((r.quantity / totalQty) * 10000) / 100 : 0,
            }));
            // Pin the last slice so the percents sum to EXACTLY 100 — rounded
            // thirds (33.33×3 = 99.99) demoted the trade from 'closed' to
            // 'partial' on its next edit-save (vanishing from analytics), and
            // 100.01 blocked saving altogether.
            const sumButLast = exits.slice(0, -1).reduce((s, e) => s + e.percent, 0);
            exits[exits.length - 1].percent = Number(Math.max(0, 100 - sumButLast).toFixed(2));
            const rawWeighted = totalQty > 0
              ? cluster.reduce((s, r) => s + r.exitPrice * r.quantity, 0) / totalQty
              : cluster[cluster.length - 1].exitPrice;
            // Trim float noise (0.16276246773993532 → 0.16276247) so the UI
            // shows a sane weighted price.
            const exitPrice = rawWeighted > 0 ? Number(rawWeighted.toPrecision(8)) : rawWeighted;
            const mergedSl = cluster.find((r) => r.stopLoss > 0)?.stopLoss || 0;
            const first = cluster[0];
            // Recompute risk/R for the FULL position (per-record values cover
            // only that record's qty slice).
            const mSlDist = mergedSl > 0 ? Math.abs(first.entryPrice - mergedSl) : 0;
            const mRisk = mSlDist > 0 ? Number((mSlDist * totalQty).toPrecision(6)) : 0;
            // Unsigned, like the per-row rrRatio above.
            const mRR = mSlDist > 0 && exitPrice > 0
              ? Number((Math.abs(exitPrice - first.entryPrice) / mSlDist).toFixed(2))
              : 0;
            mergedTrades.push({
              ...first,
              quantity: totalQty,
              exitPrice,
              exits,
              pnlFromExchange: cluster.reduce((s, r) => s + r.pnlFromExchange, 0),
              fees: +(cluster.reduce((s, r) => s + r.fees, 0)).toPrecision(10),
              entryDate: cluster.reduce((m, r) => (new Date(r.entryDate) < new Date(m) ? r.entryDate : m), first.entryDate),
              exitDate: cluster[cluster.length - 1].exitDate,
              stopLoss: mergedSl,
              riskAmount: mRisk,
              rrRatio: mRR,
              // EVERY closing order's id — the client upserts on any-id
              // overlap, so a position that keeps closing across syncs updates
              // the same journal trade instead of being filtered out as
              // "already imported" (which silently dropped every close after
              // the first and froze the trade as a win).
              externalIds: cluster.map((r) => r.externalId),
            });
            cluster = [];
          };
          for (const r of rows) {
            if (cluster.length && new Date(r.exitDate) - new Date(cluster[cluster.length - 1].exitDate) > MERGE_WINDOW_MS) flush();
            cluster.push(r);
          }
          flush();
        }
        for (const t of mergedTrades) delete t._openOrderId;
        mergedTrades.sort((a, b) => new Date(b.exitDate) - new Date(a.exitDate));
        trades = mergedTrades;
      }

      else if (exchange === 'okx') {
        const hmacBase64 = async (secret, msg) => {
          const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
          return btoa(String.fromCharCode(...new Uint8Array(sig)));
        };
        const okxFetch = async (extra) => {
          const ts = new Date().toISOString();
          const path = `/api/v5/account/positions-history?instType=SWAP&limit=100${extra}`;
          const sign = await hmacBase64(apiSecret, ts + 'GET' + path);
          const r = await fetch(`https://www.okx.com${path}`, {
            headers: { 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-TIMESTAMP': ts, 'OK-ACCESS-PASSPHRASE': passphrase || '', 'Content-Type': 'application/json' },
          });
          const d = await r.json();
          if (d.code !== '0') throw new Error(`OKX ${d.code}: ${d.msg || 'error'}`);
          return d.data || [];
        };

        let okxRows = [];
        if (days > 0) {
          let after = '';
          for (let reqs = 0; reqs < MAX_REQUESTS && okxRows.length < MAX_TRADES; reqs++) {
            const chunk = await okxFetch(after ? `&after=${after}` : '');
            if (!chunk.length) break;
            okxRows = okxRows.concat(chunk);
            const oldest = chunk[chunk.length - 1];
            after = oldest.posId || '';
            if (parseInt(oldest.cTime || 0) < sinceMs || chunk.length < 100 || !after) break;
          }
          okxRows = okxRows.filter((p) => parseInt(p.cTime || 0) >= sinceMs);
        } else {
          okxRows = await okxFetch('');
        }
        trades = okxRows.map(p => {
          const parts = (p.instId || '').split('-');
          const pair = parts.length >= 2 ? (parts[0] + parts[1]).toUpperCase() : (p.instId || '').toUpperCase();
          const entryDate = p.cTime ? new Date(parseInt(p.cTime)).toISOString() : new Date().toISOString();
          const slOkx = parseFloat(p.slTriggerPx || p.slOrdPx || 0) || 0;
          const tpOkx = parseFloat(p.tpTriggerPx || p.tpOrdPx || 0) || 0;
          return {
            pair,
            direction: p.direction === 'long' ? 'long' : 'short',
            entryPrice: parseFloat(p.openAvgPx) || 0,
            exitPrice: parseFloat(p.closeAvgPx) || 0,
            quantity: parseFloat(p.closeTotalPos || p.openMaxPos) || 0,
            leverage: parseFloat(p.lever) || 1,
            pnlFromExchange: parseFloat(p.pnl) || 0,
            fees: Math.abs(parseFloat(p.fee) || 0),
            entryDate,
            exitDate: p.uTime ? new Date(parseInt(p.uTime)).toISOString() : new Date().toISOString(),
            stopLoss: slOkx,
            tps: tpOkx > 0 ? [tpOkx] : [],
            source: 'okx',
            externalId: p.posId || (pair + '_' + p.cTime),
            session: sessionFromDate(entryDate),
          };
        });
      }

      else if (exchange === 'bitget') {
        const hmacBase64 = async (secret, msg) => {
          const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
          return btoa(String.fromCharCode(...new Uint8Array(sig)));
        };
        const bitgetFetch = async (extra) => {
          const ts = String(Date.now());
          const path = `/api/v2/mix/position/history-position?productType=USDT-FUTURES&limit=100${extra}`;
          const sign = await hmacBase64(apiSecret, ts + 'GET' + path);
          const r = await fetch(`https://api.bitget.com${path}`, {
            headers: { 'ACCESS-KEY': apiKey, 'ACCESS-SIGN': sign, 'ACCESS-TIMESTAMP': ts, 'ACCESS-PASSPHRASE': passphrase || '', 'Content-Type': 'application/json' },
          });
          const d = await r.json();
          if (d.code !== '00000') throw new Error(`Bitget ${d.code}: ${d.msg || 'error'}`);
          return d.data?.list || (Array.isArray(d.data) ? d.data : []);
        };

        let bgRows = [];
        if (days > 0) {
          const startExtra = `&startTime=${sinceMs}&endTime=${Date.now()}`;
          let idLessThan = '';
          for (let reqs = 0; reqs < MAX_REQUESTS && bgRows.length < MAX_TRADES; reqs++) {
            const chunk = await bitgetFetch(startExtra + (idLessThan ? `&idLessThan=${idLessThan}` : ''));
            if (!chunk.length) break;
            bgRows = bgRows.concat(chunk);
            const oldest = chunk[chunk.length - 1];
            idLessThan = oldest.positionId || '';
            if (chunk.length < 100 || !idLessThan) break;
          }
        } else {
          bgRows = await bitgetFetch('');
        }
        trades = bgRows.map(p => {
          const pair = (p.symbol || '').replace(/_.*/, '').toUpperCase();
          const entryDate = p.ctime ? new Date(parseInt(p.ctime)).toISOString() : new Date().toISOString();
          const slBg = parseFloat(p.presetStopLossPrice || p.stopLossPrice || 0) || 0;
          const tpBg = parseFloat(p.presetStopSurplusPrice || p.takeProfitPrice || 0) || 0;
          return {
            pair,
            direction: p.holdSide === 'long' ? 'long' : 'short',
            entryPrice: parseFloat(p.openPriceAvg || p.openAvgPx) || 0,
            exitPrice: parseFloat(p.closePriceAvg || p.closeAvgPx) || 0,
            quantity: parseFloat(p.openSize || p.closeTotalPos) || 0,
            leverage: parseFloat(p.leverage) || 1,
            pnlFromExchange: parseFloat(p.pnl) || 0,
            fees: Math.abs(parseFloat(p.fee || p.totalFee) || 0),
            entryDate,
            exitDate: p.utime ? new Date(parseInt(p.utime)).toISOString() : new Date().toISOString(),
            stopLoss: slBg,
            tps: tpBg > 0 ? [tpBg] : [],
            source: 'bitget',
            externalId: p.positionId || (pair + '_' + p.ctime),
            session: sessionFromDate(entryDate),
          };
        });
      }

      else {
        throw new Error(`Unsupported exchange: ${exchange}`);
      }

      // When a time window was requested, drop anything older than the cutoff
      // and cap the total so the payload stays sane.
      if (days > 0) {
        trades = trades
          .filter((t) => !t.entryDate || new Date(t.entryDate).getTime() >= sinceMs)
          .slice(0, MAX_TRADES);
      }

      return new Response(JSON.stringify({ ok: true, trades, ...(debug ? { _raw: debugRaw } : {}) }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  return new Response('TradeOS Worker', { headers: cors });
}

export default {
  fetch: handleRequest,
  scheduled: (event, env) => handleCron(env),
};
