/**
 * TradeOS Telegram Bot Worker
 * - Webhook handler for interactive Telegram bot
 * - Cron: price alerts, journal reminders, daily summaries, economic calendar
 * - Market data: prices, funding rates, open interest, long/short ratio
 * - Personal watchlist per user
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';
// Binance's public market-data mirror — api.binance.com returns 403 to
// Cloudflare Worker egress IPs in many regions, but data-api.binance.vision
// (same /api/v3 spot surface) isn't geo-blocked. Futures (fapi) has no mirror.
const BINANCE_SPOT = 'https://data-api.binance.vision/api/v3';
const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';
const APP_URL = 'https://tradeos-91a58.web.app';
const CALENDAR_API = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// All available pairs (ordered by market cap)
const ALL_PAIRS = {
  BTCUSDT: '₿', ETHUSDT: 'Ξ', BNBUSDT: '🔶', SOLUSDT: '◎',
  XRPUSDT: '✕', ADAUSDT: '💎', DOGEUSDT: '🐕', AVAXUSDT: '🔺',
  DOTUSDT: '⬡', LINKUSDT: '🔗', MATICUSDT: '🟣', SUIUSDT: '💧',
  NEARUSDT: '🌐', APTUSDT: '🟡', ARBUSDT: '🔵', OPUSDT: '🔴',
  ATOMUSDT: '⚛️', FTMUSDT: '👻', PEPEUSDT: '🐸', TRUMPUSDT: '🇺🇸',
};

const DEFAULT_WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];

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
function fmtBigNum(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ==================== Telegram Helpers ====================

async function tg(botToken, method, body) {
  const res = await fetch(`${TELEGRAM_API}${botToken}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json();
}
async function sendMessage(botToken, chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  return tg(botToken, 'sendMessage', body);
}
async function editMessage(botToken, chatId, messageId, text, keyboard = null) {
  const body = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  return tg(botToken, 'editMessageText', body);
}
async function answerCallback(botToken, callbackQueryId, text = '') {
  return tg(botToken, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}
async function sendPhoto(botToken, chatId, photoUrl, caption = '', keyboard = null) {
  const body = { chat_id: chatId, photo: photoUrl, parse_mode: 'HTML' };
  if (caption) body.caption = caption;
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  return tg(botToken, 'sendPhoto', body);
}

async function createChart(config, width = 600, height = 400) {
  try {
    const res = await fetch('https://quickchart.io/chart/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backgroundColor: 'white', width, height, chart: config }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.url : null;
  } catch { return null; }
}

// ==================== Data Fetching ====================

async function fetchPrices(pairs) {
  if (!pairs.length) return {};
  try {
    const res = await fetch(`${BINANCE_SPOT}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`);
    if (!res.ok) return {};
    const data = await res.json();
    const prices = {};
    for (const item of data) {
      if (item.symbol && item.lastPrice) {
        prices[item.symbol] = {
          price: parseFloat(item.lastPrice),
          change24h: parseFloat(item.priceChangePercent) || 0,
          volume: parseFloat(item.quoteVolume) || 0,
        };
      }
    }
    return prices;
  } catch { return {}; }
}

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

// ── AI usage quota (daily, resets at Israel midnight) ────────────────────────
const AI_DAILY_LIMIT = 20;
const AI_IMAGE_DAILY_LIMIT = 10;
const FIREBASE_PROJECT_ID = 'tradeos-91a58';

// ── Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) ───────────────────────────
// Public key is safe to expose (the client uses it as applicationServerKey).
// The matching private key is provided to the worker as env.VAPID_JWK.
const VAPID_PUBLIC_KEY = 'BLFZCOugKM1d2jqTwgmGTF9VjFwQEMNo92l2gfNVk7eBYz1Gnrr0jFBS5jR1bRJ5MchpVkVNiqS8wtzUqouBHRk';
const VAPID_SUBJECT = 'mailto:aviniazov7@icloud.com';

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
      direction: p.side === 'Buy' ? 'long' : 'short',
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
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#0a0e16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0a0e16">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#0f1521;border:1px solid rgba(0,191,255,0.18);border-radius:16px;overflow:hidden">
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
  const list = await env.ALERTS_KV.list({ prefix: 'pushexch:' });
  if (!list.keys.length) return;

  const hhmm = getIsraelHHMM();
  const israelDate = getIsraelDateStr();
  // Daily summary fires once, in the 22:00 cron tick (cron runs every 10 min).
  const summaryWindow = hhmm >= '22:00' && hhmm < '22:10';
  const it = getIsraelTime();
  const dayStartMs = Date.now() - ((it.getHours() * 3600 + it.getMinutes() * 60 + it.getSeconds()) * 1000);

  for (const k of list.keys) {
    const [, uid, exchange] = k.name.split(':');
    if (exchange !== 'bybit') continue; // only Bybit polling for now
    const creds = await decodeCreds(env, await env.ALERTS_KV.get(k.name));
    if (!creds?.apiKey || !creds?.apiSecret) continue;

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
      await env.ALERTS_KV.put(openKey, JSON.stringify(curIds), { expirationTtl: 60 * 60 * 24 * 7 });
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
        .slice(0, 5); // anti-flood per tick
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
      if (maxExit > cursor) await env.ALERTS_KV.put(cursorKey, String(maxExit), { expirationTtl: 60 * 60 * 24 * 60 });
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
  const res = await fetch(GOOGLE_JWK_URL);
  if (!res.ok) throw new Error('fetch keys failed');
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
  const cached = await env.ALERTS_KV.get(cacheKey);
  if (cached !== null) return cached === '1';
  let premium = false;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const f = (await r.json()).fields || {};
      const plan = f.plan?.stringValue;
      const role = f.role?.stringValue;
      const expRaw = f.planExpires?.timestampValue || f.planExpires?.stringValue;
      const notExpired = !expRaw || new Date(expRaw).getTime() > Date.now();
      premium = role === 'admin' || (plan === 'premium' && notExpired);
    }
  } catch { /* default free */ }
  // Short TTL: a grant busts this key explicitly (/admin/refresh-plan), but the
  // cache must also self-heal quickly when a timed plan LAPSES — otherwise an
  // expired user keeps premium until the old 10-min cache aged out.
  await env.ALERTS_KV.put(cacheKey, premium ? '1' : '0', { expirationTtl: 60 });
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

  if (premium) {
    // Premium: 5/min, 50/hr, 200/day (soft caps for "unlimited").
    const minute = await bumpWindow(env, `airl:min:${uid}`, AI_WINDOWS_SEC.minute);
    if (minute.count > AI_PREMIUM_LIMITS.minute) {
      return { status: 429, body: { error: 'יותר מדי בקשות בדקה. המתן רגע ונסה שוב.' } };
    }
    const hour = await bumpWindow(env, `airl:hr:${uid}`, AI_WINDOWS_SEC.hour);
    if (hour.count > AI_PREMIUM_LIMITS.hour) {
      return { status: 429, body: { error: 'הגעת לתקרה השעתית של Premium (50). נסה בעוד שעה.' } };
    }
    const day = await bumpWindow(env, `airl:day:${uid}`, AI_WINDOWS_SEC.day);
    if (day.count > AI_PREMIUM_LIMITS.day) {
      return { status: 429, body: { error: 'הגעת לתקרה היומית של Premium (200). נסה מחר.', quotaExceeded: true } };
    }
  } else {
    // Free: keep the original per-minute burst cap; daily quota is enforced
    // separately by getAiUsage / incrementAiUsage in the route handler.
    const minute = await bumpWindow(env, `airl:min:${uid}`, AI_WINDOWS_SEC.minute);
    if (minute.count > AI_FREE_BURST_PER_MIN) {
      return { status: 429, body: { error: 'המערכת עמוסה. המתן כמה שניות ונסה שוב.' } };
    }
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
    } catch { return null; }
  }
  try { return JSON.parse(raw); } catch { return null; } // legacy plaintext
}

async function storeExchangeCreds(env, uid, exchange, creds) {
  const blob = await encryptCreds(env, { exchange, apiKey: creds.apiKey, apiSecret: creds.apiSecret, passphrase: creds.passphrase || '' });
  await env.ALERTS_KV.put(`pushexch:${uid}:${exchange}`, blob, { expirationTtl: CREDS_TTL });
}

async function loadExchangeCreds(env, uid, exchange) {
  const raw = await env.ALERTS_KV.get(`pushexch:${uid}:${exchange}`);
  const creds = await decodeCreds(env, raw);
  return creds && creds.apiKey && creds.apiSecret ? creds : null;
}

// Resolve creds for the on-demand endpoints: prefer the encrypted store; if a
// legacy client still sends them in the body, use AND transparently migrate
// them into the encrypted store so the secret stops travelling on later calls.
async function resolveExchangeCreds(env, uid, exchange, body) {
  const stored = await loadExchangeCreds(env, uid, exchange);
  if (stored) return stored;
  if (body && body.apiKey && body.apiSecret) {
    const creds = { exchange, apiKey: body.apiKey, apiSecret: body.apiSecret, passphrase: body.passphrase || '' };
    try { await storeExchangeCreds(env, uid, exchange, creds); } catch { /* key not set yet — still usable this call */ }
    return creds;
  }
  return null;
}

async function fetchFundingRates(pairs) {
  try {
    const res = await fetch(`${BINANCE_FUTURES}/premiumIndex`);
    if (!res.ok) return {};
    const data = await res.json();
    const rates = {};
    for (const item of data) {
      if (pairs.includes(item.symbol)) {
        rates[item.symbol] = {
          fundingRate: parseFloat(item.lastFundingRate) * 100,
          markPrice: parseFloat(item.markPrice),
          nextFundingTime: item.nextFundingTime,
        };
      }
    }
    return rates;
  } catch { return {}; }
}

async function fetchOpenInterest(pairs) {
  const results = {};
  // Fetch in parallel, max 5 at a time
  const batches = [];
  for (let i = 0; i < pairs.length; i += 5) {
    batches.push(pairs.slice(i, i + 5));
  }
  for (const batch of batches) {
    const promises = batch.map(async (pair) => {
      try {
        const res = await fetch(`${BINANCE_FUTURES}/openInterest?symbol=${pair}`);
        if (!res.ok) return;
        const data = await res.json();
        results[pair] = {
          openInterest: parseFloat(data.openInterest),
        };
      } catch { /* skip */ }
    });
    await Promise.all(promises);
  }
  return results;
}

async function fetchLongShortRatio(pairs) {
  const results = {};
  const batches = [];
  for (let i = 0; i < pairs.length; i += 5) batches.push(pairs.slice(i, i + 5));
  for (const batch of batches) {
    await Promise.all(batch.map(async (pair) => {
      try {
        const res = await fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${pair}&period=5m&limit=1`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.length) {
          results[pair] = {
            ratio: parseFloat(data[0].longShortRatio),
            longPct: parseFloat(data[0].longAccount) * 100,
            shortPct: parseFloat(data[0].shortAccount) * 100,
          };
        }
      } catch {}
    }));
  }
  return results;
}

async function fetchFearGreed() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0] || null;
  } catch { return null; }
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

// ==================== Auth & User Data ====================

async function isRegistered(env, chatId) {
  return !!(await env.ALERTS_KV.get(`user:${chatId}`));
}
async function requireAuth(env, chatId) {
  return isRegistered(env, chatId);
}
async function getUserSettings(env, chatId) {
  const data = await env.ALERTS_KV.get(`settings:${chatId}`, 'json');
  return { ...DEFAULT_SETTINGS, ...data };
}
async function saveUserSettings(env, chatId, settings) {
  await env.ALERTS_KV.put(`settings:${chatId}`, JSON.stringify(settings));
}
async function getWatchlist(env, chatId) {
  const data = await env.ALERTS_KV.get(`watchlist:${chatId}`, 'json');
  return data || [...DEFAULT_WATCHLIST];
}
async function saveWatchlist(env, chatId, list) {
  await env.ALERTS_KV.put(`watchlist:${chatId}`, JSON.stringify(list));
}

// ==================== Main Menu ====================

function mainMenuKeyboard() {
  return [
    [
      { text: '💰 מחירים', callback_data: 'menu_prices' },
      { text: '🔔 התראות מחיר', callback_data: 'menu_alerts' },
    ],
    [
      { text: '📈 נתוני שוק', callback_data: 'menu_market' },
      { text: '😱 פחד/חמדנות', callback_data: 'menu_fear' },
    ],
    [
      { text: '📊 סטטוס התראות', callback_data: 'menu_status' },
      { text: '⚙️ הגדרות', callback_data: 'menu_settings' },
    ],
    [{ text: '❓ עזרה', callback_data: 'menu_help' }],
  ];
}

// ==================== Command Handlers ====================

async function handleStart(env, chatId, text, username = null) {
  // The /start param is a short-lived, server-issued connect code (NOT a raw
  // uid). We resolve it to a uid via KV; an enumerable uid can no longer be
  // used to hijack another user's notification link.
  const param = text.split(' ')[1] || null;
  if (param) {
    const uid = await env.ALERTS_KV.get(`tgconnect:${param}`);
    if (!uid) {
      // Expired / invalid / forged code — do NOT write any mapping.
      await sendMessage(env.BOT_TOKEN, chatId, 'קוד החיבור פג תוקף או אינו תקין. חזור לאפליקציה ולחץ שוב על חיבור לטלגרם.');
      return;
    }
    await env.ALERTS_KV.put(`user:${chatId}`, JSON.stringify({ uid, chatId, username, connectedAt: new Date().toISOString() }));
    await env.ALERTS_KV.put(`uid:${uid}`, String(chatId));
    // Store the @username (if any) so the "open chat" link in dev notifications
    // can use https://t.me/<username>, which actually opens a chat (unlike
    // tg://user?id=, which Telegram can't resolve from an id alone).
    if (username) await env.ALERTS_KV.put(`tgusername:${chatId}`, username);
    // Single-use: burn the code so it can't be replayed.
    await env.ALERTS_KV.delete(`tgconnect:${param}`);
    const welcome =
      '🤖 <b>ברוך הבא ל-TradeOS Bot!</b>\n\n' +
      '💰 <b>מחירים</b> — ווצ\'ליסט אישי עם מחירים חיים\n' +
      '📈 <b>נתוני שוק</b> — Funding, OI, Long/Short (עם גרפים)\n' +
      '🔔 <b>התראות מחיר</b> — התראה כשמטבע מגיע ליעד\n' +
      '😱 <b>פחד/חמדנות</b> — סנטימנט השוק\n' +
      '📝 <b>תזכורת יומן</b> — תזכורת יומית\n' +
      '📊 <b>סיכום יומי</b> — סטטיסטיקות סוף יום\n' +
      '📅 <b>לוח אירועים</b> — אירועים כלכליים\n\n' +
      'בחר מהתפריט:';
    await sendMessage(env.BOT_TOKEN, chatId, welcome, mainMenuKeyboard());
  } else if (await isRegistered(env, chatId)) {
    await sendMessage(env.BOT_TOKEN, chatId, '🤖 <b>TradeOS Bot</b>\n\nבחר מהתפריט:', mainMenuKeyboard());
  }
}

async function handlePrices(env, chatId) {
  const watchlist = await getWatchlist(env, chatId);
  const prices = await fetchPrices(watchlist);

  if (!Object.keys(prices).length) {
    await sendMessage(env.BOT_TOKEN, chatId, '⚠️ לא הצלחתי לטעון מחירים. נסה שוב.', [
      [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
    ]);
    return;
  }

  // Sort by watchlist order, then split green/red
  const green = [];
  const red = [];
  for (const pair of watchlist) {
    const d = prices[pair];
    if (!d) continue;
    (d.change24h >= 0 ? green : red).push({ pair, ...d });
  }
  // Sort each group by change magnitude
  green.sort((a, b) => b.change24h - a.change24h);
  red.sort((a, b) => a.change24h - b.change24h);

  let text = '💰 <b>מחירים — הווצ\'ליסט שלך</b>\n\n';

  if (green.length) {
    text += '🟢 <b>עולים:</b>\n';
    for (const c of green) {
      const sym = c.pair.replace('USDT', '');
      text += `<b>${sym}</b> — ${fmtPrice(c.price)} (${fmtPct(c.change24h)})\n`;
    }
    text += '\n';
  }

  if (red.length) {
    text += '🔴 <b>יורדים:</b>\n';
    for (const c of red) {
      const sym = c.pair.replace('USDT', '');
      text += `<b>${sym}</b> — ${fmtPrice(c.price)} (${fmtPct(c.change24h)})\n`;
    }
  }

  await sendMessage(env.BOT_TOKEN, chatId, text, [
    [
      { text: '🔄 רענן', callback_data: 'menu_prices' },
      { text: '⭐ ערוך ווצ\'ליסט', callback_data: 'wl_menu' },
    ],
    [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
  ]);
}

async function handleMarketMenu(env, chatId) {
  const text = '📈 <b>נתוני שוק</b>\n\nבחר נתון:';
  await sendMessage(env.BOT_TOKEN, chatId, text, [
    [
      { text: '💸 Funding Rate', callback_data: 'mkt_funding' },
      { text: '📊 Open Interest', callback_data: 'mkt_oi' },
    ],
    [{ text: '📊 Long/Short Ratio', callback_data: 'mkt_ls' }],
    [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
  ]);
}

async function handleFunding(env, chatId) {
  const watchlist = await getWatchlist(env, chatId);
  const rates = await fetchFundingRates(watchlist);

  if (!Object.keys(rates).length) {
    await sendMessage(env.BOT_TOKEN, chatId, '⚠️ לא הצלחתי לטעון נתוני Funding. נסה שוב.', [
      [{ text: '🔙 חזרה', callback_data: 'menu_market' }],
    ]);
    return;
  }

  const sorted = watchlist
    .filter((p) => rates[p])
    .sort((a, b) => Math.abs(rates[b].fundingRate) - Math.abs(rates[a].fundingRate));

  const nextTime = rates[sorted[0]]?.nextFundingTime;
  const timeLeft = nextTime ? Math.max(0, nextTime - Date.now()) : 0;
  const hoursLeft = Math.floor(timeLeft / 3600000);
  const minsLeft = Math.floor((timeLeft % 3600000) / 60000);

  // Build chart
  const labels = sorted.map((p) => p.replace('USDT', ''));
  const values = sorted.map((p) => +(rates[p].fundingRate.toFixed(4)));
  const chartUrl = await createChart({
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: values.map((v) => v >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)'),
      }],
    },
    options: {
      legend: { display: false },
      title: { display: true, text: 'Funding Rate (%)', fontSize: 16 },
      plugins: { datalabels: { display: true, color: '#333', anchor: 'end', align: 'end', font: { weight: 'bold' } } },
    },
  }, 600, Math.max(300, sorted.length * 40));

  let caption = '💸 <b>Funding Rate</b>\n\n';
  for (const pair of sorted) {
    const r = rates[pair];
    const sym = pair.replace('USDT', '');
    const re = r.fundingRate >= 0 ? '🟢' : '🔴';
    caption += `<b>${sym}</b>: ${re} ${fmtPct(r.fundingRate)}\n`;
  }
  if (timeLeft > 0) caption += `\n⏰ Funding הבא: ${hoursLeft}h ${minsLeft}m`;
  // Tell the user which watchlist coins have no funding data (e.g. not listed
  // on Binance Futures) instead of silently dropping them.
  const missing = watchlist.filter((p) => !rates[p]).map((p) => p.replace('USDT', ''));
  if (missing.length) caption += `\n\nℹ️ אין נתוני Funding ל: ${missing.join(', ')}`;

  const keyboard = [
    [{ text: '🔄 רענן', callback_data: 'mkt_funding' }, { text: '🔙 חזרה', callback_data: 'menu_market' }],
    [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
  ];

  if (chartUrl) await sendPhoto(env.BOT_TOKEN, chatId, chartUrl, caption, keyboard);
  else await sendMessage(env.BOT_TOKEN, chatId, caption, keyboard);
}

async function handleOpenInterest(env, chatId) {
  const watchlist = await getWatchlist(env, chatId);
  const [oi, prices] = await Promise.all([fetchOpenInterest(watchlist), fetchPrices(watchlist)]);

  if (!Object.keys(oi).length) {
    await sendMessage(env.BOT_TOKEN, chatId, '⚠️ לא הצלחתי לטעון נתוני OI. נסה שוב.', [
      [{ text: '🔙 חזרה', callback_data: 'menu_market' }],
    ]);
    return;
  }

  const sorted = watchlist
    .filter((p) => oi[p] && prices[p])
    .map((p) => ({ pair: p, oiUsd: oi[p].openInterest * prices[p].price }))
    .sort((a, b) => b.oiUsd - a.oiUsd);

  // Build chart
  const labels = sorted.map((i) => i.pair.replace('USDT', ''));
  const values = sorted.map((i) => +(i.oiUsd / 1e9).toFixed(2));
  const chartUrl = await createChart({
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: 'rgba(59,130,246,0.8)',
      }],
    },
    options: {
      legend: { display: false },
      title: { display: true, text: 'Open Interest ($B)', fontSize: 16 },
      plugins: { datalabels: { display: true, color: '#333', anchor: 'end', align: 'end', font: { weight: 'bold' } } },
    },
  }, 600, Math.max(300, sorted.length * 40));

  let caption = '📊 <b>Open Interest</b>\n\n';
  for (const item of sorted) {
    const sym = item.pair.replace('USDT', '');
    caption += `<b>${sym}</b>: ${fmtBigNum(item.oiUsd)}\n`;
  }

  const keyboard = [
    [{ text: '🔄 רענן', callback_data: 'mkt_oi' }, { text: '🔙 חזרה', callback_data: 'menu_market' }],
    [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
  ];

  if (chartUrl) await sendPhoto(env.BOT_TOKEN, chatId, chartUrl, caption, keyboard);
  else await sendMessage(env.BOT_TOKEN, chatId, caption, keyboard);
}

async function handleLongShortRatio(env, chatId) {
  const watchlist = await getWatchlist(env, chatId);
  const data = await fetchLongShortRatio(watchlist);

  if (!Object.keys(data).length) {
    await sendMessage(env.BOT_TOKEN, chatId, '⚠️ לא הצלחתי לטעון נתוני Long/Short. נסה שוב.', [
      [{ text: '🔙 חזרה', callback_data: 'menu_market' }],
    ]);
    return;
  }

  const sorted = watchlist.filter((p) => data[p]).sort((a, b) => data[b].ratio - data[a].ratio);
  const labels = sorted.map((p) => p.replace('USDT', ''));
  const longData = sorted.map((p) => +data[p].longPct.toFixed(1));
  const shortData = sorted.map((p) => +data[p].shortPct.toFixed(1));

  const chartUrl = await createChart({
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [
        { label: 'Long %', data: longData, backgroundColor: 'rgba(34,197,94,0.8)' },
        { label: 'Short %', data: shortData, backgroundColor: 'rgba(239,68,68,0.8)' },
      ],
    },
    options: {
      title: { display: true, text: 'Long/Short Ratio', fontSize: 16 },
      plugins: { datalabels: { display: true, color: '#fff', font: { weight: 'bold', size: 11 } } },
      scales: {
        xAxes: [{ stacked: true, ticks: { max: 100 } }],
        yAxes: [{ stacked: true }],
      },
    },
  }, 600, Math.max(300, sorted.length * 40));

  let caption = '📊 <b>Long/Short Ratio</b>\n\n';
  for (const pair of sorted) {
    const d = data[pair];
    const sym = pair.replace('USDT', '');
    const bias = d.longPct > d.shortPct ? '🟢' : '🔴';
    caption += `<b>${sym}</b>: ${bias} L:${d.longPct.toFixed(1)}% S:${d.shortPct.toFixed(1)}%\n`;
  }

  const keyboard = [
    [{ text: '🔄 רענן', callback_data: 'mkt_ls' }, { text: '🔙 חזרה', callback_data: 'menu_market' }],
    [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
  ];

  if (chartUrl) await sendPhoto(env.BOT_TOKEN, chatId, chartUrl, caption, keyboard);
  else await sendMessage(env.BOT_TOKEN, chatId, caption, keyboard);
}

async function handleAlerts(env, chatId) {
  await sendMessage(env.BOT_TOKEN, chatId, '🔔 <b>התראות מחיר</b>\n\nבחר פעולה:', [
    [{ text: '➕ הוספת התראה', callback_data: 'alert_add' }],
    [{ text: '📋 ההתראות שלי', callback_data: 'alert_list' }],
    [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
  ]);
}

async function handleFearGreed(env, chatId) {
  const fg = await fetchFearGreed();
  if (!fg) {
    await sendMessage(env.BOT_TOKEN, chatId, '⚠️ לא הצלחתי לטעון את המדד. נסה שוב.', [
      [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
    ]);
    return;
  }
  const value = parseInt(fg.value, 10);
  if (!Number.isFinite(value)) {
    await sendMessage(env.BOT_TOKEN, chatId, '⚠️ לא הצלחתי לטעון את המדד. נסה שוב.', [
      [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
    ]);
    return;
  }
  let emoji;
  if (value <= 25) emoji = '😱';
  else if (value <= 45) emoji = '😟';
  else if (value <= 55) emoji = '😐';
  else if (value <= 75) emoji = '😊';
  else emoji = '🤑';
  const filled = Math.round(value / 10);
  const bar = '🟩'.repeat(Math.min(filled, 10)) + '⬜'.repeat(Math.max(10 - filled, 0));
  const text =
    `😱 <b>מדד פחד וחמדנות</b>\n\n` +
    `${emoji} <b>${fg.value_classification}</b>\n\n${bar}\n\n` +
    `<b>ערך: ${fg.value}/100</b>\n\n` +
    `עדכון אחרון: ${new Date(fg.timestamp * 1000).toLocaleDateString('he-IL')}`;
  await sendMessage(env.BOT_TOKEN, chatId, text, [
    [{ text: '🔄 רענן', callback_data: 'menu_fear' }, { text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
  ]);
}

async function handleStatus(env, chatId) {
  const list = await env.ALERTS_KV.list({ prefix: `alerts:${chatId}:` });
  const alerts = [];
  for (const key of list.keys) {
    const data = await env.ALERTS_KV.get(key.name, 'json');
    if (data && data.active) alerts.push(data);
  }
  if (!alerts.length) {
    await sendMessage(env.BOT_TOKEN, chatId,
      '📊 <b>סטטוס</b>\n\nאין לך התראות פעילות כרגע.\nלחץ על "הוספת התראה" כדי ליצור אחת!',
      [[{ text: '➕ הוספת התראה', callback_data: 'alert_add' }], [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }]]);
    return;
  }
  let text = `📊 <b>סטטוס — ${alerts.length} התראות פעילות</b>\n\n`;
  alerts.forEach((a, i) => {
    const dir = a.direction === 'above' ? '📈 מעל' : '📉 מתחת';
    text += `${i + 1}. <b>${a.pair.replace('USDT', '')}</b> ${dir} ${fmtPrice(a.targetPrice)}\n`;
  });
  text += '\n⏰ נבדק כל דקה 24/7';
  const keyboard = alerts.map((a) => [{ text: `🗑 מחק ${a.pair} ${fmtPrice(a.targetPrice)}`, callback_data: `del:${a.id}` }]);
  keyboard.push([{ text: '➕ הוספת התראה', callback_data: 'alert_add' }]);
  keyboard.push([{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }]);
  await sendMessage(env.BOT_TOKEN, chatId, text, keyboard);
}

async function handleHelp(env, chatId) {
  const text =
    '❓ <b>עזרה — TradeOS Bot</b>\n\n' +
    '<b>פקודות:</b>\n' +
    '/start — תפריט ראשי\n' +
    '/prices — מחירים (ווצ\'ליסט)\n' +
    '/funding — Funding Rate\n' +
    '/oi — Open Interest\n' +
    '/ls — Long/Short Ratio\n' +
    '/alerts — ניהול התראות מחיר\n' +
    '/price BTC — מחיר מטבע ספציפי\n' +
    '/fear — מדד פחד/חמדנות\n' +
    '/status — סטטוס התראות\n' +
    '/settings — הגדרות תזכורות\n' +
    '/help — עזרה\n\n' +
    '<b>💰 ווצ\'ליסט:</b>\n' +
    'ערוך את רשימת המטבעות שלך דרך כפתור "⭐ ערוך ווצ\'ליסט" במסך המחירים.\n\n' +
    '<b>📈 נתוני שוק:</b>\n' +
    '💸 Funding Rate — שיעורי מימון (עם גרף)\n' +
    '📊 Open Interest — פוזיציות פתוחות (עם גרף)\n' +
    '📊 Long/Short Ratio — יחס לונג/שורט (עם גרף)\n\n' +
    '<b>⚙️ הגדרות:</b>\n' +
    '📝 תזכורת יומן — תזכורת יומית למלא את היומן\n' +
    '📊 סיכום יומי — סטטיסטיקות סוף יום\n' +
    '📅 לוח אירועים — אירועים כלכליים חשובים\n\n' +
    `<b>קישור לאפליקציה:</b>\n${APP_URL}`;
  await sendMessage(env.BOT_TOKEN, chatId, text, [[{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }]]);
}

async function handleQuickPrice(env, chatId, symbol) {
  const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  if (!ALL_PAIRS[pair]) {
    const supported = Object.keys(ALL_PAIRS).map((p) => p.replace('USDT', '')).join(', ');
    await sendMessage(env.BOT_TOKEN, chatId, `❌ מטבע לא מוכר: ${symbol}\n\nמטבעות נתמכים: ${supported}`);
    return;
  }
  const prices = await fetchPrices([pair]);
  if (prices[pair]) {
    const chg = prices[pair].change24h >= 0 ? '📈' : '📉';
    await sendMessage(env.BOT_TOKEN, chatId,
      `<b>${pair.replace('USDT', '')}</b>\n\n💰 ${fmtPrice(prices[pair].price)}\n${chg} ${fmtPct(prices[pair].change24h)} (24h)`);
  } else {
    await sendMessage(env.BOT_TOKEN, chatId, '⚠️ לא הצלחתי לטעון את המחיר. נסה שוב.');
  }
}

// ==================== Watchlist Handlers ====================

async function handleWatchlistMenu(env, chatId) {
  const watchlist = await getWatchlist(env, chatId);
  const current = watchlist.map((p) => p.replace('USDT', '')).join(', ');
  const text = `⭐ <b>ווצ'ליסט</b>\n\nהמטבעות שלך: ${current}\n\nבחר פעולה:`;
  await sendMessage(env.BOT_TOKEN, chatId, text, [
    [{ text: '➕ הוסף מטבע', callback_data: 'wl_add' }],
    [{ text: '➖ הסר מטבע', callback_data: 'wl_rm' }],
    [{ text: '🔄 אפס לברירת מחדל', callback_data: 'wl_reset' }],
    [{ text: '🔙 חזרה למחירים', callback_data: 'menu_prices' }],
  ]);
}

async function handleWatchlistAdd(env, chatId) {
  const watchlist = await getWatchlist(env, chatId);
  const available = Object.keys(ALL_PAIRS).filter((p) => !watchlist.includes(p));
  if (!available.length) {
    await sendMessage(env.BOT_TOKEN, chatId, '⭐ כל המטבעות כבר בווצ\'ליסט שלך!', [
      [{ text: '🔙 חזרה', callback_data: 'wl_menu' }],
    ]);
    return;
  }
  const buttons = available.map((p) => ({ text: p.replace('USDT', ''), callback_data: `wl_a:${p}` }));
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 3) {
    keyboard.push(buttons.slice(i, i + 3));
  }
  keyboard.push([{ text: '🔙 חזרה', callback_data: 'wl_menu' }]);
  await sendMessage(env.BOT_TOKEN, chatId, '➕ <b>בחר מטבע להוספה:</b>', keyboard);
}

async function handleWatchlistRemove(env, chatId) {
  const watchlist = await getWatchlist(env, chatId);
  if (watchlist.length <= 1) {
    await sendMessage(env.BOT_TOKEN, chatId, '⚠️ חייב להישאר לפחות מטבע אחד בווצ\'ליסט.', [
      [{ text: '🔙 חזרה', callback_data: 'wl_menu' }],
    ]);
    return;
  }
  const buttons = watchlist.map((p) => ({ text: p.replace('USDT', ''), callback_data: `wl_r:${p}` }));
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 3) {
    keyboard.push(buttons.slice(i, i + 3));
  }
  keyboard.push([{ text: '🔙 חזרה', callback_data: 'wl_menu' }]);
  await sendMessage(env.BOT_TOKEN, chatId, '➖ <b>בחר מטבע להסרה:</b>', keyboard);
}

// ==================== Settings Handlers ====================

async function handleSettings(env, chatId, messageId = null) {
  const settings = await getUserSettings(env, chatId);
  const jS = settings.journal.enabled ? `✅ ${settings.journal.time}` : '❌ כבוי';
  const sS = settings.summary.enabled ? `✅ ${settings.summary.time}` : '❌ כבוי';
  const cS = settings.calendar.enabled ? '✅ פעיל' : '❌ כבוי';
  const text = `⚙️ <b>הגדרות</b>\n\n📝 תזכורת יומן: ${jS}\n📊 סיכום יומי: ${sS}\n📅 לוח אירועים: ${cS}`;
  const keyboard = [
    [{ text: '📝 תזכורת יומן', callback_data: 'set_journal' }, { text: '📊 סיכום יומי', callback_data: 'set_summary' }],
    [{ text: '📅 לוח אירועים', callback_data: 'set_calendar' }],
    [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
  ];
  if (messageId) await editMessage(env.BOT_TOKEN, chatId, messageId, text, keyboard);
  else await sendMessage(env.BOT_TOKEN, chatId, text, keyboard);
}

async function handleSettingDetail(env, chatId, messageId, type) {
  const settings = await getUserSettings(env, chatId);
  const labels = { journal: 'תזכורת מילוי יומן', summary: 'סיכום יומי', calendar: 'לוח אירועים כלכליים' };
  const descs = {
    journal: 'תזכורת יומית למלא את יומן המסחר.',
    summary: 'סיכום יומי עם P&L, עסקאות ו-Win Rate.',
    calendar: 'התראה שעה לפני אירועים כלכליים חשובים\n(CPI, FOMC, NFP ועוד)',
  };
  const s = type === 'calendar' ? settings.calendar : settings[type];
  const statusText = s.enabled ? '✅ פעיל' : '❌ כבוי';
  let text = `${type === 'journal' ? '📝' : type === 'summary' ? '📊' : '📅'} <b>${labels[type]}</b>\n\nסטטוס: ${statusText}\n`;
  if (type !== 'calendar' && s.time) text += `שעה: ${s.time}\n`;
  text += `\n${descs[type]}`;
  const keyboard = [[{ text: s.enabled ? '❌ כבה' : '✅ הפעל', callback_data: `toggle_${type}` }]];
  if (type !== 'calendar') keyboard.push([{ text: '🕐 שנה שעה', callback_data: `time_${type}` }]);
  keyboard.push([{ text: '🔙 חזרה להגדרות', callback_data: 'menu_settings' }]);
  await editMessage(env.BOT_TOKEN, chatId, messageId, text, keyboard);
}

async function handleToggle(env, chatId, messageId, type) {
  const settings = await getUserSettings(env, chatId);
  if (type === 'calendar') settings.calendar.enabled = !settings.calendar.enabled;
  else settings[type].enabled = !settings[type].enabled;
  await saveUserSettings(env, chatId, settings);
  await handleSettingDetail(env, chatId, messageId, type);
}

async function handleTimePicker(env, chatId, messageId, type) {
  const label = type === 'journal' ? 'תזכורת יומן' : 'סיכום יומי';
  const hours = [];
  for (let h = 8; h <= 23; h++) hours.push({ text: `${String(h).padStart(2, '0')}:00`, callback_data: `stt_${type}_${String(h).padStart(2, '0')}:00` });
  const keyboard = [];
  for (let i = 0; i < hours.length; i += 4) keyboard.push(hours.slice(i, i + 4));
  keyboard.push([{ text: '🔙 חזרה', callback_data: `set_${type}` }]);
  await editMessage(env.BOT_TOKEN, chatId, messageId, `🕐 <b>בחר שעה ל${label}:</b>`, keyboard);
}

async function handleSetTime(env, chatId, messageId, type, time) {
  const settings = await getUserSettings(env, chatId);
  settings[type].time = time;
  await saveUserSettings(env, chatId, settings);
  await handleSettingDetail(env, chatId, messageId, type);
}

// ==================== Callback Handler ====================

async function handleCallback(env, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  await answerCallback(env.BOT_TOKEN, callbackQuery.id);
  if (!(await isRegistered(env, chatId))) return;

  // Main menu
  if (data === 'menu_main') { await editMessage(env.BOT_TOKEN, chatId, messageId, '🤖 <b>TradeOS Bot</b>\n\nבחר מהתפריט:', mainMenuKeyboard()); return; }
  if (data === 'menu_prices') return handlePrices(env, chatId);
  if (data === 'menu_alerts') return handleAlerts(env, chatId);
  if (data === 'menu_market') return handleMarketMenu(env, chatId);
  if (data === 'menu_fear') return handleFearGreed(env, chatId);
  if (data === 'menu_status') return handleStatus(env, chatId);
  if (data === 'menu_help') return handleHelp(env, chatId);

  // Market data
  if (data === 'mkt_funding') return handleFunding(env, chatId);
  if (data === 'mkt_oi') return handleOpenInterest(env, chatId);
  if (data === 'mkt_ls') return handleLongShortRatio(env, chatId);

  // Settings
  if (data === 'menu_settings') return handleSettings(env, chatId, messageId);
  if (data === 'set_journal') return handleSettingDetail(env, chatId, messageId, 'journal');
  if (data === 'set_summary') return handleSettingDetail(env, chatId, messageId, 'summary');
  if (data === 'set_calendar') return handleSettingDetail(env, chatId, messageId, 'calendar');
  if (data === 'toggle_journal') return handleToggle(env, chatId, messageId, 'journal');
  if (data === 'toggle_summary') return handleToggle(env, chatId, messageId, 'summary');
  if (data === 'toggle_calendar') return handleToggle(env, chatId, messageId, 'calendar');
  if (data === 'time_journal') return handleTimePicker(env, chatId, messageId, 'journal');
  if (data === 'time_summary') return handleTimePicker(env, chatId, messageId, 'summary');
  if (data.startsWith('stt_')) {
    const [, type, time] = data.split('_');
    // Only journal/summary have a configurable time — reject anything else.
    if (type === 'journal' || type === 'summary') {
      return handleSetTime(env, chatId, messageId, type, time);
    }
    return;
  }

  // Watchlist
  if (data === 'wl_menu') return handleWatchlistMenu(env, chatId);
  if (data === 'wl_add') return handleWatchlistAdd(env, chatId);
  if (data === 'wl_rm') return handleWatchlistRemove(env, chatId);
  if (data === 'wl_reset') {
    await saveWatchlist(env, chatId, [...DEFAULT_WATCHLIST]);
    await sendMessage(env.BOT_TOKEN, chatId, '✅ הווצ\'ליסט אופס לברירת מחדל!', [[{ text: '💰 מחירים', callback_data: 'menu_prices' }]]);
    return;
  }
  if (data.startsWith('wl_a:')) {
    const pair = data.split(':')[1];
    const wl = await getWatchlist(env, chatId);
    if (!wl.includes(pair)) { wl.push(pair); await saveWatchlist(env, chatId, wl); }
    await sendMessage(env.BOT_TOKEN, chatId, `✅ <b>${pair.replace('USDT', '')}</b> נוסף לווצ'ליסט!`, [
      [{ text: '➕ עוד מטבע', callback_data: 'wl_add' }, { text: '💰 מחירים', callback_data: 'menu_prices' }],
    ]);
    return;
  }
  if (data.startsWith('wl_r:')) {
    const pair = data.split(':')[1];
    const wl = await getWatchlist(env, chatId);
    const filtered = wl.filter((p) => p !== pair);
    if (filtered.length > 0) { await saveWatchlist(env, chatId, filtered); }
    await sendMessage(env.BOT_TOKEN, chatId, `✅ <b>${pair.replace('USDT', '')}</b> הוסר מהווצ'ליסט.`, [
      [{ text: '➖ עוד הסרה', callback_data: 'wl_rm' }, { text: '💰 מחירים', callback_data: 'menu_prices' }],
    ]);
    return;
  }

  // Alerts: select pair (show ALL_PAIRS)
  if (data === 'alert_add') {
    const buttons = Object.keys(ALL_PAIRS).map((pair) => ({ text: pair.replace('USDT', ''), callback_data: `pair:${pair}` }));
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 4) keyboard.push(buttons.slice(i, i + 4));
    keyboard.push([{ text: '🔙 חזרה', callback_data: 'menu_alerts' }]);
    await sendMessage(env.BOT_TOKEN, chatId, '📊 <b>בחר מטבע:</b>', keyboard);
    return;
  }
  if (data.startsWith('pair:')) {
    const pair = data.split(':')[1];
    await sendMessage(env.BOT_TOKEN, chatId, `<b>${pair.replace('USDT', '')}</b>\n\nבחר כיוון:`, [
      [{ text: '📈 מעל מחיר', callback_data: `dir:${pair}:above` }, { text: '📉 מתחת למחיר', callback_data: `dir:${pair}:below` }],
      [{ text: '🔙 חזרה', callback_data: 'alert_add' }],
    ]);
    return;
  }
  if (data.startsWith('dir:')) {
    const [, pair, direction] = data.split(':');
    await env.ALERTS_KV.put(`state:${chatId}`, JSON.stringify({ step: 'awaiting_price', pair, direction }), { expirationTtl: 300 });
    const dirText = direction === 'above' ? 'מעל' : 'מתחת';
    await sendMessage(env.BOT_TOKEN, chatId,
      `<b>${pair.replace('USDT', '')}</b> — התראה כשהמחיר ${dirText}\n\n💲 <b>שלח את מחיר היעד:</b>\n(למשל: 100000)`,
      [[{ text: '❌ ביטול', callback_data: 'menu_alerts' }]]);
    return;
  }
  if (data === 'alert_list') return handleStatus(env, chatId);
  if (data.startsWith('del:')) {
    const alertId = data.split(':')[1];
    await env.ALERTS_KV.delete(`alerts:${chatId}:${alertId}`);
    await sendMessage(env.BOT_TOKEN, chatId, '✅ ההתראה נמחקה!', [
      [{ text: '📋 ההתראות שלי', callback_data: 'alert_list' }, { text: '🔙 תפריט ראשי', callback_data: 'menu_main' }],
    ]);
  }
}

// ==================== Text Message Handler ====================

async function handleTextMessage(env, chatId, text) {
  const stateStr = await env.ALERTS_KV.get(`state:${chatId}`);
  if (!stateStr) {
    await sendMessage(env.BOT_TOKEN, chatId, '🤖 <b>TradeOS Bot</b>\n\nבחר מהתפריט או שלח /help:', mainMenuKeyboard());
    return;
  }
  const state = JSON.parse(stateStr);
  if (state.step === 'awaiting_price') {
    const price = parseFloat(text.replace(/,/g, ''));
    if (isNaN(price) || price <= 0) {
      await sendMessage(env.BOT_TOKEN, chatId, '❌ מחיר לא תקין. שלח מספר חיובי (למשל: 100000)');
      return;
    }
    const alertId = Date.now().toString();
    await env.ALERTS_KV.put(`alerts:${chatId}:${alertId}`, JSON.stringify({
      id: alertId, chatId: String(chatId), pair: state.pair, targetPrice: price,
      direction: state.direction, active: true, createdAt: new Date().toISOString(),
    }));
    await env.ALERTS_KV.delete(`state:${chatId}`);
    const dir = state.direction === 'above' ? '📈 מעל' : '📉 מתחת';
    await sendMessage(env.BOT_TOKEN, chatId,
      `✅ <b>ההתראה נוצרה!</b>\n\n<b>${state.pair.replace('USDT', '')}</b>\n${dir} ${fmtPrice(price)}\n\n⏰ נבדק כל דקה 24/7`,
      [[{ text: '➕ עוד התראה', callback_data: 'alert_add' }, { text: '📋 ההתראות שלי', callback_data: 'alert_list' }],
       [{ text: '🔙 תפריט ראשי', callback_data: 'menu_main' }]]);
  }
}

// ==================== Webhook Handler ====================

// Bot-usage record for the admin panel: { total, lastUsed, lastCmd }.
// Read-modify-write per interaction is fine at bot volume; failures are
// swallowed by callers so stats can never break command handling.
async function bumpTgUsage(env, chatId, cmd) {
  const key = `tgusage:${chatId}`;
  const cur = (await env.ALERTS_KV.get(key, 'json')) || { total: 0 };
  await env.ALERTS_KV.put(key, JSON.stringify({
    total: (cur.total || 0) + 1,
    lastUsed: Date.now(),
    lastCmd: cmd,
  }));
}

async function handleWebhook(request, env) {
  // Defense in depth: if the owner has configured TG_WEBHOOK_SECRET, require
  // Telegram's secret-token header to match. When the secret is NOT set, skip
  // the check so the bot keeps working until the owner configures it (backward
  // compatible rollout — set the secret, then re-run /setup-webhook).
  if (env.TG_WEBHOOK_SECRET) {
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TG_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
  }
  try {
    const update = await request.json();
    if (update.callback_query) {
      const cbChatId = update.callback_query.message?.chat?.id;
      if (cbChatId) bumpTgUsage(env, cbChatId, 'button').catch(() => {});
      await handleCallback(env, update.callback_query);
      return new Response('OK');
    }
    const message = update.message;
    if (!message) return new Response('OK');
    const chatId = message.chat.id;
    const text = (message.text || '').trim();
    const username = message.from?.username || null;
    // Backfill the @username for already-connected users (any message), so the
    // dev's "open chat" link works without them re-running /start. One write
    // per user (skipped once stored).
    if (username) {
      const uk = `tgusername:${chatId}`;
      if ((await env.ALERTS_KV.get(uk)) !== username) await env.ALERTS_KV.put(uk, username);
    }

    // Lightweight bot-usage stats for the admin panel: total interactions,
    // last-used timestamp and last command. One KV read+write per message —
    // bot volume is low, so this is well within the free-tier write budget.
    bumpTgUsage(env, chatId, text.startsWith('/') ? text.split(' ')[0] : 'text').catch(() => {});

    if (text.startsWith('/start')) await handleStart(env, chatId, text, username);
    else if (!(await requireAuth(env, chatId))) { /* silent */ }
    else if (text === '/prices') await handlePrices(env, chatId);
    else if (text === '/alerts') await handleAlerts(env, chatId);
    else if (text === '/funding') await handleFunding(env, chatId);
    else if (text === '/oi') await handleOpenInterest(env, chatId);
    else if (text === '/ls') await handleLongShortRatio(env, chatId);
    else if (text === '/fear') await handleFearGreed(env, chatId);
    else if (text === '/status') await handleStatus(env, chatId);
    else if (text === '/settings') await handleSettings(env, chatId);
    else if (text === '/help') await handleHelp(env, chatId);
    else if (text.startsWith('/price ')) {
      const sym = text.split(' ')[1]?.toUpperCase();
      if (sym) await handleQuickPrice(env, chatId, sym);
    } else await handleTextMessage(env, chatId, text);
  } catch (err) { console.error('Webhook error:', err); }
  return new Response('OK');
}

// ==================== Cron Functions ====================

async function checkPriceAlerts(env, activeAlerts) {
  if (!activeAlerts.length) return;
  const pairs = [...new Set(activeAlerts.map((a) => a.pair))];
  const prices = await fetchPrices(pairs);
  if (!Object.keys(prices).length) return;
  for (const alert of activeAlerts) {
    const pd = prices[alert.pair];
    if (!pd) continue;
    const hit = alert.direction === 'above' ? pd.price >= alert.targetPrice : pd.price <= alert.targetPrice;
    if (hit) {
      // Dedup guard: KV is eventually consistent, so the `active:false` write
      // below may not be visible on the next cron tick. Claim a sent key first
      // so the alert can't fire twice (mirrors the other cron checks).
      const sentKey = `sent:alert:${alert.id}`;
      if (await env.ALERTS_KV.get(sentKey)) continue;
      await env.ALERTS_KV.put(sentKey, '1', { expirationTtl: 86400 });
      const dir = alert.direction === 'above' ? '📈 מעל' : '📉 מתחת';
      const chg = `${pd.change24h >= 0 ? '📈' : '📉'} שינוי 24h: ${fmtPct(pd.change24h)}`;
      const msg = `🔔 <b>התראת מחיר!</b>\n\n<b>${alert.pair.replace('USDT', '')}</b>\n💰 מחיר נוכחי: ${fmtPrice(pd.price)}\n🎯 יעד: ${dir} ${fmtPrice(alert.targetPrice)}\n${chg}\n\n✅ ההתראה הושלמה`;
      await sendMessage(env.BOT_TOKEN, alert.chatId, msg, [[{ text: '➕ התראה חדשה', callback_data: 'alert_add' }, { text: '📋 ההתראות שלי', callback_data: 'alert_list' }]]);
      const { kvKey, ...ad } = alert;
      // Reconstruct the key from stable fields so the disable write can't target
      // `undefined` if kvKey was ever absent.
      const alertKey = kvKey || `alerts:${alert.chatId}:${alert.id}`;
      await env.ALERTS_KV.put(alertKey, JSON.stringify({ ...ad, active: false }));
    }
  }
}

async function checkJournalReminders(env, settingsMap) {
  const currentTime = getIsraelHHMM();
  const today = getIsraelDateStr();
  for (const [chatId, s] of Object.entries(settingsMap)) {
    if (!s?.journal?.enabled || s.journal.time !== currentTime) continue;
    const sentKey = `sent:journal:${chatId}:${today}`;
    if (await env.ALERTS_KV.get(sentKey)) continue;
    await sendMessage(env.BOT_TOKEN, chatId,
      '📝 <b>תזכורת יומן</b>\n\nלא שכחת למלא את היומן היום?\nתיעוד העסקאות שלך הוא המפתח לשיפור! 💪',
      [[{ text: '📖 פתח את היומן', url: APP_URL }]]);
    await env.ALERTS_KV.put(sentKey, '1', { expirationTtl: 86400 });
  }
}

async function checkDailySummaries(env, settingsMap) {
  const currentTime = getIsraelHHMM();
  const today = getIsraelDateStr();
  for (const [chatId, s] of Object.entries(settingsMap)) {
    if (!s?.summary?.enabled || s.summary.time !== currentTime) continue;
    const sentKey = `sent:summary:${chatId}:${today}`;
    if (await env.ALERTS_KV.get(sentKey)) continue;
    const stats = await env.ALERTS_KV.get(`dailystats:${chatId}:${today}`, 'json');
    let msg;
    if (stats && stats.tradeCount > 0) {
      const pnlStr = stats.pnl >= 0 ? `+$${stats.pnl.toFixed(2)}` : `-$${Math.abs(stats.pnl).toFixed(2)}`;
      const pnlE = stats.pnl >= 0 ? '🟢' : '🔴';
      const wr = Math.round((stats.wins / stats.tradeCount) * 100);
      msg = `📊 <b>סיכום יומי — ${formatIsraelDate()}</b>\n\n📈 עסקאות: ${stats.tradeCount}\n${pnlE} P&L: ${pnlStr}\n🎯 Win Rate: ${wr}% (${stats.wins}/${stats.tradeCount})\n`;
      if (stats.bestTrade && stats.bestTrade.pnl > 0) msg += `🏆 הכי טובה: +$${stats.bestTrade.pnl.toFixed(2)} (${stats.bestTrade.pair})\n`;
      if (stats.worstTrade && stats.worstTrade.pnl < 0) msg += `📉 הכי גרועה: -$${Math.abs(stats.worstTrade.pnl).toFixed(2)} (${stats.worstTrade.pair})\n`;
    } else {
      msg = `📊 <b>סיכום יומי — ${formatIsraelDate()}</b>\n\nאין עסקאות סגורות היום.\nמחר יום חדש! 💪`;
    }
    await sendMessage(env.BOT_TOKEN, chatId, msg, [[{ text: '📖 פתח את היומן', url: APP_URL }]]);
    await env.ALERTS_KV.put(sentKey, '1', { expirationTtl: 86400 });
  }
}

async function checkEconomicCalendar(env, settingsMap) {
  const now = getIsraelTime();
  if (now.getMinutes() % 5 !== 0) return;
  const events = await fetchEconomicCalendar(env);
  if (!events.length) return;
  const users = Object.entries(settingsMap)
    .filter(([, s]) => s?.calendar?.enabled)
    .map(([chatId]) => chatId);
  if (!users.length) return;
  for (const event of events) {
    const diffMin = (new Date(event.date).getTime() - Date.now()) / 60000;
    if (diffMin < 55 || diffMin > 65) continue;
    const eventTime = new Date(event.date).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
    const forecastStr = event.forecast || event.previous
      ? `📊 ${event.forecast ? `תחזית: ${event.forecast}` : ''}${event.forecast && event.previous ? ' | ' : ''}${event.previous ? `קודם: ${event.previous}` : ''}\n` : '';
    const msg = `📅 <b>אירוע כלכלי בעוד שעה!</b>\n\n🔴 <b>${event.title}</b> (USD)\n🕐 ${eventTime} (שעון ישראל)\n${forecastStr}\n⚠️ צפי לתנודתיות גבוהה`;
    const eventKey = `${event.title}_${event.date}`.replace(/[^a-zA-Z0-9]/g, '_');
    for (const chatId of users) {
      const sentKey = `sent:cal:${chatId}:${eventKey}`;
      if (await env.ALERTS_KV.get(sentKey)) continue;
      await sendMessage(env.BOT_TOKEN, chatId, msg);
      await env.ALERTS_KV.put(sentKey, '1', { expirationTtl: 86400 });
    }
  }
}

async function handleCron(env) {
  // Heartbeat: record the last cron tick so the admin health panel can confirm
  // the scheduler is alive. Best-effort, never blocks the jobs below.
  await env.ALERTS_KV.put('cron:last', String(Date.now())).catch(() => {});

  // Web-push exchange polling is independent of Telegram, so run it first and
  // don't let a missing BOT_TOKEN skip it.
  if (!env.BOT_TOKEN) {
    await Promise.allSettled([
      checkExchangeClosedTrades(env),
      checkPlanExpiryReminders(env),
      checkChurnedPremium(env),
      checkWeeklyDigest(env),
    ]);
    return;
  }

  // Pre-fetch all KV lists once (2 list ops instead of 4)
  const [alertsList, settingsList] = await Promise.all([
    env.ALERTS_KV.list({ prefix: 'alerts:' }),
    env.ALERTS_KV.list({ prefix: 'settings:' }),
  ]);

  // Pre-fetch all data in parallel to minimize individual reads
  const [alertsData, settingsData] = await Promise.all([
    Promise.all(alertsList.keys.map(async (key) => {
      const data = await env.ALERTS_KV.get(key.name, 'json');
      return data ? { kvKey: key.name, ...data } : null;
    })),
    Promise.all(settingsList.keys.map(async (key) => {
      const data = await env.ALERTS_KV.get(key.name, 'json');
      const chatId = key.name.replace('settings:', '');
      return { chatId, settings: { ...DEFAULT_SETTINGS, ...data } };
    })),
  ]);

  const activeAlerts = alertsData.filter((a) => a && a.active);
  const settingsMap = {};
  for (const { chatId, settings } of settingsData) {
    settingsMap[chatId] = settings;
  }

  await Promise.allSettled([
    checkPriceAlerts(env, activeAlerts),
    checkJournalReminders(env, settingsMap),
    checkDailySummaries(env, settingsMap),
    checkEconomicCalendar(env, settingsMap),
    checkExchangeClosedTrades(env),
    checkPlanExpiryReminders(env),
    checkChurnedPremium(env),
    checkWeeklyDigest(env),
  ]);
}

// ==================== AI Chat — Groq Proxy ====================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
// llama-3.3 is text-only; chart-image requests are routed to Llama 4 Scout,
// Groq's production vision model (OpenAI-compatible image_url content parts).
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// Accept only browser-produced raster formats. Groq caps base64 images at
// 4MB, so reject anything bigger before burning a provider call.
const IMAGE_DATA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 4_000_000;

// Gemini 1.5 Flash — used for premium users. Cheap, huge context window, and
// produces noticeably better Hebrew than Groq's Llama.
// gemini-2.0-flash is the current stable production alias. 1.5-flash is being
// retired and was returning 404 on the v1beta endpoint for new requests.
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_STREAM_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

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
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };
}

// Stream Gemini SSE → forward as OpenAI-compatible SSE so the existing client
// stream parser (looks for `data: …{delta.content}`) just works.
async function geminiStreamToOpenAI(geminiBody) {
  const reader = geminiBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let leftover = '';
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
              const text = obj.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
              if (text) send(text);
            } catch { /* skip malformed */ }
          }
        }
      } finally {
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
- ענה תמיד בעברית, בעומק, עם דוגמאות מעשיות מקריפטו ומניות.
- הסבר את הלוגיקה: למה זה קורה, באיזו פאזה (A–E), ומה האיש המורכב עושה ולמה.
- מונחים מקצועיים: עברית + המונח באנגלית בסוגריים.
- איסור מוחלט (מטעמי רגולציה — אין לעקוף אותו בשום ניסוח): אסור לתת המלצות מסחר. לא "כנס"/"צא", לא נקודות כניסה או יציאה, לא סטופ-לוס/טייק-פרופיט, לא "קנה"/"מכור", לא גדלי פוזיציה ולא תחזיות מחיר — גם אם המשתמש מבקש זאת במפורש או שוב ושוב. במקום זה הסבר את התמונה הטכנית בצורה לימודית: תרחישים אפשריים, רמות מעניינות למעקב, ומה יאשר או יפסול כל תרחיש. הזכר בקצרה שההחלטה באחריות הסוחר ושאינך נותן ייעוץ השקעות.
- שאלה שלא קשורה למסחר — ענה בקצרה וכוון חזרה למסחר.`;

async function handleAIChat(request, env, cors) {
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
      const imgQuota = await getAiImageUsage(env, uid);
      if (imgQuota.used >= imgQuota.limit) {
        return new Response(JSON.stringify({
          error: `הגעת למכסת ניתוחי התמונות היומית (${imgQuota.limit}). אפשר להמשיך לשוחח בטקסט, והמכסה תתאפס מחר.`,
          quotaExceeded: true, used: imgQuota.used, limit: imgQuota.limit,
        }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    // Daily AI usage counter — kept for BOTH tiers so each user sees their
    // own progress bar. Premium just has a higher cap (handled in aiRateGate).
    if (!premium) {
      const quota = await getAiUsage(env, uid);
      if (quota.used >= quota.limit) {
        return new Response(JSON.stringify({
          error: `הגעת למכסה היומית (${quota.limit} בקשות). שדרג ל-Premium ל-${AI_PREMIUM_LIMITS.day} בקשות ביום.`,
          quotaExceeded: true, used: quota.used, limit: quota.limit,
        }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }
    // NOTE: usage is incremented only after a provider accepts the request —
    // a failed/overloaded call must not burn the user's daily quota.

    // Build messages for Groq. Trim history to keep the payload under Groq's
    // tokens-per-minute cap (the old 11K-char system prompt + long Wyckoff
    // replies meant the SECOND question in a minute always blew the TPM limit).
    // Only the image at lastImageIdx (gated above) is forwarded — older ones
    // bloat the payload past the providers' per-request caps.
    const MAX_TURN_CHARS = 2500;
    const apiMessages = [
      { role: 'system', content: WYCKOFF_SYSTEM_PROMPT },
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
          body: JSON.stringify({ model: hasImage ? GROQ_VISION_MODEL : GROQ_MODEL, messages: apiMessages, temperature: 0.7, max_tokens: 1500, stream: true, stream_options: { include_usage: true } }),
        });
        const delays = [0, 2000, 4000]; // immediate, +2s, +4s = ~6s total worst-case
        let groqFallback;
        for (const wait of delays) {
          if (wait) await new Promise((r) => setTimeout(r, wait));
          groqFallback = await callGroq();
          if (groqFallback.ok) {
            await incrementAiUsage(env, uid);
            if (hasImage) await incrementAiImageUsage(env, uid);
            return new Response(meterStream(env, groqFallback.body, { hasImage }), { headers: sseHeaders });
          }
          if (groqFallback.status !== 429) break; // non-retryable
        }
        const fbErrText = await groqFallback.text().catch(() => '');
        console.error('Groq fallback also failed:', groqFallback.status, fbErrText);
        const rateLimited = gemRes.status === 429 || groqFallback.status === 429;
        const friendly = rateLimited
          ? 'שני ספקי ה-AI עמוסים. המתן 10–20 שניות ונסה שוב.'
          : `שגיאת AI: ${gemRes.status}/${groqFallback.status}`;
        // 429 (not 502) for rate limits, so the client's own backoff retries too.
        return new Response(JSON.stringify({
          error: friendly,
          gemini: gemRes.status,
          groq: groqFallback.status,
        }), { status: rateLimited ? 429 : 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      await incrementAiUsage(env, uid);
      if (hasImage) await incrementAiImageUsage(env, uid);
      return new Response(meterStream(env, await geminiStreamToOpenAI(gemRes.body), { hasImage }), { headers: sseHeaders });
    }

    // Free tier (or premium without a Gemini key configured) → Groq, with
    // retries: the shared key has tight per-minute token limits, so back off
    // and retry inside the worker (worst case ~7.5s) before surfacing an error.
    const callGroq = () => fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: hasImage ? GROQ_VISION_MODEL : GROQ_MODEL,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1500,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    let groqResponse;
    for (const wait of [0, 2500, 5000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      groqResponse = await callGroq();
      if (groqResponse.ok) {
        await incrementAiUsage(env, uid);
        if (hasImage) await incrementAiImageUsage(env, uid);
        return new Response(meterStream(env, groqResponse.body, { hasImage }), { headers: sseHeaders });
      }
      if (groqResponse.status !== 429) break; // non-retryable
    }

    const errText = await groqResponse.text().catch(() => '');
    console.error('Groq API error:', groqResponse.status, errText);
    // 429 (not 502) for rate limits, so the client's own backoff retries too.
    const rateLimited = groqResponse.status === 429;
    return new Response(
      JSON.stringify({ error: rateLimited ? 'ספק ה-AI עמוס כרגע, נסה שוב בעוד רגע' : `שגיאת AI: ${groqResponse.status}` }),
      { status: rateLimited ? 429 : 502, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('AI Chat error:', err);
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
- אסור: תחזיות מחיר, "בוליש/בריש", פסיכולוגיה כללית, פתיחות שיווקיות, אזכור שאתה AI, סלוגנים.
- אסור להמציא נתונים — השתמש רק במה שמופיע ב-stats.
- בלי משפט פתיחה ("הנה ניתוח..."). תתחיל ישר בשורה: **חוזקות**.

## איכות התוכן:
- כל בולט קצר, ענייני, מסתמך על מספר אחד לפחות מה-stats.
- המלצות = פעולה ספציפית למסחר ("הפסק לסחור [מטבע] עד שתבקטסט [תנאי]"), לא טיפים גנריים ("התנהל בזהירות").
- אל תחזור על נתון שכבר הצגת בסעיף קודם.`;

async function handleAICoach(request, env, cors) {
  try {
    const body = await request.json().catch(() => ({}));
    const { stats, depth = 'short' } = body || {};
    if (!stats || typeof stats !== 'object') {
      return new Response(JSON.stringify({ error: 'Missing stats' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    // Hard cap stats payload to keep the prompt cheap.
    const statsStr = JSON.stringify(stats).slice(0, 6000);

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
      await env.ALERTS_KV.put(monthKey, String(used + 1), { expirationTtl: 60 * 60 * 24 * 60 });
    }

    const userPrompt =
      (premium && depth === 'deep' ? 'יבוקש דו"ח Premium מורחב.\n' : 'יבוקש דו"ח קצר.\n') +
      `נתוני העסקאות (JSON):\n\`\`\`json\n${statsStr}\n\`\`\``;

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: COACH_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: premium && depth === 'deep' ? 1400 : 700,
      }),
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '');
      console.error('Coach groq error:', groqRes.status, errText);
      return new Response(JSON.stringify({ error: groqRes.status === 429 ? 'ה-AI עמוס כרגע, נסה שוב בעוד רגע' : `שגיאת AI: ${groqRes.status}` }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
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

    // Free-tier daily quota.
    if (!premium) {
      const quota = await getAiUsage(env, uid);
      if (quota.used >= quota.limit) {
        return new Response(JSON.stringify({
          error: `הגעת למכסה היומית (${quota.limit} בקשות). שדרג ל-Premium לשימוש ללא הגבלה.`,
          quotaExceeded: true, used: quota.used, limit: quota.limit,
        }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // NOTE: quota is incremented only AFTER a successful provider response
      // (below), mirroring /ai-chat — a failed Groq call must not burn the
      // user's daily quota.
    }

    const userPrompt = `כתוב מאמרון על הפרויקט שמאחורי המטבע ${coinName}${symbol ? ` (${String(symbol).toUpperCase()})` : ''}.`;

    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: PROJECT_DESC_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 900,
        stream: false,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errText);
      return new Response(JSON.stringify({ error: groqResponse.status === 429 ? 'ספק ה-AI עמוס כרגע, נסה שוב בעוד רגע' : `שגיאת AI: ${groqResponse.status}` }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const data = await groqResponse.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Charge the daily quota only now that the provider succeeded.
    if (!premium) await incrementAiUsage(env, uid);

    return new Response(JSON.stringify({ text }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('AI Project Description error:', err);
    return new Response(JSON.stringify({ error: 'שגיאה פנימית' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
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

    // Resolve dev chat ID — from secret or by looking up DEV_UID in KV
    let devChatId = env.DEV_CHAT_ID || null;
    if (!devChatId && env.DEV_UID) {
      devChatId = await env.ALERTS_KV.get(`uid:${env.DEV_UID}`).catch(() => null);
    }
    if (!devChatId) {
      console.error('Contact: no dev chat ID — DEV_CHAT_ID secret missing and no uid:DEV_UID in KV');
      return new Response(
        JSON.stringify({ error: 'הנמען לא מוגדר במערכת. פנה למפתח להגדיר DEV_CHAT_ID או לחבר את הטלגרם של המפתח.' }),
        { status: 503, headers: jsonHeaders },
      );
    }

    // Look up user's Telegram chatId + @username (if connected)
    let userChatId = null;
    let userUsername = null;
    try {
      const stored = await env.ALERTS_KV.get(`uid:${uid}`);
      if (stored) userChatId = stored;
      if (userChatId) userUsername = await env.ALERTS_KV.get(`tgusername:${userChatId}`);
    } catch { /* ignore */ }

    // Optional display info from client (not trusted for security, just UI)
    const clientName = typeof body.displayName === 'string' ? body.displayName : null;

    // Build HTML message
    const name = escapeHtml(clientName || tokenName || 'משתמש ללא שם');
    const mail = escapeHtml(tokenEmail || '—');
    const safeUid = escapeHtml(uid);
    // Prefer a t.me/<username> link (always opens a chat). Fall back to the
    // tg://user?id= deep link + raw id when the user has no @username.
    let telegramLine;
    if (userUsername) {
      telegramLine = `<a href="https://t.me/${escapeHtml(userUsername)}">פתח שיחה 💬</a> (@${escapeHtml(userUsername)})`;
    } else if (userChatId) {
      telegramLine = `<a href="tg://user?id=${escapeHtml(userChatId)}">פתח שיחה 💬</a> (ID: <code>${escapeHtml(userChatId)}</code>) — ללא שם משתמש, ייתכן שלא ייפתח`;
    } else {
      telegramLine = 'לא מחובר';
    }
    const safeBody = escapeHtml(message);

    const text =
      `📨 <b>הודעה חדשה מ-TradeOS</b>\n\n` +
      `👤 <b>שם:</b> ${name}\n` +
      `📧 <b>מייל:</b> ${mail}\n` +
      `🆔 <b>UID:</b> <code>${safeUid}</code>\n` +
      `💬 <b>טלגרם:</b> ${telegramLine}\n\n` +
      `📝 <b>הודעה:</b>\n${safeBody}`;

    // Send via Telegram — if BOT_TOKEN missing, proxy to alerts worker
    let result;
    if (env.BOT_TOKEN) {
      result = await sendMessage(env.BOT_TOKEN, devChatId, text);
    } else {
      const proxy = await fetch('https://tradeos-alerts.aviniazov7.workers.dev/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
        body: JSON.stringify(body),
      }).catch((err) => {
        console.error('Contact proxy fetch failed:', err);
        return null;
      });
      if (!proxy) {
        return new Response(
          JSON.stringify({ error: 'שירות הטלגרם זמנית לא זמין. הגדר BOT_TOKEN על ה-Worker או ודא שה-proxy worker פעיל.' }),
          { status: 502, headers: jsonHeaders },
        );
      }
      if (!proxy.ok) {
        const errText = await proxy.text().catch(() => '');
        console.error('Contact proxy non-OK response:', proxy.status, errText);
        return new Response(
          JSON.stringify({ error: `שירות הטלגרם החזיר שגיאה (${proxy.status})` }),
          { status: 502, headers: jsonHeaders },
        );
      }
      result = await proxy.json().catch(() => ({ ok: false }));
    }
    if (!result?.ok) {
      console.error('Contact send failed:', result);
      return new Response(JSON.stringify({ error: 'שגיאה בשליחת ההודעה' }), { status: 500, headers: jsonHeaders });
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
  'https://trade-os.aviniazov7.workers.dev',
  'https://trade-os-staging.aviniazov7.workers.dev',
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
      // Optional explicit time window — Binance uses startTime/endTime (ms);
      // Bybit's kline endpoint takes start/end (ms). Forward when present.
      const startTime = searchParams.get('startTime');
      const endTime = searchParams.get('endTime');
      let bybitUrl = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${encodeURIComponent(symbol)}&interval=${byInterval}&limit=${limit}`;
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

  if (request.method === 'POST' && path === '/webhook') return handleWebhook(request, env);

  if (request.method === 'POST' && path === '/telegram/connect-code') {
    // Auth: require a valid token, then issue a short-lived, unguessable connect
    // code that maps to the caller's uid. The bot's /start uses this code (not a
    // raw uid) to link a Telegram chat, so nobody can redirect another user's
    // notifications by guessing their (enumerable) uid.
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    // URL-safe code from crypto.getRandomValues, mapped to base36 [A-Za-z0-9].
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const code = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
    await env.ALERTS_KV.put(`tgconnect:${code}`, uid, { expirationTtl: 900 });
    return new Response(JSON.stringify({ ok: true, code }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (request.method === 'POST' && path === '/daily-stats') {
    try {
      // Auth: require a valid Firebase token; ignore any uid in the body and use
      // the token's uid so a caller can only write their own daily stats.
      const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
      const uid = await verifyFirebaseToken(token);
      if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const { stats } = await request.json();
      if (!stats) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      const chatId = await env.ALERTS_KV.get(`uid:${uid}`);
      if (!chatId) return new Response(JSON.stringify({ error: 'Not connected' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
      await env.ALERTS_KV.put(`dailystats:${chatId}:${getIsraelDateStr()}`, JSON.stringify(stats), { expirationTtl: 172800 });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch { return new Response(JSON.stringify({ error: 'Invalid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  }

  if (request.method === 'POST' && path === '/alerts') {
    // Auth: require a valid token, then ensure the body's chatId is the caller's
    // own chat (uid:{uid} mapping) so users can't create alerts on other chats.
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { chatId, pair, targetPrice, direction, id } = await request.json();
    if (!chatId || !pair || !targetPrice || !direction) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const ownChat = await env.ALERTS_KV.get(`uid:${uid}`);
    if (!ownChat || String(chatId) !== ownChat) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const alertId = id || Date.now().toString();
    await env.ALERTS_KV.put(`alerts:${chatId}:${alertId}`, JSON.stringify({ chatId, pair, targetPrice, direction, active: true, id: alertId, createdAt: new Date().toISOString() }));
    return new Response(JSON.stringify({ ok: true, id: alertId }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (request.method === 'DELETE' && path.startsWith('/alerts/')) {
    // Auth: require a valid token and ensure the {chatId} path segment is the
    // caller's own chat before deleting one of its alerts.
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 3) {
      const ownChat = await env.ALERTS_KV.get(`uid:${uid}`);
      if (!ownChat || parts[1] !== ownChat) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
      await env.ALERTS_KV.delete(`alerts:${parts[1]}:${parts[2]}`); return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  if (request.method === 'GET' && path.startsWith('/alerts/')) {
    // Auth: require a valid token and ensure the {chatId} path segment is the
    // caller's own chat before listing its alerts.
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = await verifyFirebaseToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const chatId = path.split('/')[2];
    const ownChat = await env.ALERTS_KV.get(`uid:${uid}`);
    if (!ownChat || chatId !== ownChat) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const list = await env.ALERTS_KV.list({ prefix: `alerts:${chatId}:` });
    const alerts = [];
    for (const key of list.keys) { const d = await env.ALERTS_KV.get(key.name, 'json'); if (d) alerts.push(d); }
    return new Response(JSON.stringify({ alerts }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (request.method === 'GET' && path.startsWith('/chatid/')) {
    // Auth: require a valid token and ensure the {uid} path segment matches the
    // token's uid so callers can only resolve their own chatId.
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const authUid = await verifyFirebaseToken(token);
    if (!authUid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const uid = path.split('/')[2];
    if (uid !== authUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const chatId = await env.ALERTS_KV.get(`uid:${uid}`);
    if (chatId) return new Response(JSON.stringify({ chatId }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
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

  if (path === '/setup-webhook') {
    // Admin-only + POST-only. Re-registering the webhook uses
    // drop_pending_updates=true, so an unauthenticated caller could repeatedly
    // reset it (dropping queued alerts/connect codes) and read Telegram's raw
    // response. Require an admin Firebase ID token.
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const workerUrl = `${url.protocol}//${url.host}/webhook`;
    let setWebhookUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(workerUrl)}&drop_pending_updates=true`;
    // If the owner set TG_WEBHOOK_SECRET, register it so Telegram sends the
    // X-Telegram-Bot-Api-Secret-Token header (verified in handleWebhook).
    if (env.TG_WEBHOOK_SECRET) setWebhookUrl += `&secret_token=${encodeURIComponent(env.TG_WEBHOOK_SECRET)}`;
    const res = await fetch(setWebhookUrl);
    const json = await res.json();
    // Don't echo Telegram's raw payload — just the success flag.
    return new Response(JSON.stringify({ ok: json.ok === true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // CoinGecko proxy with KV cache (avoids browser rate-limits)
  if (request.method === 'GET' && path.startsWith('/cg/')) {
    const subPath = path.slice(4); // remove '/cg/'
    const cgUrl = `https://api.coingecko.com/api/v3/${subPath}${url.search}`;
    const cacheKey = `cg:${subPath}${url.search}`;
    const ttl = subPath.startsWith('coins/markets') ? 3600 : 300; // 1h for markets, 5m for details/chart
    try {
      const cached = await env.ALERTS_KV.get(cacheKey);
      if (cached) return new Response(cached, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
      // Browser-like UA — CoinGecko's free tier 403s bare server-side fetches
      // from Cloudflare egress IPs but generally serves browser-looking ones.
      const res = await fetch(cgUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      if (!res.ok) return new Response(JSON.stringify({ error: res.status }), { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
      const text = await res.text();
      env.ALERTS_KV.put(cacheKey, text, { expirationTtl: ttl }).catch(() => {});
      return new Response(text, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  // Binance proxy with KV cache (avoids browser CORS/geo issues)
  if (request.method === 'GET' && path.startsWith('/bnb/')) {
    const subPath = path.slice(5); // remove '/bnb/'
    // api.binance.com returns 403 to Cloudflare Worker egress IPs in many
    // regions. data-api.binance.vision is Binance's public market-data mirror
    // (same /api/v3 surface — ticker, klines, depth) and isn't geo-blocked, so
    // we try the main host first and fall back to the vision mirror.
    const BNB_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
    const rawKey = `bnb:${subPath}${url.search}`;
    // KV keys max 512 bytes — hash long keys (e.g. ticker with many symbols) so
    // even large requests stay cached and don't hammer Binance every poll, which
    // was causing repeated 408 timeouts on the journal screen.
    const cacheKey = rawKey.length <= 500 ? rawKey : `bnb:h:${hashStr(rawKey)}`;
    const staleKey = `${cacheKey}:stale`;
    const ttl = 60; // KV minimum TTL is 60s; prices refresh via client polling anyway
    try {
      const cached = await env.ALERTS_KV.get(cacheKey);
      if (cached) return new Response(cached, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });

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
        // serve the last good copy if we have one.
        const stale = await env.ALERTS_KV.get(staleKey);
        if (stale) return new Response(stale, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'STALE' } });
        return new Response(JSON.stringify({ error: lastStatus }), { status: lastStatus || 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      env.ALERTS_KV.put(cacheKey, text, { expirationTtl: ttl }).catch(() => {});
      env.ALERTS_KV.put(staleKey, text, { expirationTtl: 3600 }).catch(() => {});
      return new Response(text, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': res ? 'MISS' : 'BYBIT' } });
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
    const wanted = (url.searchParams.get('symbols') || '')
      .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 60);
    if (!wanted.length) return new Response(JSON.stringify({ error: 'no symbols' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const cacheKey = `cx:${wanted.join(',')}`;
    const staleKey = `${cacheKey}:stale`;
    try {
      const cached = await env.ALERTS_KV.get(cacheKey);
      if (cached) return new Response(cached, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });

      // One call returns every spot ticker; we pick the ones we want.
      const r = await fetch('https://api.bybit.com/v5/market/tickers?category=spot', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) {
        const stale = await env.ALERTS_KV.get(staleKey);
        if (stale) return new Response(stale, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'STALE' } });
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
      env.ALERTS_KV.put(cacheKey, text, { expirationTtl: 60 }).catch(() => {});
      env.ALERTS_KV.put(staleKey, text, { expirationTtl: 3600 }).catch(() => {});
      return new Response(text, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
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

    const cacheKey = `fut:${wanted.join(',')}`;
    const staleKey = `${cacheKey}:stale`;
    try {
      const cached = await env.ALERTS_KV.get(cacheKey);
      if (cached) return new Response(cached, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });

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
        const stale = await env.ALERTS_KV.get(staleKey);
        if (stale) return new Response(stale, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'STALE' } });
        return new Response(JSON.stringify({ error: 'upstream failed' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const text = JSON.stringify(out);
      env.ALERTS_KV.put(cacheKey, text, { expirationTtl: 120 }).catch(() => {});
      env.ALERTS_KV.put(staleKey, text, { expirationTtl: 3600 }).catch(() => {});
      return new Response(text, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
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

  // Contact Developer — private message to dev's Telegram
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
    const l = await env.ALERTS_KV.list({ prefix: `pushexch:${uid}:` });
    const exchanges = l.keys.map((kk) => kk.name.split(':')[2]).filter(Boolean);
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
    } else {
      const l = await env.ALERTS_KV.list({ prefix: `pushexch:${uid}:` });
      for (const kk of l.keys) await env.ALERTS_KV.delete(kk.name);
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

  // Admin-only: a user's Telegram bot link status + usage, for the admin
  // panel's user detail view. Reads only KV (uid↔chat mapping, username,
  // usage counters, alert/watchlist counts) — never the user's Firestore
  // settings subcollection, which is owner-only by design.
  if (request.method === 'GET' && path.startsWith('/admin/telegram/')) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const targetUid = path.slice('/admin/telegram/'.length);
    if (!targetUid) return new Response(JSON.stringify({ error: 'missing uid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const chatId = await env.ALERTS_KV.get(`uid:${targetUid}`);
    if (!chatId) {
      return new Response(JSON.stringify({ ok: true, connected: false }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const [username, usage, alertsList, watchlistRaw] = await Promise.all([
      env.ALERTS_KV.get(`tgusername:${chatId}`),
      env.ALERTS_KV.get(`tgusage:${chatId}`, 'json'),
      env.ALERTS_KV.list({ prefix: `alerts:${chatId}:` }),
      env.ALERTS_KV.get(`watchlist:${chatId}`, 'json'),
    ]);
    return new Response(JSON.stringify({
      ok: true,
      connected: true,
      username: username || null,
      usage: usage || null, // { total, lastUsed, lastCmd } — null until first interaction after rollout
      alertsCount: alertsList.keys.length,
      watchlistCount: Array.isArray(watchlistRaw) ? watchlistRaw.length : null,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
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

  // Coupon share preview. WhatsApp/Telegram crawlers don't run the SPA, so a
  // link straight to the app shows the generic site card. This route handles
  // both audiences:
  //   - Crawlers (WhatsApp/Telegram/Twitter/etc) get HTML with coupon-specific
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
    const isCrawler = !looksLikeBrowser && /WhatsApp\/|TelegramBot|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|SkypeUriPreview|Googlebot|bingbot|Pinterest|redditbot|vkShare|Applebot|bot|crawler|spider/i.test(ua);

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

    appendAudit(env, { kind: 'coupon_redeem', actor: uid, code, days: coupon.days, planExpires: newExpiry });

    // Schedule the expiry reminders and push a confirmation. Both best-effort.
    schedulePlanExpiryReminders(env, uid, newExpiry).catch(() => {});
    sendPushToUser(env, uid, {
      title: '🎉 קוד הקופון מומש בהצלחה',
      body: `קיבלת ${coupon.days} ימי Premium. תוקף עד ${new Date(newExpiry).toLocaleDateString('he-IL')}.`,
      url: '/premium',
      tag: `coupon-${code}-${uid}`,
    }).catch(() => {});

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
  // — never tokens or secrets (getMe exposes just the bot's public username).
  if (request.method === 'GET' && path === '/admin/health') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const adminUid = await verifyAdminFromToken(token);
    if (!adminUid) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const cronRaw = await env.ALERTS_KV.get('cron:last');
    const cronLast = cronRaw ? parseInt(cronRaw, 10) || null : null;
    const bot = { configured: !!env.BOT_TOKEN, ok: false, username: null };
    if (env.BOT_TOKEN) {
      try {
        const r = await fetch(`${TELEGRAM_API}${env.BOT_TOKEN}/getMe`);
        const d = await r.json().catch(() => ({}));
        if (d?.ok) { bot.ok = true; bot.username = d.result?.username || null; }
      } catch { /* unreachable */ }
    }
    return new Response(JSON.stringify({
      time: Date.now(),
      cronLast,
      bot,
      pushConfigured: !!env.VAPID_JWK,
      aiConfigured: !!env.GROQ_API_KEY,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Trade event notifications
  if (request.method === 'POST' && path === '/notify') {
    try {
      // Auth: require a valid token; ignore any uid in the body and use the
      // token's uid so a caller can only notify their own connected chat.
      const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
      const uid = await verifyFirebaseToken(token);
      if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const { type, pair, direction, price, pnl, entryPrice, stopLoss, leverage, positionSize, tps, tpIndex, isLastTp } = await request.json();
      if (!type) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      const chatId = await env.ALERTS_KV.get(`uid:${uid}`);
      if (!chatId) return new Response(JSON.stringify({ error: 'Not connected' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

      const now = new Date();
      const timeStr = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

      const dirEmoji = direction === 'long' ? '↗' : '↘';
      const dirLabel = direction === 'long' ? 'Long' : 'Short';
      const lev = parseFloat(leverage) || 1;
      const entry = parseFloat(entryPrice) || 0;
      const sl = parseFloat(stopLoss) || 0;
      const posSize = parseFloat(positionSize) || 0;

      const pad = (label, val, width = 9) => `${label.padEnd(width)}${val}`;

      const pnlPct = (pnl != null && posSize > 0) ? ((pnl / posSize) * 100).toFixed(2) : null;
      const pnlPctLev = (pnlPct != null && lev > 1) ? (parseFloat(pnlPct) * lev).toFixed(2) : null;
      const pnlSign = pnl >= 0 ? '+' : '';

      const slPct = (entry > 0 && sl > 0)
        ? ((direction === 'long' ? (sl - entry) / entry : (entry - sl) / entry) * 100).toFixed(2)
        : null;

      const tpLines = (tps || []).map((tp, i) => {
        const t = parseFloat(tp);
        if (!t || !entry) return null;
        const pct = ((direction === 'long' ? (t - entry) / entry : (entry - t) / entry) * 100).toFixed(2);
        return pad(`  TP${i + 1}`, `${fmtPrice(t)}  (+${pct}%)`);
      }).filter(Boolean);

      let rr = null;
      if (entry > 0 && sl > 0 && tps?.length > 0) {
        const firstTp = parseFloat(tps[0]);
        if (firstTp > 0) {
          const risk = Math.abs(entry - sl);
          const reward = Math.abs(firstTp - entry);
          if (risk > 0) rr = (reward / risk).toFixed(1);
        }
      }

      let text = '';

      if (type === 'entry') {
        text =
`🟢 <b>POSITION OPENED</b>

<b>${pair}</b>  ${dirLabel} ${dirEmoji}${lev > 1 ? `  <code>${lev}x</code>` : ''}

<code>${pad('Entry', fmtPrice(entry))}
${sl > 0 ? pad('Stop', `${fmtPrice(sl)}${slPct ? `  (${slPct}%)` : ''}`) : ''}${tpLines.length ? '\n' + tpLines.join('\n') : ''}</code>${rr ? `\n\n📐 R:R  <b>${rr}R</b>` : ''}${posSize > 0 ? `\n💼 Size  <b>$${posSize.toLocaleString()}</b>` : ''}

<i>🕐 ${timeStr}</i>`;
      }

      else if (type === 'tp') {
        const tpNum = tpIndex != null ? tpIndex + 1 : '?';
        const status = isLastTp ? '🏁 Position Closed' : `📌 Partial Close — TP${tpNum}`;
        text =
`✅ <b>TAKE PROFIT HIT</b>  TP${tpNum}${isLastTp ? ' 🏁' : ''}

<b>${pair}</b>  ${dirLabel} ${dirEmoji}${lev > 1 ? `  <code>${lev}x</code>` : ''}

<code>${pad('Price', fmtPrice(price))}
${entry > 0 ? pad('Entry', fmtPrice(entry)) : ''}${pnl != null ? `
${pad('P&L', `${pnlSign}$${Math.abs(pnl).toFixed(2)}${pnlPct ? `  (${pnlSign}${pnlPct}%)` : ''}`)}${pnlPctLev ? `
${pad('Lev P&L', `${pnlSign}${pnlPctLev}%`)}` : ''}` : ''}</code>

${status}

<i>🕐 ${timeStr}</i>`;
      }

      else if (type === 'sl') {
        text =
`🔴 <b>STOP LOSS HIT</b>

<b>${pair}</b>  ${dirLabel} ${dirEmoji}${lev > 1 ? `  <code>${lev}x</code>` : ''}

<code>${pad('Stopped', fmtPrice(price))}
${entry > 0 ? pad('Entry', fmtPrice(entry)) : ''}${pnl != null ? `
${pad('Loss', `${pnlSign}$${Math.abs(pnl).toFixed(2)}${pnlPct ? `  (${pnlSign}${pnlPct}%)` : ''}`)}${pnlPctLev ? `
${pad('Lev', `${pnlSign}${pnlPctLev}%`)}` : ''}` : ''}</code>

🔐 Position Closed

<i>🕐 ${timeStr}</i>`;
      }

      else {
        text = `📊 <b>${pair}</b> · ${dirLabel} ${dirEmoji}\n${fmtPrice(price)}\n<i>${timeStr}</i>`;
      }

      await sendMessage(env.BOT_TOKEN, chatId, text);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
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
      const _creds = await resolveExchangeCreds(env, uid, exchange, _body);
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

        const positions = rawList.map(p => {
          const posType = p.positionType ?? p.position_type ?? p.type;
          const sym = (p.symbol || '').replace(/_/g, '');
          // MEXC uses openAvgPrice or holdAvgPrice for average entry
          const entryPrice = parseFloat(p.openAvgPrice || p.open_avg_price || p.holdAvgPrice || p.hold_avg_price) || 0;
          const qty = parseFloat(p.holdVol || p.hold_vol || p.positionAmt || p.vol) || 0;
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
      const _creds = await resolveExchangeCreds(env, uid, exchange, _body);
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
      const _creds = await resolveExchangeCreds(env, uid, exchange, _body);
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
            quantity: parseFloat(p.closeVol || p.close_vol || p.holdVol || p.hold_vol) || 0,
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
        const ohQs = 'category=linear&limit=50';
        const ohSig = await hmac(apiSecret, ohTs + apiKey + recvWindow + ohQs);
        const ohRes = await fetch(`https://api.bybit.com/v5/order/history?${ohQs}`, {
          headers: { 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': ohTs, 'X-BAPI-SIGN': ohSig, 'X-BAPI-RECV-WINDOW': recvWindow },
        });
        const ohData = await ohRes.json().catch(() => ({}));
        const openingOrders = (ohData.retCode === 0 ? (ohData.result?.list || []) : []).filter((o) =>
          o.orderStatus === 'Filled' && o.reduceOnly !== true && parseFloat(o.qty) > 0
        );

        trades = list.map(p => {
          const entryDate = p.createdTime ? new Date(parseInt(p.createdTime)).toISOString() : new Date().toISOString();
          const exitDate = p.updatedTime ? new Date(parseInt(p.updatedTime)).toISOString() : entryDate;
          const fees = Math.abs(parseFloat(p.execFee || p.tradingFee || p.cumExecFee || 0) || 0);
          // Match the opening order: Bybit's closed-pnl `side` is the
          // position side (Buy=long, Sell=short — same convention used in the
          // direction mapping below), and the order that opened the position
          // has that same side. We look for a Filled order with the same
          // symbol+side around the position's createdTime.
          const positionStart = parseInt(p.createdTime) || 0;
          const match = openingOrders.find((o) =>
            o.symbol === p.symbol &&
            o.side === p.side &&
            Math.abs(parseInt(o.createdTime || 0) - positionStart) < 5 * 60 * 1000 // ±5 min
          );
          const stopLoss = match ? (parseFloat(match.stopLoss) || 0) : 0;
          const tp = match ? (parseFloat(match.takeProfit) || 0) : 0;
          return {
            pair: p.symbol,
            direction: p.side === 'Buy' ? 'long' : 'short',
            entryPrice: parseFloat(p.avgEntryPrice || p.entryPrice) || 0,
            exitPrice: parseFloat(p.avgExitPrice || p.exitPrice) || 0,
            quantity: parseFloat(p.qty) || 0,
            leverage: parseFloat(p.leverage) || 1,
            pnlFromExchange: parseFloat(p.closedPnl) || 0,
            fees,
            entryDate,
            exitDate,
            stopLoss,
            tps: tp > 0 ? [tp] : [],
            source: 'bybit',
            externalId: p.orderId || String(p.createdTime || Math.random()),
            session: sessionFromDate(entryDate),
          };
        });
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

  return new Response('TradeOS Bot Worker', { headers: cors });
}

export default {
  fetch: handleRequest,
  scheduled: (event, env) => handleCron(env),
};
