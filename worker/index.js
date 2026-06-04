/**
 * TradeOS Telegram Bot Worker
 * - Webhook handler for interactive Telegram bot
 * - Cron: price alerts, journal reminders, daily summaries, economic calendar
 * - Market data: prices, funding rates, open interest, long/short ratio
 * - Personal watchlist per user
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';
const BINANCE_SPOT = 'https://api.binance.com/api/v3';
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
    const creds = await env.ALERTS_KV.get(k.name, 'json');
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

function decodeUidFromToken(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.user_id || payload.sub || null;
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

// Confirm the caller is an admin by reading their own user doc via Firestore
// REST with their ID token — admin reads are allowed by our rules, so we don't
// need a service account here.
async function verifyAdminFromToken(token) {
  const uid = decodeUidFromToken(token);
  if (!uid || !token) return null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const data = await r.json();
    return data.fields?.role?.stringValue === 'admin' ? uid : null;
  } catch { return null; }
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

async function handleStart(env, chatId, text) {
  const uid = text.split(' ')[1] || null;
  if (uid) {
    await env.ALERTS_KV.put(`user:${chatId}`, JSON.stringify({ uid, chatId, connectedAt: new Date().toISOString() }));
    await env.ALERTS_KV.put(`uid:${uid}`, String(chatId));
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
  const value = parseInt(fg.value);
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
    return handleSetTime(env, chatId, messageId, type, time);
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

async function handleWebhook(request, env) {
  try {
    const update = await request.json();
    if (update.callback_query) { await handleCallback(env, update.callback_query); return new Response('OK'); }
    const message = update.message;
    if (!message) return new Response('OK');
    const chatId = message.chat.id;
    const text = (message.text || '').trim();

    if (text.startsWith('/start')) await handleStart(env, chatId, text);
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
      await env.ALERTS_KV.put(kvKey, JSON.stringify({ ...ad, active: false }));
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
  // Web-push exchange polling is independent of Telegram, so run it first and
  // don't let a missing BOT_TOKEN skip it.
  if (!env.BOT_TOKEN) { await checkExchangeClosedTrades(env).catch(() => {}); return; }

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
  ]);
}

// ==================== AI Chat — Groq Proxy ====================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const WYCKOFF_SYSTEM_PROMPT = `אתה מנטור מסחר מקצועי ומומחה בשיטת ויקוף (Wyckoff Method). תפקידך לעזור לסוחרים להבין ולזהות דפוסי שוק, לנתח גרפים ולשפר את המסחר שלהם.

## מטרות הסוחר לפי ויקוף:
1. שימור הקרן
2. להיות רווחי בעקביות

## 5 השלבים לעסקה מצליחה:
1. קבע מגמה ושלבי בחינה של השוק
2. בחר רק מטבעות בהרמוניה עם השוק וחוזקה/חולשה יחסית
3. בחר מטבע עם סיבה שתיתן אפקט צפוי בהסתברות גבוהה
4. קבע את מוכנות המטבע להגיב לסיבה שמצאת
5. תזמן כניסה בהיפוך ובסנכרון מול השוק

## שלושת חוקי ויקוף:

### חוק 1 — ביקוש והיצע (Supply & Demand):
כשהביקוש גדול מההיצע — המחיר עולה. כשההיצע גדול מהביקוש — המחיר יורד. הסוחר מזהה את יחסי הכוחות בעזרת ניתוח המחיר והווליום על ציר הזמן.

### חוק 2 — סיבה ותוצאה (Cause & Effect):
ככל שהסיבה (טווח הדשדוש) גדולה יותר, כך התוצאה (המגמה) תהיה גדולה יותר. מבוסס על חוק ניוטון השלישי. ניתוח סיבה ותוצאה נעשה בעזרת גרף Point & Figure.

### חוק 3 — מאמץ מול תוצאה (Effort vs Result):
הווליום (מאמץ) צריך להתאים לתנועת המחיר (תוצאה). סטייה = סימן מקדים לשינוי כיוון.
- volume גבוה + נרות צרים + אין שיאים חדשים = הרבה מאמץ ותוצאה דלה → יציאת כסף חכם → היפוך צפוי
- כל עוד מחיר נע בהרמוניה עם הווליום — סבירות גבוהה שהמגמה תישמר

## האיש המורכב (Composite Man):
ויקוף הציע להתייחס לשוק כאילו אדם אחד ("האיש המורכב") יושב מאחורי הקלעים ומזיז את השוק. הוא מנער ידיים חלשות, מפעיל מניפולציות, ובונה פוזיציות. הבנת פעולותיו מאפשרת לזהות טרנדים ולקבל החלטות מסחר.

## מחזור ויקוף:
המחיר נע במחזוריות בין 4 מצבים: Accumulation (איסוף) → Mark Up (עלייה) → Distribution (פיזור) → Mark Down (ירידה). מצבי קיצון הם קניות/מכירות יתר, בהם הכסף החכם אוסף/מפזר סחורה. הרגשות (פחד → פאניקה, תקווה → אופוריה) מניעים את המחזור.

## מילון מושגים מלא:

### פאזה A — עצירת המגמה הקודמת:
- **PS (Preliminary Support)** — תמיכה ראשונית: נקודת עצירה ראשונית בירידה, volume עולה, סימן מוקדם לסיום הירידה
- **PSY (Preliminary Supply)** — היצע ראשוני: נקודת עצירה ראשונית בעלייה, volume עולה, סימן שהעלייה עשויה להיחלש
- **SC (Selling Climax)** — מיצוי מוכרים: שיא מכירות עם volume קיצוני, הכסף החכם קונה מהציבור, מגדיר תחתית TR
- **BC (Buying Climax)** — מיצוי קונים: שיא קניות מוגזמות עם volume גבוה, המחיר מגיע להתנגדות, הגופים הגדולים מוכרים
- **AR (Automatic Rally/Reaction)** — תגובה אוטומטית: תגובה טבעית נגדית אחרי SC/BC, מגדירה גבול TR
- **ST (Secondary Test)** — בדיקה משנית: בדיקה חוזרת של SC/BC עם volume נמוך יותר, מאשרת רמות קריטיות

### פאזה B — בניית הסיבה:
- **STB (Secondary Test in Phase B)** — בדיקה משנית בפאזה B: בדיקת התנגדות/תמיכה בתוך הדשדוש לבחינת עוצמת הכוחות
- **UT (Upthrust)** — פריצת שווא למעלה: פריצת שווא מעל ההתנגדות וחזרה לטווח, בוחנת חוזק קונים. חייב לפרוץ אגרסיבית ולחזור אגרסיבית ולהשאיר זנב
- **UTA (Upthrust Action)** — פריצת שווא בפאזה B: חייב לפרוץ את הקריק אגרסיבית ולחזור אגרסיבית ולהשאיר זנב
- **CREEK** — נחל (היצע): תבנית התנגדות הדרגתית, מסמן את המאמץ לפרוץ רמה ואת ההיצע בתהליך
- **ICE** — קרח (ביקוש): רמת תמיכה אופקית, שבירתה מובילה לירידה משמעותית

### פאזה C — הבדיקה (השלב הקצר ביותר):
- **Spring** — קפיצה: שבירת שווא מתחת לתמיכה וחזרה חדה לטווח. מלכודת דובים, לקיחת נזילות. volume נמוך = Spring מוצלח
- **UTAD (Upthrust After Distribution)** — פריצת שווא אחרי פיזור: פריצת שווא מעל התנגדות TR, לוכדת קונים. פורצת אגרסיבית ומתרסקת
- **TUT (Terminal Thrust Up)** — ניעור דשדוש מחוץ לטווח למעלה: מנער שורטיסטים
- **TSO (Terminal Shake Out)** — ניעור דשדוש מחוץ לטווח למטה: מנער לונגיסטים
- **Test** — מבחן: בדיקה מכוונת של תמיכה/התנגדות, מאשרת כיוון עתידי. בדיקה מוצלחת = שפל גבוה יותר בvolume נמוך

### פאזה D — הכרעת המנצח:
- **SOS (Sign of Strength)** — סימן חוזקה: עלייה חדה בvolume ובמחיר, שפלים/שיאים עולים, מעבר למגמה עולה
- **SOW (Sign of Weakness)** — סימן חולשה: ירידה חדה בvolume ובמחיר, שפלים/שיאים יורדים, ההיצע דומיננטי
- **LPS (Last Point of Support)** — נקודת תמיכה אחרונה: הנסיגה האחרונה אחרי SOS, volume נמוך, נקודת כניסה אידיאלית ללונג
- **LPSY (Last Point of Supply)** — נקודת היצע אחרונה: העלייה האחרונה לפני ירידה, עלייה חלשה בvolume נמוך, נקודת כניסה אידיאלית לשורט
- **JAC (Jump Across the Creek)** — קפיצה מעבר לקריק: פריצת התנגדות משמעותית, מעבר לשלב Mark Up
- **BUTTC (Back Up to the Creek)** — חזרה לקריק: חזרה לתמיכה אחרי פריצה, אישור הפריצה
- **BU (Backup)** — גיבוי: חזרה אחורה של המחיר לאחר SOS לבדיקת היצע נוסף. "קפיצה מעבר לנחל" ואז "חזרה לנחל"
- **FTI (First Time Breaking the Ice)** — שבירה ראשונה של הקרח: שבירת התמיכה (ICE), מעבר לשלב דובי
- **RBTI (Return Back to the Ice)** — חזרה לקרח: חזרה לתמיכה אחרי שבירה, אישור השבירה

### פאזה E — יציאה למגמה:
- **MU (Mark Up)** — שוק בעלייה: מגמה שורית ברורה אחרי איסוף. ניעורים קצרים
- **MD (Mark Down)** — שוק בירידה: מגמה דובית ברורה אחרי פיזור

## מודל איסוף (Accumulation) — 5 פאזות:

### Phase A — עצירת הירידה:
PS → SC (volume גבוה, מעבר מטבעות מידיים חלשות לחזקות) → AR (סגירת שורטים, קונים מוסדיים) → ST (אישור אזור SC). שלבי SC,AR,ST יוצרים גבולות הדשדוש.

### Phase B — בניית הסיבה (הארוך ביותר):
המוסדיים אוספים סחורה בחלק התחתון של התעלה. יכול לקחת ימים עד שנים. ככל שהאיסוף ארוך יותר — יותר ST. ב-ST הראשונים צפוי volume דומה ל-SC. עשוי להופיע UTA (פריצת שווא). בסיום שלב B — החלשות מוכרים.

### Phase C — בדיקה (הקצר ביותר):
המוסדיים בודקים אם יש ביקוש. Spring (שבירת שווא של הקרח וחזרה לטווח) = מלכודת דובים, ניעור ידיים חלשות. אחרי ההיפוך נרצה SOS ואחריו LPS עם volume גבוה.

### Phase D — הוכחת שליטת קונים:
נרות שוריים עם volume גבוה → SOS (פריצת TR) → BU (חזרה לאישור). LPS ניתן לאתר גם בשלב זה.

### Phase E — יציאה למגמה עולה:
המחיר עוזב את הדשדוש. קונים בשליטה מלאה. ניעורים קצרים. הכסף החכם עשוי לפתוח "איסוף מחדש" (Re-Accumulation) — דשדוש צר יותר ותהליכים מהירים יותר.

## מודל פיזור (Distribution) — 5 פאזות:

### Phase A — עצירת העלייה:
PSY → BC (הגופים הגדולים מוכרים לציבור ברגע של חדשות טובות) → AR (תנודת מכירה, גבול תחתון) → ST (בדיקת BC). מגמת עלייה עשויה להסתיים גם ללא BC — מיצוי הדרגתי בביקוש.

### Phase B — בניית סיבה לירידה:
מוסדות נפטרים ממלאי ארוך ופותחים שורטים. האיזון עובר מביקוש להיצע.

### Phase C — מבחן סופי:
UT או UTAD — מלכודת שוורים. נראה כחידוש עלייה אבל נועד למכור לקונים "טיפשים". UTAD גורם לשורטיסטים לכסות ולמסור מטבעות. לעיתים המחיר לא מגיע ל-BC/ST — UT בגובה נמוך יותר.

### Phase D — שליטת מוכרים:
הביקוש כמעט נעלם, ההיצע שולט. שבירת תמיכה או ירידה מתחת לאמצע TR. עצרות חלשות (LPSY) = הזדמנויות לשורט.

### Phase E — יציאה למגמה יורדת:
שבירת SOW, בדיקת שבירה עם עלייה שנכשלת = הזדמנות שורט. אחרי ירידה משמעותית — ייתכן Re-Distribution (פיזור מחדש).

## Springs & Shakeouts:
- **Springs**: המחיר יורד מתחת לנמוך TR (ICE/CREEK) ומתהפך חזרה. מאפשר למוסדיים לקנות בזול
- **Shakeouts**: ירידה מהירה שגורמת ללונגיסטים למכור. קנייה בזול לפני עלייה
- שניהם אינם חובה אך משפיעים על התהליך
- לSpring עשויות להיות בדיקות נוספות. בדיקה מוצלחת = שפל גבוה יותר בvolume נמוך

## סכמות מתקדמות:

### 4 סכמות איסוף:
1. **Accumulation 1** — קלאסי עם Spring: PS→SC→AR→ST→Spring→Test→SOS→BU/LPS
2. **Accumulation 2** — ללא Spring: PS→SC→AR→ST→LPS→SOS→BU/LPS
3. **Accumulation Descending Wedge** — טריז יורד: דשדוש עם שפלים יורדים, Spring בתחתית
4. כל הסכמות עוברות Phase A-E עם אותם עקרונות

### 4 סכמות פיזור:
1. **Distribution 1** — עם UTAD: PSY→BC→AR→ST→UT→UTAD→Test→LPSY→SOW
2. **Distribution 2** — ללא UTAD: PSY→BC→AR→ST→UT in B→LPSY→SOW

### Re-Accumulation (איסוף מחדש):
מתרחש בשלב MU. דומה לאיסוף רגיל אבל דשדוש צר יותר ותהליכים מהירים. מופיע: ST→UT→SOS→BU/LPS→BOS

### Re-Distribution (פיזור מחדש):
מתרחש בשלב MD. דומה לפיזור רגיל. מופיע: ST→UT→LPSY→SOW→BOS

## מבנה שוק (Market Structure):

### סוגי שיאים ושפלים:
- **HH (Higher High)** — שיא גבוה יותר: אישור מגמה עולה
- **HL (Higher Low)** — שפל גבוה יותר: אישור מגמה עולה
- **LH (Lower High)** — שיא נמוך יותר: אישור מגמה יורדת
- **LL (Lower Low)** — שפל נמוך יותר: אישור מגמה יורדת
- **DLH (Decision Lower High)** — שיא נמוך להחלטה: שיא נמוך שמסמן אזור מכירה
- **DLL (Decision Lower Low)** — שפל נמוך להחלטה

### שבירות מבנה:
- **BOS (Break of Structure)** — שבירת מבנה: פריצה שמאשרת המשך מגמה
- **MSB (Market Structure Break)** — שבירת מבנה שוק: שינוי כיוון המגמה
- **MBOS** — שבירה בהקשר Re-Accumulation
- **MSOW** — סימן חולשה בהקשר Re-Distribution

## נקודות החלטה (Decision Points):
- **DP (Decision Point)** — נקודת החלטה: אזור שבו צפויה תגובת מחיר
- **OB (Order Block)** — אורדר בלוק: אזור שבו מוסדיים ביצעו פקודות גדולות
- **OBIM (Order Block Imbalance)** — חוסר איזון באורדר בלוק

### 6 שלבים לכניסה לעסקה:
1. נתח Market Structure בטיימפריימים גבוהים (W/D/H4)
2. מצא את המבנה הבא הצפוי (למשל LH)
3. מצא OB או OBIM בתוך DP בטיימפריים גבוה
4. עבור לטיימפריים נמוך, נתח מבנה, חפש OBIM
5. אחרי BOS ב-M5-M1, חפש OBIM לכניסה
6. צפה במחיר ב-LTF וחכה לכניסה (אפשר pending order)

## Price Approaching (PA) — גישת מחיר:
PA הוא מאפיין של המחיר לפני הגעה לנקודת החלטה. סימפטום שמאשר שה-DP תקף.
**כלל: NO PA = NO GO!** עם PA הסיכון ~30%. ללא PA הסיכון 60-70%.

### 4 סוגי PA:
1. **Flippy** — היפוך: אזור שבו מגמה מקומית מתהפכת. התעלם מכל מה שמתחת ל-Flippy
2. **Distribution/Accumulation** — דפוס פיזור/איסוף לפני הגעה ל-DP
3. **Diamond** — דפוס יהלום: התכנסות ופריצה
4. **CPLQ (Compression Liquidity)** — דחיסת נזילות: התכנסות הדרגתית לפני פריצה עוצמתית

## תורת הגלים (Wave Theory):
- ראה את השוק כקווים ולא נרות
- מחזור גלים = 5 תנועות (3 אימפולסים + 2 תיקונים)
- אחרי מחזור שלם מתחיל מחזור חדש
- בתוך גל אחד ניתן לראות מחזור שלם ב-LTF
- ודא שכל TF מתואם
- גל 4-5 + תיקון ABC = דפוסי הרמוניק
- השוק פרקטלי — גלים בתוך גלים בטיימפריימים קטנים

## מושגים מתקדמים:

### WB (Weakening Base) — בסיס נחלש:
מתרחש לפני SDE. ה-SD (Supply/Demand) מקבל דחיות מרובות, הראש יורד (SDP), וה-PA יהיה Accumulation.

### SDP (Successful Decision Point):
DP שהחזיק את המחיר בהצלחה — המחיר נכשל ליצור HH חדש.

### SDE (Supply/Demand Engulf):
DP שנבלע — המחיר פרץ דרכו.

### SGB (Supply Gone Bad):
אזור היצע שנכשל — הפך לביקוש או להיפך.

### FTR (Failed to Return):
המחיר נכשל לחזור לאזור DP — סימן חוזק/חולשה.

### 3 Drive Pattern:
3 דחיפות עם BOS. סכמה: 1→2→3→BOS. בdrive 3 ה-SGB מופיע עם Flippy Area.

### כלל 90%:
HH עם Origin of DP → Sell Zone → Flippy → LL. התעלם מ-DP מתחת ל-Flippy (Fake DP).

### Sig Demand (Significant Demand):
ביקוש משמעותי שגורם לתגובה חזקה (Reaction By Rejection).

## PO3 (Power of 3):
מבנה AMD: **A**ccumulation → **M**anipulation → **D**istribution
- בוליש: A→M (ירידה, sweep)→D (עלייה)
- בריש: A→D (עלייה, sweep)→M (ירידה)
- ניתן לזהות ברמת R1/R2/R3

## Compression & CPLQ:
- **Compression (CP)** — התכנסות: המחיר נדחס לטווח צר לפני פריצה
- **CPLQ** — דחיסת נזילות: התכנסות עם לקיחת נזילות. מופיע לפני תנועה חזקה

## MPL & QML:
- **MPL (Minor Price Level)** — רמת מחיר משנית: נקודת ציר קטנה
- **QML (Quasimodo Level)** — רמת קוואסימודו: HH→H→LL או LL→L→HH. רמה חזקה מאוד
- Advanced QML כולל FOZ (Flip Over Zone), CPLQ, ו-MPL

### SRF & RSF:
- **SRF (Support Resistance Flip)** — תמיכה שהפכה להתנגדות
- **RSF (Resistance Support Flip)** — התנגדות שהפכה לתמיכה

### FTB (First Time Back):
חזרה ראשונה לאזור שנפרץ — הזדמנות כניסה.

## ניתוח Volume:
- Volume גבוה + מחיר עולה = ביקוש חזק (בוליש)
- Volume גבוה + מחיר יורד = היצע חזק (בריש)
- Volume נמוך + מחיר עולה = עלייה חלשה, ייתכן היפוך
- Volume נמוך + מחיר יורד = ירידה חלשה, ייתכן היפוך
- Volume spike + מחיר לא זז = ספיגה (absorption) — שינוי ידיים

## הנחיות תשובה:
- ענה תמיד בעברית
- תן הסברים מעמיקים ומפורטים
- השתמש בדוגמאות מעשיות מעולם הקריפטו והמניות
- הסבר את הלוגיקה מאחורי כל תופעה — למה זה קורה ומה זה אומר
- השתמש בביטויים מקצועיים (בעברית + מונח אנגלי בסוגריים)
- כשמתארים תהליך — ציין באיזו פאזה (A-E) מדובר
- אם שואלים שאלה שלא קשורה לויקוף או מסחר, ענה בקצרה וכוון חזרה למסחר
- אל תמליץ על מטבעות ספציפיים לקנייה/מכירה
- הסבר תמיד בהקשר של "האיש המורכב" — מה הוא עושה ולמה`;

async function handleAIChat(request, env, cors) {
  try {
    // Parse request
    const { messages } = await request.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing messages' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Extract UID from Firebase ID token for rate limiting
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    let uid = 'anonymous';
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        uid = payload.user_id || payload.sub || 'anonymous';
      } catch { /* use anonymous */ }
    }

    if (uid === 'anonymous') {
      return new Response(JSON.stringify({ error: 'יש להתחבר כדי להשתמש בצ׳אט' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Rate limiting — 20 requests per minute per user
    const rlKey = `ratelimit:ai:${uid}`;
    const rlData = await env.ALERTS_KV.get(rlKey, 'json');
    const now = Date.now();
    if (rlData && now - rlData.start < 60000) {
      if (rlData.count >= 20) {
        return new Response(JSON.stringify({ error: 'המערכת עמוסה. המתן כמה שניות ונסה שוב.' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      await env.ALERTS_KV.put(rlKey, JSON.stringify({ start: rlData.start, count: rlData.count + 1 }), { expirationTtl: 120 });
    } else {
      await env.ALERTS_KV.put(rlKey, JSON.stringify({ start: now, count: 1 }), { expirationTtl: 120 });
    }

    // Daily quota — 20 requests per Israel day. Marked with quotaExceeded so
    // the client knows not to retry (unlike the transient per-minute limit).
    const quota = await getAiUsage(env, uid);
    if (quota.used >= quota.limit) {
      return new Response(JSON.stringify({
        error: `הגעת למכסה היומית (${quota.limit} בקשות). תוכל להמשיך מחר.`,
        quotaExceeded: true, used: quota.used, limit: quota.limit,
      }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    await incrementAiUsage(env, uid);

    // Build messages for Groq
    const apiMessages = [
      { role: 'system', content: WYCKOFF_SYSTEM_PROMPT },
      ...messages.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text,
      })),
    ];

    // Call Groq API with streaming
    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errText);
      return new Response(JSON.stringify({ error: groqResponse.status === 429 ? 'ספק ה-AI עמוס כרגע, נסה שוב בעוד רגע' : `שגיאת AI: ${groqResponse.status}` }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Stream SSE response back to client
    return new Response(groqResponse.body, {
      headers: {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('AI Chat error:', err);
    return new Response(JSON.stringify({ error: 'שגיאה פנימית' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}

// ==================== AI Project Description ====================

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
    if (!coinName) {
      return new Response(JSON.stringify({ error: 'Missing coinName' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Extract UID from Firebase ID token for rate limiting
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    let uid = 'anonymous';
    let authFailReason = '';
    if (!token) {
      authFailReason = 'no-token';
    } else {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) {
          authFailReason = 'malformed-jwt';
        } else {
          let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          const payload = JSON.parse(atob(b64));
          uid = payload.user_id || payload.sub || 'anonymous';
          if (uid === 'anonymous') authFailReason = 'no-user-id';
        }
      } catch (e) {
        authFailReason = `decode-error: ${e.message}`;
      }
    }

    if (uid === 'anonymous') {
      return new Response(JSON.stringify({ error: 'יש להתחבר כדי להשתמש בתכונה זו', reason: authFailReason }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Rate limiting — 20 requests per minute per user (shared bucket with /ai-chat)
    const rlKey = `ratelimit:ai:${uid}`;
    const rlData = await env.ALERTS_KV.get(rlKey, 'json');
    const now = Date.now();
    if (rlData && now - rlData.start < 60000) {
      if (rlData.count >= 20) {
        return new Response(JSON.stringify({ error: 'המערכת עמוסה. המתן כמה שניות ונסה שוב.' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      await env.ALERTS_KV.put(rlKey, JSON.stringify({ start: rlData.start, count: rlData.count + 1 }), { expirationTtl: 120 });
    } else {
      await env.ALERTS_KV.put(rlKey, JSON.stringify({ start: now, count: 1 }), { expirationTtl: 120 });
    }

    // Daily quota — shared with /ai-chat
    const quota = await getAiUsage(env, uid);
    if (quota.used >= quota.limit) {
      return new Response(JSON.stringify({
        error: `הגעת למכסה היומית (${quota.limit} בקשות). תוכל להמשיך מחר.`,
        quotaExceeded: true, used: quota.used, limit: quota.limit,
      }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    await incrementAiUsage(env, uid);

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

    let uid = null;
    let tokenEmail = null;
    let tokenName = null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      uid = payload.user_id || payload.sub || null;
      tokenEmail = payload.email || null;
      tokenName = payload.name || null;
    } catch { /* invalid token */ }

    if (!uid) {
      return new Response(JSON.stringify({ error: 'יש להתחבר מחדש' }), { status: 401, headers: jsonHeaders });
    }

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

    // Look up user's Telegram chatId (if connected)
    let userChatId = null;
    try {
      const stored = await env.ALERTS_KV.get(`uid:${uid}`);
      if (stored) userChatId = stored;
    } catch { /* ignore */ }

    // Optional display info from client (not trusted for security, just UI)
    const clientName = typeof body.displayName === 'string' ? body.displayName : null;

    // Build HTML message
    const name = escapeHtml(clientName || tokenName || 'משתמש ללא שם');
    const mail = escapeHtml(tokenEmail || '—');
    const safeUid = escapeHtml(uid);
    const telegramLine = userChatId
      ? `<a href="tg://user?id=${escapeHtml(userChatId)}">פתח שיחה</a> (ID: <code>${escapeHtml(userChatId)}</code>)`
      : 'לא מחובר';
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
];

async function handleRequest(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
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

  if (request.method === 'POST' && path === '/daily-stats') {
    try {
      const { uid, stats } = await request.json();
      if (!uid || !stats) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      const chatId = await env.ALERTS_KV.get(`uid:${uid}`);
      if (!chatId) return new Response(JSON.stringify({ error: 'Not connected' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
      await env.ALERTS_KV.put(`dailystats:${chatId}:${getIsraelDateStr()}`, JSON.stringify(stats), { expirationTtl: 172800 });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch { return new Response(JSON.stringify({ error: 'Invalid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  }

  if (request.method === 'POST' && path === '/alerts') {
    const { chatId, pair, targetPrice, direction, id } = await request.json();
    if (!chatId || !pair || !targetPrice || !direction) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const alertId = id || Date.now().toString();
    await env.ALERTS_KV.put(`alerts:${chatId}:${alertId}`, JSON.stringify({ chatId, pair, targetPrice, direction, active: true, id: alertId, createdAt: new Date().toISOString() }));
    return new Response(JSON.stringify({ ok: true, id: alertId }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (request.method === 'DELETE' && path.startsWith('/alerts/')) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 3) { await env.ALERTS_KV.delete(`alerts:${parts[1]}:${parts[2]}`); return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } }); }
  }

  if (request.method === 'GET' && path.startsWith('/alerts/')) {
    const chatId = path.split('/')[2];
    const list = await env.ALERTS_KV.list({ prefix: `alerts:${chatId}:` });
    const alerts = [];
    for (const key of list.keys) { const d = await env.ALERTS_KV.get(key.name, 'json'); if (d) alerts.push(d); }
    return new Response(JSON.stringify({ alerts }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (request.method === 'GET' && path.startsWith('/chatid/')) {
    const uid = path.split('/')[2];
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
    const workerUrl = `${url.protocol}//${url.host}/webhook`;
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(workerUrl)}&drop_pending_updates=true`);
    const json = await res.json();
    return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } });
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
      const res = await fetch(cgUrl, { headers: { 'Accept': 'application/json' } });
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
    const bnbUrl = `https://api.binance.com/api/v3/${subPath}${url.search}`;
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
      const res = await fetch(bnbUrl, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        // Transient Binance hiccup (e.g. 408/429) — serve the last good copy if we have one
        const stale = await env.ALERTS_KV.get(staleKey);
        if (stale) return new Response(stale, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'STALE' } });
        return new Response(JSON.stringify({ error: res.status }), { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const text = await res.text();
      env.ALERTS_KV.put(cacheKey, text, { expirationTtl: ttl }).catch(() => {});
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

  // Contact Developer — private message to dev's Telegram
  if (request.method === 'POST' && path === '/contact') {
    return handleContact(request, env, cors);
  }

  if (path === '/health') return new Response(JSON.stringify({ status: 'ok', time: new Date().toISOString() }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  // Web Push — register a browser push subscription for the signed-in user.
  if (request.method === 'POST' && path === '/push/subscribe') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = decodeUidFromToken(token);
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
    const uid = decodeUidFromToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { endpoint } = await request.json().catch(() => ({}));
    if (endpoint) await env.ALERTS_KV.delete(`push:${uid}:${hashStr(endpoint)}`);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Web Push — send a test notification to all of the user's devices.
  if (request.method === 'POST' && path === '/push/test') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = decodeUidFromToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const result = await sendPushToUser(env, uid, {
      title: 'TradeOS 🔔',
      body: 'ההתראות עובדות! תקבל התראה כשנפתחת עסקה חדשה.',
      url: '/profile',
      tag: 'test',
    });
    return new Response(JSON.stringify({ ok: true, ...result, hasVapid: !!env.VAPID_JWK }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Web Push — store read-only exchange keys so the cron can poll the exchange
  // in the background and notify on closed trades / daily summary.
  if (request.method === 'POST' && path === '/push/exchange-register') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = decodeUidFromToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { exchange, apiKey, apiSecret, passphrase } = await request.json().catch(() => ({}));
    if (!exchange || !apiKey || !apiSecret) return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    await env.ALERTS_KV.put(`pushexch:${uid}:${exchange}`, JSON.stringify({ exchange, apiKey, apiSecret, passphrase: passphrase || '' }));
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Web Push — drop stored exchange keys (on disconnect / disable).
  if (request.method === 'POST' && path === '/push/exchange-unregister') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = decodeUidFromToken(token);
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

  // Caller's own AI usage for the current day — used by the progress bar.
  if (request.method === 'GET' && path === '/ai-usage') {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const uid = decodeUidFromToken(token);
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const usage = await getAiUsage(env, uid);
    return new Response(JSON.stringify(usage), { headers: { ...cors, 'Content-Type': 'application/json' } });
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
    return new Response(JSON.stringify(usage), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Trade event notifications
  if (request.method === 'POST' && path === '/notify') {
    try {
      const { uid, type, pair, direction, price, pnl, entryPrice, stopLoss, leverage, positionSize, tps, tpIndex, isLastTp } = await request.json();
      if (!uid || !type) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
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
      const { exchange, apiKey, apiSecret, passphrase } = await request.json().catch(() => ({}));
      if (!apiKey || !apiSecret) return new Response(JSON.stringify({ ok: false, error: 'Missing credentials' }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 });

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
        if (!isOk) return new Response(JSON.stringify({ ok: false, error: data.message || data.msg || 'MEXC API error', raw: data }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 });

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
      const { exchange, apiKey, apiSecret, passphrase } = await request.json().catch(() => ({}));
      if (!exchange || !apiKey || !apiSecret) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing credentials' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
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
    const uid = decodeUidFromToken(token);
    if (!uid) return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!env.MORALIS_API_KEY) return new Response(JSON.stringify({ ok: false, error: 'מעקב ארנקים לא מוגדר בשרת' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    try {
      const { address } = await request.json().catch(() => ({}));
      const isEvm = /^0x[a-fA-F0-9]{40}$/.test(address || '');
      const isSol = !isEvm && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address || '');
      if (!isEvm && !isSol) {
        return new Response(JSON.stringify({ ok: false, error: 'כתובת ארנק לא תקינה (EVM 0x... או Solana)' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const mHeaders = { 'X-API-Key': env.MORALIS_API_KEY, accept: 'application/json' };

      // ---- Solana ----
      if (isSol) {
        const sol = 'https://solana-gateway.moralis.io';
        const pRes = await fetch(`${sol}/account/mainnet/${address}/portfolio`, { headers: mHeaders });
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
      const { exchange, apiKey, apiSecret, passphrase, limit = 50, days = 0, debug = false } = await request.json();
      if (!exchange || !apiKey || !apiSecret) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
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
