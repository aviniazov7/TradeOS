import { it, expect, vi } from 'vitest';
import worker from './index.js';

it('loads the worker module and serves /health', async () => {
  const res = await worker.fetch(new Request('https://x/health'), {});
  expect(res.status).toBe(200);
});

it('allows the new origin and still allows the previous one and both preview hosts', async () => {
  const cors = async (origin) => {
    const res = await worker.fetch(new Request('https://x/health', { headers: { Origin: origin } }), {});
    return res.headers.get('Access-Control-Allow-Origin');
  };
  expect(await cors('https://tradeos-app.web.app')).toBe('https://tradeos-app.web.app');
  expect(await cors('https://tradeos-app.firebaseapp.com')).toBe('https://tradeos-app.firebaseapp.com');
  expect(await cors('https://tradeos-91a58.web.app')).toBe('https://tradeos-91a58.web.app');
  expect(await cors('https://tradeos-91a58.firebaseapp.com')).toBe('https://tradeos-91a58.firebaseapp.com');
  expect(await cors('https://tradeos-app--dev-abc123.web.app')).toBe('https://tradeos-app--dev-abc123.web.app');
  expect(await cors('https://tradeos-91a58--pr-12-abc.web.app')).toBe('https://tradeos-91a58--pr-12-abc.web.app');
  expect(await cors('https://evil.example')).toBe('https://tradeos-app.web.app');
});

it('turns an unhandled route error into JSON 500 with the request CORS headers', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const kv = { get: async () => { throw new Error('boom'); }, put: async () => {}, list: async () => ({ keys: [] }) };
  const origin = 'https://tradeos-app.web.app';
  const res = await worker.fetch(new Request('https://x/coupons/info/ABC', { headers: { Origin: origin } }), { ALERTS_KV: kv });
  expect(res.status).toBe(500);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  expect(res.headers.get('Content-Type')).toBe('application/json');
  expect(await res.json()).toHaveProperty('error');
  spy.mockRestore();
});
