import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import { createMemoryQuotaNamespace } from './aiQuotaActor.js';
import { translationSource, trBucketKey } from './newsTranslateCache.js';

// News translation, coin project descriptions and the coach all spend the
// same TradeAI quota. A spent quota must not reach the provider. A failed
// provider call refunds the slot. The old free coach counter (5/month) does not.

const PROJECT = 'tradeos-91a58';
let privateKey;
let publicJwk;
let restoreFetch = () => {};
const groq = { calls: 0, status: 200, body: null, throw: false };

function israelDate() {
  const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function b64url(bytes) {
  let bin = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function firebaseToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    sub: uid,
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    iat: now,
    exp: now + 3600,
  })));
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data));
  return `${header}.${payload}.${b64url(sig)}`;
}

function memoryKv(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(key, type) {
      if (!store.has(key)) return null;
      const raw = store.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
    async list() { return { keys: [] }; },
  };
}

function envFor(kv) {
  return {
    ALERTS_KV: kv,
    GROQ_API_KEY: 'test-key',
    AI_QUOTA: createMemoryQuotaNamespace({ kv }),
  };
}

function planFlag(premium) {
  return JSON.stringify({ p: premium ? 1 : 0, exp: null });
}

function quotaDoc(u, extra = {}) {
  return JSON.stringify({ date: israelDate(), u, i: 0, m: null, h: null, d: null, ...extra });
}

function hebrewTranslation(id = 0) {
  return JSON.stringify({ items: [{ id, title: 'ביטקוין עולה', desc: '' }] });
}

async function post(env, uid, path, body) {
  const token = await firebaseToken(uid);
  return worker.fetch(new Request(`https://tradeos.test${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://tradeoslive.web.app',
    },
    body: JSON.stringify(body),
  }), env);
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  publicJwk.kid = 'test-kid';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
});

afterEach(() => {
  restoreFetch();
  restoreFetch = () => {};
  groq.calls = 0;
  groq.status = 200;
  groq.body = null;
  groq.throw = false;
  vi.restoreAllMocks();
});

function installFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('securetoken@system.gserviceaccount.com')) {
      return Response.json({ keys: [publicJwk] });
    }
    if (u.includes('api.groq.com')) {
      groq.calls += 1;
      if (groq.throw) throw new Error('network down');
      const body = groq.body || (groq.status === 200
        ? { choices: [{ message: { content: hebrewTranslation() } }] }
        : { error: 'no' });
      return new Response(JSON.stringify(body), { status: groq.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  };
  restoreFetch = () => { globalThis.fetch = real; };
}

function used(kv, uid) {
  const raw = kv.store.get(`aiq:${uid}`);
  return raw ? JSON.parse(raw).u : 0;
}

describe('shared TradeAI quota', () => {
  it('serves a cached news translation without calling the model or charging', async () => {
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'news-cache-user';
    const title = 'Bitcoin ETF inflows hit a record';
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(translationSource(title, '')));
    const hash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
    const kv = memoryKv({
      [`planflag:${uid}`]: planFlag(false),
      [trBucketKey(israelDate())]: JSON.stringify({ [hash]: { title: 'תזרימי ETF', desc: '' } }),
    });

    const res = await post(envFor(kv), uid, '/news/translate', { items: [{ title, desc: '' }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ items: [{ title: 'תזרימי ETF', desc: '' }] });
    expect(groq.calls).toBe(0);
    expect(used(kv, uid)).toBe(0);
  });

  it('charges a news translation and does not call the model when the free quota is spent', async () => {
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'news-free-ok';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(false) });
    const env = envFor(kv);
    const ok = await post(env, uid, '/news/translate', { items: [{ title: 'Bitcoin rises on ETF demand', desc: '' }] });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.items?.[0]?.title).toBe('ביטקוין עולה');
    expect(body.quotaExceeded).toBeUndefined();
    expect(used(kv, uid)).toBe(1);
    expect(groq.calls).toBe(1);

    const spentUid = 'news-free-spent';
    const spentKv = memoryKv({
      [`planflag:${spentUid}`]: planFlag(false),
      [`aiq:${spentUid}`]: quotaDoc(20),
    });
    groq.calls = 0;
    const spent = await post(envFor(spentKv), spentUid, '/news/translate', {
      items: [{ title: 'Ethereum fees fall', desc: '' }],
    });
    expect(spent.status).toBe(429);
    const spentBody = await spent.json();
    expect(spentBody.quotaExceeded).toBe(true);
    expect(spentBody.items).toEqual([null]);
    expect(groq.calls).toBe(0);
    expect(used(spentKv, spentUid)).toBe(20);
  });

  it('charges a premium news translation against the higher daily cap', async () => {
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'news-premium-ok';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });
    const env = envFor(kv);
    const res = await post(env, uid, '/news/translate', { items: [{ title: 'Solana outage resolved', desc: '' }] });
    expect(res.status).toBe(200);
    expect(used(kv, uid)).toBe(1);
    const token = await firebaseToken(uid);
    const usage = await worker.fetch(new Request('https://tradeos.test/ai-usage', {
      headers: { Authorization: `Bearer ${token}` },
    }), env);
    expect(await usage.json()).toMatchObject({ used: 1, limit: 200, premium: true });
  });

  it('refunds a news translation when the provider fails', async () => {
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    groq.status = 500;
    const uid = 'news-refund';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(false) });
    const res = await post(envFor(kv), uid, '/news/translate', { items: [{ title: 'Fed holds rates', desc: '' }] });
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([null]);
    expect(groq.calls).toBeGreaterThan(0);
    expect(used(kv, uid)).toBe(0);
  });

  it('refunds a news translation when the provider throws', async () => {
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    groq.throw = true;
    const uid = 'news-throw';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });
    const res = await post(envFor(kv), uid, '/news/translate', { items: [{ title: 'Oil jumps', desc: '' }] });
    expect(res.status).toBe(500);
    expect(groq.calls).toBe(1);
    expect(used(kv, uid)).toBe(0);
  });

  it('charges a project description for premium and hides the call when that cap is spent', async () => {
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    groq.body = { choices: [{ message: { content: 'ביטקוין הוא רשת תשלומים.' } }] };
    const uid = 'desc-premium-ok';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });
    const res = await post(envFor(kv), uid, '/ai-project-desc', { coinName: 'Bitcoin', symbol: 'BTC' });
    expect(res.status).toBe(200);
    expect((await res.json()).text).toContain('ביטקוין');
    expect(used(kv, uid)).toBe(1);
    expect(groq.calls).toBe(1);

    const spentUid = 'desc-premium-spent';
    const spentKv = memoryKv({
      [`planflag:${spentUid}`]: planFlag(true),
      [`aiq:${spentUid}`]: quotaDoc(200, { d: { s: Date.now() - 1000, c: 200 } }),
    });
    groq.calls = 0;
    const spent = await post(envFor(spentKv), spentUid, '/ai-project-desc', { coinName: 'Bitcoin', symbol: 'BTC' });
    expect(spent.status).toBe(429);
    expect((await spent.json()).quotaExceeded).toBe(true);
    expect(groq.calls).toBe(0);
    expect(used(spentKv, spentUid)).toBe(200);
  });

  it('does not call the model for a project description when the free quota is spent', async () => {
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'desc-free-spent';
    const kv = memoryKv({
      [`planflag:${uid}`]: planFlag(false),
      [`aiq:${uid}`]: quotaDoc(20),
    });
    const res = await post(envFor(kv), uid, '/ai-project-desc', { coinName: 'Bitcoin', symbol: 'BTC' });
    expect(res.status).toBe(429);
    expect((await res.json()).quotaExceeded).toBe(true);
    expect(groq.calls).toBe(0);
    expect(used(kv, uid)).toBe(20);
  });

  it('refunds a premium project description when the provider fails or returns nothing', async () => {
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    groq.status = 400;
    const uid = 'desc-premium-refund';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });
    const failed = await post(envFor(kv), uid, '/ai-project-desc', { coinName: 'Bitcoin', symbol: 'BTC' });
    expect(failed.status).toBe(502);
    expect(groq.calls).toBeGreaterThan(0);
    expect(used(kv, uid)).toBe(0);

    groq.status = 200;
    groq.body = { choices: [{ message: { content: '   ' } }] };
    groq.calls = 0;
    const emptyUid = 'desc-empty';
    const emptyKv = memoryKv({ [`planflag:${emptyUid}`]: planFlag(true) });
    const empty = await post(envFor(emptyKv), emptyUid, '/ai-project-desc', { coinName: 'Ethereum', symbol: 'ETH' });
    expect(empty.status).toBe(502);
    expect(used(emptyKv, emptyUid)).toBe(0);

    groq.throw = true;
    groq.body = null;
    groq.calls = 0;
    const throwUid = 'desc-throw';
    const throwKv = memoryKv({ [`planflag:${throwUid}`]: planFlag(false) });
    const thrown = await post(envFor(throwKv), throwUid, '/ai-project-desc', { coinName: 'Solana', symbol: 'SOL' });
    expect(thrown.status).toBe(500);
    expect(used(throwKv, throwUid)).toBe(0);
  });

  it('counts a coach run on the shared quota even when the old monthly counter is full', async () => {
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    groq.body = { choices: [{ message: { content: '**חוזקות**\n• נשמר' } }] };
    const uid = 'coach-monthly-ignored';
    const monthKey = `coach:${uid}:${israelDate().slice(0, 7)}`;
    const kv = memoryKv({
      [`planflag:${uid}`]: planFlag(false),
      [monthKey]: '5',
    });
    const res = await post(envFor(kv), uid, '/ai-coach', {
      stats: { wallet: '0xabc', pnlUsd: 12 },
      depth: 'short',
      mode: 'journal',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(used(kv, uid)).toBe(1);
    expect(kv.store.get(monthKey)).toBe('5');
    expect(groq.calls).toBeGreaterThan(0);
  });
});
