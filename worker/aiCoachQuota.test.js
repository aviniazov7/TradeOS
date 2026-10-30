import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import { createMemoryQuotaNamespace } from './aiQuotaActor.js';

// Wallet analysis (and the other /ai-coach modes) must spend the same daily
// question counter /ai-chat does, and must not call the provider once it is
// spent. These hit the real handler with a locally signed Firebase token.

const PROJECT = 'tradeos-91a58';
let privateKey;
let publicJwk;
let restoreFetch = () => {};
const groq = { calls: 0, status: 200 };

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
  const aiqWrites = [];
  return {
    aiqWrites,
    store,
    async get(key, type) {
      if (!store.has(key)) return null;
      const raw = store.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      store.set(key, value);
      if (String(key).startsWith('aiq:')) aiqWrites.push(JSON.parse(value).u);
    },
    async delete(key) { store.delete(key); },
    async list() { return { keys: [] }; },
  };
}

function envFor(kv, { delayMs = 0 } = {}) {
  return {
    ALERTS_KV: kv,
    GROQ_API_KEY: 'test-key',
    AI_QUOTA: createMemoryQuotaNamespace({ kv, delayMs }),
  };
}

function planFlag(premium) {
  return JSON.stringify({ p: premium ? 1 : 0, exp: null });
}

function quotaDoc(u, extra = {}) {
  return JSON.stringify({ date: israelDate(), u, i: 0, m: null, h: null, d: null, ...extra });
}

async function postCoach(env, uid, mode) {
  const token = await firebaseToken(uid);
  return worker.fetch(new Request('https://tradeos.test/ai-coach', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://tradeoslive.web.app',
    },
    body: JSON.stringify({ stats: { wallet: '0xabc', pnlUsd: 12 }, depth: 'deep', mode }),
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
      const body = groq.status === 200
        ? { choices: [{ message: { content: '**חוזקות**\n• נשמר' } }] }
        : { error: 'no' };
      return new Response(JSON.stringify(body), { status: groq.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  };
  restoreFetch = () => { globalThis.fetch = real; };
}

describe('POST /ai-coach daily quota', () => {
  it('decrements the shared question counter for a Polymarket wallet analysis and a journal analyst run', async () => {
    groq.calls = 0;
    groq.status = 200;
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'wallet-ok';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });
    const env = envFor(kv);

    const wallet = await postCoach(env, uid, 'polymarket');
    expect(wallet.status).toBe(200);
    expect((await wallet.json()).ok).toBe(true);

    const analyst = await postCoach(env, uid, 'journal');
    expect(analyst.status).toBe(200);

    const doc = JSON.parse(kv.store.get(`aiq:${uid}`));
    expect(doc.u).toBe(2);
    expect(groq.calls).toBeGreaterThanOrEqual(2);

    const token = await firebaseToken(uid);
    const usage = await worker.fetch(new Request('https://tradeos.test/ai-usage', {
      headers: { Authorization: `Bearer ${token}` },
    }), env);
    expect(usage.status).toBe(200);
    expect(await usage.json()).toMatchObject({ used: 2, limit: 200, premium: true });
  });

  it('rejects an exhausted premium day cap without calling the provider', async () => {
    groq.calls = 0;
    groq.status = 200;
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'wallet-premium-spent';
    const kv = memoryKv({
      [`planflag:${uid}`]: planFlag(true),
      [`aiq:${uid}`]: quotaDoc(200, { d: { s: Date.now() - 1000, c: 200 } }),
    });

    const res = await postCoach(envFor(kv), uid, 'polymarket');
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.quotaExceeded).toBe(true);
    expect(body.error).toContain('הגעת לתקרה היומית של Premium');
    expect(groq.calls).toBe(0);
    expect(JSON.parse(kv.store.get(`aiq:${uid}`)).u).toBe(200);
  });

  it('rejects an exhausted free daily quota without calling the provider', async () => {
    groq.calls = 0;
    groq.status = 200;
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'wallet-free-spent';
    const kv = memoryKv({
      [`planflag:${uid}`]: planFlag(false),
      [`aiq:${uid}`]: quotaDoc(20),
    });

    const res = await postCoach(envFor(kv), uid, 'polymarket');
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.quotaExceeded).toBe(true);
    expect(body.error).toContain('הגעת למכסה היומית');
    expect(groq.calls).toBe(0);
    expect(JSON.parse(kv.store.get(`aiq:${uid}`)).u).toBe(20);
  });

  it('refunds the question when the provider fails', async () => {
    groq.calls = 0;
    groq.status = 400;
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'wallet-refund';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });

    const res = await postCoach(envFor(kv), uid, 'polymarket');
    expect(res.status).toBe(502);
    expect(groq.calls).toBeGreaterThan(0);
    expect(kv.aiqWrites).toContain(1);
    expect(JSON.parse(kv.store.get(`aiq:${uid}`)).u).toBe(0);
  });

  it('fails closed (no provider call) when the quota binding is missing', async () => {
    groq.calls = 0;
    groq.status = 200;
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'wallet-no-do';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });
    const res = await postCoach({ ALERTS_KV: kv, GROQ_API_KEY: 'test-key' }, uid, 'polymarket');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('אינו זמין');
    expect(groq.calls).toBe(0);
  });

  it('does not let 40 parallel analyses past the premium per-minute cap', async () => {
    groq.calls = 0;
    groq.status = 200;
    installFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uid = 'wallet-parallel';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });
    // delayMs widens the storage gap. Without the lock every request would
    // read the empty counter and all 40 would reach Groq.
    const env = envFor(kv, { delayMs: 2 });
    const responses = await Promise.all(
      Array.from({ length: 40 }, () => postCoach(env, uid, 'polymarket')),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(35);
    expect(groq.calls).toBe(5);
    const token = await firebaseToken(uid);
    const usage = await worker.fetch(new Request('https://tradeos.test/ai-usage', {
      headers: { Authorization: `Bearer ${token}` },
    }), env);
    expect(await usage.json()).toMatchObject({ used: 5, limit: 200, premium: true });
  });
});
