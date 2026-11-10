// settings/customTradeFields and the optional trade.custom map.
// Emulator only: npm run test:rules. Do not deploy these rules from here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { deleteField, doc, setDoc, updateDoc, setLogLevel } from 'firebase/firestore';

const RULES = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');
let env;
const asUser = (uid) => env.authenticatedContext(uid).firestore();

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), path), data); });
}

const trade = (over = {}) => ({
  entryPrice: 100,
  quantity: 1,
  stopLoss: 90,
  fees: 0,
  direction: 'long',
  status: 'closed',
  pair: 'BTCUSDT',
  leverage: 5,
  ...over,
});

beforeAll(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-tradeos-rules-custom-fields',
    firestore: { rules: RULES },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/alice', { displayName: 'Alice', role: 'user' });
});

afterAll(async () => { await env?.cleanup(); });

describe('trade.custom', () => {
  const path = 'users/alice/trades/t1';

  it('accepts a trade with no custom field', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), path), trade()));
  });

  it('accepts a small map of strings and numbers', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), path), trade({
      custom: { f1: 'לונדון', f2: 2 },
    })));
  });

  it('rejects a custom value that is not a map, and a secret key', async () => {
    await assertFails(setDoc(doc(asUser('alice'), path), trade({ custom: 'לונדון' })));
    await assertFails(setDoc(doc(asUser('alice'), path), trade({ custom: { apiKey: 'k' } })));
  });

  it('lets a legacy trade gain or drop custom without touching the rest', async () => {
    await seed(path, { pair: 'ETHUSDT', entryPrice: 'old' });
    await assertSucceeds(updateDoc(doc(asUser('alice'), path), { custom: { f1: 'ניו יורק' } }));
    await assertSucceeds(updateDoc(doc(asUser('alice'), path), { custom: deleteField() }));
    await assertFails(updateDoc(doc(asUser('alice'), path), { custom: ['לא מפה'] }));
  });
});

describe('settings/customTradeFields', () => {
  const path = 'users/alice/settings/customTradeFields';

  it('accepts an empty list and a text, number, or select field', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), path), { fields: [], seq: 0 }));
    await assertSucceeds(setDoc(doc(asUser('alice'), path), {
      seq: 2,
      fields: [
        { id: 'f1', name: 'סשן', type: 'text' },
        { id: 'f2', name: 'איכות', type: 'select', options: ['A', 'B'] },
      ],
    }));
  });

  it('rejects a bad type, a select with no options, and a secret at the top', async () => {
    await assertFails(setDoc(doc(asUser('alice'), path), {
      seq: 1,
      fields: [{ id: 'f1', name: 'סשן', type: 'date' }],
    }));
    await assertFails(setDoc(doc(asUser('alice'), path), {
      seq: 1,
      fields: [{ id: 'f1', name: 'איכות', type: 'select', options: [] }],
    }));
    await assertFails(setDoc(doc(asUser('alice'), path), {
      seq: 0,
      fields: [],
      apiKey: 'k',
    }));
  });

  it('still allows an unrelated settings document', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), 'users/alice/settings/notifications'), {
      pushEnabled: true,
    }));
  });
});
