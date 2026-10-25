// settings/exchanges must not accept API secrets. Owner-only, same as before.
// Run with the emulator: npm run test:rules
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, setLogLevel } from 'firebase/firestore';

const RULES = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');
let env;
const asUser = (uid) => env.authenticatedContext(uid).firestore();

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), path), data); });
}

beforeAll(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-tradeos-rules-exchanges',
    firestore: { rules: RULES },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/alice', { displayName: 'Alice', role: 'user' });
  await seed('users/root', { displayName: 'Admin', role: 'admin' });
});

afterAll(async () => { await env?.cleanup(); });

describe('settings/exchanges secrets', () => {
  const path = 'users/alice/settings/exchanges';

  it('lets the owner save a Vantage file-import marker with no secrets', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), path), {
      vantage: { connected: true, connectedAt: Date.now(), readOnlyVerified: true },
    }));
    await assertFails(setDoc(doc(asUser('alice'), path), {
      vantage: { connected: true, apiKey: 'k', apiSecret: 's' },
    }));
  });

  it('lets the owner save a non-secret connection marker', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), path), {
      bybit: { connected: true, connectedAt: Date.now(), readOnlyVerified: true },
      hyperliquid: { connected: true, address: '0xabc', connectedAt: Date.now() },
    }));
  });

  it('rejects apiKey, apiSecret, and passphrase on an exchange entry', async () => {
    await assertFails(setDoc(doc(asUser('alice'), path), {
      bybit: { connected: true, apiKey: 'k', apiSecret: 's' },
    }));
    await assertFails(setDoc(doc(asUser('alice'), path), {
      okx: { connected: true, passphrase: 'p' },
    }));
  });

  it('still lets the owner write other settings documents', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), 'users/alice/settings/notifications'), {
      pushEnabled: true,
      schedule: { morning: '08:00' },
    }));
  });

  it('rejects a secret stashed at the top of another settings document', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'users/alice/settings/notifications'), {
      apiKey: 'k',
      apiSecret: 's',
    }));
  });

  it('does not let an admin read exchange settings', async () => {
    await seed(path, { bybit: { connected: true } });
    await assertFails(getDoc(doc(asUser('root'), path)));
    await assertSucceeds(getDoc(doc(asUser('alice'), path)));
  });
});
