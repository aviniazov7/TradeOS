import { it, expect, vi } from 'vitest';
import worker from './index.js';

it('loads the worker module and serves /health', async () => {
  const res = await worker.fetch(new Request('https://x/health'), {});
  expect(res.status).toBe(200);
});

it('turns an unhandled route error into JSON 500 with the request CORS headers', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const kv = { get: async () => { throw new Error('boom'); }, put: async () => {}, list: async () => ({ keys: [] }) };
  const origin = 'https://tradeos-91a58.web.app';
  const res = await worker.fetch(new Request('https://x/coupons/info/ABC', { headers: { Origin: origin } }), { ALERTS_KV: kv });
  expect(res.status).toBe(500);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  expect(res.headers.get('Content-Type')).toBe('application/json');
  expect(await res.json()).toHaveProperty('error');
  spy.mockRestore();
});
