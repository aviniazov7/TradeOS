import { it, expect, vi } from 'vitest';
import worker from './index.js';

it('loads the worker module and serves /health', async () => {
  const res = await worker.fetch(new Request('https://x/health'), {});
  expect(res.status).toBe(200);
});

it('turns an unhandled route error into JSON 500 with the request CORS headers', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const kv = { get: async () => { throw new Error('boom'); }, put: async () => {}, list: async () => ({ keys: [] }) };
  const origin = 'https://tradeoslive.web.app';
  const res = await worker.fetch(new Request('https://x/coupons/info/ABC', { headers: { Origin: origin } }), { ALERTS_KV: kv });
  expect(res.status).toBe(500);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  expect(res.headers.get('Content-Type')).toBe('application/json');
  expect(await res.json()).toHaveProperty('error');
  spy.mockRestore();
});

it('allows the new hosting origin, the legacy origin, and both preview-channel hosts', async () => {
  const allowed = [
    'https://tradeoslive.web.app',
    'https://tradeoslive.firebaseapp.com',
    'https://tradeos-91a58.web.app',
    'https://tradeos-91a58.firebaseapp.com',
    'https://tradeoslive--dev-abc123.web.app',
    'https://tradeos-91a58--pr-12-abc.web.app',
  ];
  for (const origin of allowed) {
    const res = await worker.fetch(new Request('https://x/health', { headers: { Origin: origin } }), {});
    expect(res.headers.get('Access-Control-Allow-Origin'), origin).toBe(origin);
  }
  for (const origin of ['https://evil.example', 'https://tradeoslive.web.app.evil.example', 'https://nottradeoslive--x.web.app']) {
    const res = await worker.fetch(new Request('https://x/health', { headers: { Origin: origin } }), {});
    expect(res.headers.get('Access-Control-Allow-Origin'), origin).toBe('https://tradeoslive.web.app');
  }
});
