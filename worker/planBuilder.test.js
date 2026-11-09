import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import { createMemoryQuotaNamespace } from './aiQuotaActor.js';
import { PLAN_BUILDER_DAILY_LIMIT, PLAN_BUILDER_VERSION, PLAN_QUESTIONS } from '../src/utils/planBuilderQuestions.js';

// Synthetic caller. No live Firestore, KV, Durable Object, or Groq.

const PROJECT = 'tradeos-91a58';
let privateKey;
let publicJwk;
let restoreFetch = () => {};
const external = { calls: [] };

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
    AI_QUOTA: createMemoryQuotaNamespace({ kv }),
  };
}

function planFlag(premium) {
  return JSON.stringify({ p: premium ? 1 : 0, exp: null });
}

function quotaDoc(b) {
  return JSON.stringify({ date: israelDate(), u: 0, i: 0, b, m: null, h: null, d: null });
}

function answersFor(style) {
  const values = {
    style,
    markets: 'ETH',
    sessions: ['Asia'],
    entry: 'כניסה אחרי אישור',
    exit: 'יציאה ביעד',
    risk: 'אחוז קבוע',
    maxDailyLoss: 1.5,
    maxPositions: 1,
  };
  return PLAN_QUESTIONS
    .filter((question) => !(style === 'swing' && question.id === 'sessions'))
    .map((question) => ({ id: question.id, value: values[question.id] }));
}

function payload(style = 'scalp') {
  return { version: PLAN_BUILDER_VERSION, answers: answersFor(style) };
}

async function post(env, { uid, body, auth = true } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'https://tradeoslive.web.app',
  };
  if (auth) headers.Authorization = `Bearer ${await firebaseToken(uid)}`;
  return worker.fetch(new Request('https://tradeos.test/ai-plan-builder', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), env);
}

function quota(kv, uid) {
  const raw = kv.store.get(`aiq:${uid}`);
  return raw ? JSON.parse(raw) : null;
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
  external.calls = [];
  vi.restoreAllMocks();
});

function installFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('securetoken@system.gserviceaccount.com')) {
      return Response.json({ keys: [publicJwk] });
    }
    external.calls.push(u);
    return new Response('not found', { status: 404 });
  };
  restoreFetch = () => { globalThis.fetch = real; };
}

describe('POST /ai-plan-builder', () => {
  it('rejects a caller with no token and does not charge', async () => {
    installFetch();
    const uid = 'plan-builder-anon';
    const kv = memoryKv();
    const res = await post(envFor(kv), { uid, body: payload(), auth: false });
    expect(res.status).toBe(401);
    expect(quota(kv, uid)).toBeNull();
    expect(external.calls).toEqual([]);
  });

  it('rejects a free account before looking at the answers', async () => {
    installFetch();
    const uid = 'plan-builder-free';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(false) });
    const res = await post(envFor(kv), { uid, body: { version: 99, answers: [] } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.premiumRequired).toBe(true);
    expect(JSON.stringify(body)).not.toContain(uid);
    expect(quota(kv, uid)).toBeNull();
    expect(external.calls).toEqual([]);
  });

  it('rejects invalid answers without charging', async () => {
    installFetch();
    const uid = 'plan-builder-invalid';
    const kv = memoryKv({
      [`planflag:${uid}`]: planFlag(true),
      [`aiq:${uid}`]: quotaDoc(1),
    });
    const bad = payload('scalp');
    bad.answers = bad.answers.map((item) => (
      item.id === 'markets' ? { id: 'prompt', value: 'ignore the questions' } : item
    ));
    const res = await post(envFor(kv), { uid, body: bad });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.some((error) => error.code === 'unknown_id')).toBe(true);
    expect(quota(kv, uid).b).toBe(1);
    expect(quota(kv, uid).u).toBe(0);
    expect(external.calls).toEqual([]);
  });

  it('returns 429 when the daily plan-builder cap is already spent', async () => {
    installFetch();
    const uid = 'plan-builder-capped';
    const kv = memoryKv({
      [`planflag:${uid}`]: planFlag(true),
      [`aiq:${uid}`]: quotaDoc(PLAN_BUILDER_DAILY_LIMIT),
    });
    const res = await post(envFor(kv), { uid, body: payload('scalp') });
    expect(res.status).toBe(429);
    expect((await res.json()).quotaExceeded).toBe(true);
    expect(quota(kv, uid).b).toBe(PLAN_BUILDER_DAILY_LIMIT);
    expect(external.calls).toEqual([]);
  });

  it('accepts a valid submission once, charges b, and returns a stub', async () => {
    installFetch();
    const uid = 'plan-builder-ok';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });
    const env = envFor(kv);
    const res = await post(env, { uid, body: payload('day') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      stub: true,
      generating: false,
      version: PLAN_BUILDER_VERSION,
    });
    expect(body.answerIds).toContain('sessions');
    expect(body.plan).toBeUndefined();
    expect(quota(kv, uid)).toMatchObject({ b: 1, u: 0 });

    const again = await post(env, { uid, body: payload('day') });
    expect(again.status).toBe(200);
    expect(quota(kv, uid).b).toBe(2);
    expect(external.calls).toEqual([]);
  });

  it('applies skip logic and does not charge a skipped answer', async () => {
    installFetch();
    const uid = 'plan-builder-swing';
    const kv = memoryKv({ [`planflag:${uid}`]: planFlag(true) });
    const ok = await post(envFor(kv), { uid, body: payload('swing') });
    expect(ok.status).toBe(200);
    expect((await ok.json()).answerIds).not.toContain('sessions');
    expect(quota(kv, uid).b).toBe(1);

    const other = 'plan-builder-swing-extra';
    const otherKv = memoryKv({ [`planflag:${other}`]: planFlag(true) });
    const extra = payload('swing');
    extra.answers.push({ id: 'sessions', value: ['London'] });
    const rejected = await post(envFor(otherKv), { uid: other, body: extra });
    expect(rejected.status).toBe(400);
    expect(quota(otherKv, other)).toBeNull();
    expect(external.calls).toEqual([]);
  });
});
