import { generateKeyPairSync } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { scanWyckoffSetups } from './index.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'scanner@tradeos-91a58.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});

function userDoc(uid, role) {
  return {
    name: `projects/tradeos-91a58/databases/(default)/documents/users/${uid}`,
    fields: { role: { stringValue: role } },
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * @param {object} opts
 * @param {Array} opts.users
 * @param {null|false|true|'missing'} opts.enabled scanner.enabled for every admin
 * @param {Array<{symbol: string, bias: string}>} opts.watch
 */
function installFetch({ users, enabled, watch }) {
  const calls = [];
  vi.stubGlobal('fetch', async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('oauth2.googleapis.com/token')) {
      return json({ access_token: 'tok', expires_in: 3600 });
    }
    if (u.includes('/documents/users?')) {
      return json({ documents: users });
    }
    if (u.includes('/settings/scanner')) {
      if (enabled === 'missing') return new Response('{}', { status: 404 });
      const fields = {};
      if (enabled === true || enabled === false) fields.enabled = { booleanValue: enabled };
      return json({ fields });
    }
    if (u.includes('/watchlist')) {
      return json({
        documents: watch.map((item) => ({
          fields: {
            symbol: { stringValue: item.symbol },
            ...(item.bias ? { bias: { stringValue: item.bias } } : {}),
          },
        })),
      });
    }
    if (u.includes('api.bybit.com')) {
      return json({ result: { list: [] } });
    }
    return new Response(`unexpected ${u}`, { status: 500 });
  });
  return calls;
}

function scannerEnv(overrides = {}) {
  return {
    SCANNER_ENABLED: 'true',
    FIREBASE_SERVICE_ACCOUNT: SERVICE_ACCOUNT,
    ALERTS_KV: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    },
    ...overrides,
  };
}

const hit = (calls, part) => calls.some((u) => u.includes(part));

afterEach(() => {
  vi.unstubAllGlobals();
});

it('does no work when the scanner flag is off', async () => {
  const calls = installFetch({ users: [userDoc('admin1', 'admin')], enabled: null, watch: [{ symbol: 'BTC', bias: 'long' }] });
  await scanWyckoffSetups(scannerEnv({ SCANNER_ENABLED: 'false' }));
  expect(calls).toEqual([]);
});

it('skips a paused admin before the watchlist and before any market call', async () => {
  const calls = installFetch({
    users: [userDoc('admin1', 'admin')],
    enabled: false,
    watch: [{ symbol: 'BTC', bias: 'long' }],
  });
  await scanWyckoffSetups(scannerEnv());
  expect(hit(calls, '/documents/users?')).toBe(true);
  expect(hit(calls, '/settings/scanner')).toBe(true);
  expect(hit(calls, '/watchlist')).toBe(false);
  expect(hit(calls, 'api.bybit.com')).toBe(false);
});

it('does not call the exchange when the watchlist is empty', async () => {
  const calls = installFetch({
    users: [userDoc('admin1', 'admin')],
    enabled: 'missing',
    watch: [],
  });
  await scanWyckoffSetups(scannerEnv());
  expect(hit(calls, '/watchlist')).toBe(true);
  expect(hit(calls, 'api.bybit.com')).toBe(false);
});

it('does not call the exchange when the engine is on but nothing is tagged', async () => {
  const calls = installFetch({
    users: [userDoc('admin1', 'admin')],
    enabled: true,
    watch: [{ symbol: 'ETH' }],
  });
  await scanWyckoffSetups(scannerEnv());
  expect(hit(calls, '/watchlist')).toBe(true);
  expect(hit(calls, 'api.bybit.com')).toBe(false);
});

it('fetches candles for an admin who left the toggle unset and tagged a coin', async () => {
  const calls = installFetch({
    users: [userDoc('admin1', 'admin'), userDoc('user2', 'user')],
    enabled: 'missing',
    watch: [{ symbol: 'BTC', bias: 'long' }],
  });
  await scanWyckoffSetups(scannerEnv());
  expect(hit(calls, 'api.bybit.com')).toBe(true);
  // The non-admin is not scanned: one settings read, one watchlist read.
  expect(calls.filter((u) => u.includes('/settings/scanner'))).toHaveLength(1);
  expect(calls.filter((u) => u.includes('/watchlist'))).toHaveLength(1);
});
