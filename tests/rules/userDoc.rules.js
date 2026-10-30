// Firestore security-rules tests for the root users/{uid} profile doc.
// Run against the local emulator only: `npm run test:rules`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';

const RULES = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');

// Every field the app's client code writes to a user's own profile doc.
const OWNER_FIELDS = {
  displayName: 'Avi',
  email: 'avi@example.com',
  photoURL: null,
  avatarDataUrl: '',
  settings: { baseCurrency: 'USDT', assetClasses: ['crypto'] },
  onboardingCompleted: false,
  lastActive: new Date(),
  appVersion: '2.1.0',
  isPublicProfile: false,
  leaderboardName: 'avi',
};

// Server-authoritative fields: the real gates plus privilege-looking names.
const PRIVILEGED = {
  role: 'admin',
  plan: 'premium',
  planExpires: null,
  planAmount: 100000,
  planDays: 3650,
  planGrantedAt: '2026-01-01T00:00:00.000Z',
  isPremium: true,
  isAdmin: true,
  admin: true,
  subscription: 'premium',
  premiumUntil: '2099-01-01T00:00:00.000Z',
};

let env;
// Token email matches OWNER_FIELDS.email so the bind-to-auth rule allows the
// writes these tests already make. A different address is covered below.
const asUser = (uid, claims) => env.authenticatedContext(uid, { email: 'avi@example.com', ...claims }).firestore();
const asGuest = () => env.unauthenticatedContext().firestore();

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

beforeAll(async () => {
  setLogLevel('silent'); // denied writes are the point of half these tests
  env = await initializeTestEnvironment({
    projectId: 'demo-tradeos-rules',
    firestore: { rules: RULES },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/alice', { ...OWNER_FIELDS, createdAt: new Date('2026-01-01'), role: 'user', plan: 'free' });
  await seed('users/bob', { displayName: 'Bob', role: 'user', plan: 'free' });
  await seed('users/root', { displayName: 'Admin', role: 'admin' });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('users/{uid} — create (first sign-in)', () => {
  it('lets a new user create their profile with the app defaults', async () => {
    await assertSucceeds(setDoc(doc(asUser('carol'), 'users/carol'), { ...OWNER_FIELDS, createdAt: serverTimestamp() }));
  });

  it('lets a merge write (e.g. touchLastActive) create a missing doc', async () => {
    await assertSucceeds(setDoc(doc(asUser('carol'), 'users/carol'), { lastActive: serverTimestamp(), appVersion: '2.1.0' }, { merge: true }));
  });

  for (const [field, value] of Object.entries(PRIVILEGED)) {
    it(`rejects creating a profile with ${field}`, async () => {
      await assertFails(setDoc(doc(asUser('carol'), 'users/carol'), { ...OWNER_FIELDS, [field]: value }));
    });
  }

  it("rejects creating someone else's profile", async () => {
    await assertFails(setDoc(doc(asUser('carol'), 'users/dave'), { displayName: 'x' }));
  });
});

describe('users/{uid} — owner update', () => {
  it('allows every field the app writes', async () => {
    const db = asUser('alice');
    for (const [field, value] of Object.entries(OWNER_FIELDS)) {
      await assertSucceeds(setDoc(doc(db, 'users/alice'), { [field]: value }, { merge: true }));
    }
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { lastActive: serverTimestamp(), appVersion: '2.1.1' }, { merge: true }));
  });

  for (const [field, value] of Object.entries(PRIVILEGED)) {
    it(`rejects writing ${field} on yourself`, async () => {
      await assertFails(updateDoc(doc(asUser('alice'), 'users/alice'), { [field]: value }));
    });
  }

  it('rejects rewriting createdAt', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'users/alice'), { createdAt: new Date('2020-01-01') }));
  });

  it('rejects removing the plan field', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'users/alice'), { ...OWNER_FIELDS, createdAt: new Date('2026-01-01'), role: 'user' }));
  });

  it("allows an update when the doc already holds a field the owner can't write", async () => {
    // users/alice already has role/plan; touching an allowed key must still work.
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'users/alice'), { onboardingCompleted: true }));
  });

  it("rejects writing someone else's profile", async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'users/bob'), { displayName: 'pwned' }));
  });

  it('rejects an email that is not the Auth token email', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'users/alice'), { email: 'other@example.com' }));
  });

  it('keeps the rest of settings when one key is patched', async () => {
    const db = asUser('alice');
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { 'settings.journalMigrated': true }));
    const snap = await getDoc(doc(db, 'users/alice'));
    expect(snap.data().settings.baseCurrency).toBe('USDT');
    expect(snap.data().settings.assetClasses).toEqual(['crypto']);
    expect(snap.data().settings.journalMigrated).toBe(true);
  });

  it('rejects apiKey inside settings', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'users/alice'), { 'settings.apiKey': 'leaked' }));
    await assertFails(setDoc(doc(asUser('alice'), 'users/alice'), {
      settings: { apiKey: 'leaked', baseCurrency: 'USDT', assetClasses: ['crypto'] },
    }, { merge: true }));
  });
});

describe('users/{uid} — admin, reads, guests', () => {
  it('lets an admin grant premium', async () => {
    await assertSucceeds(setDoc(doc(asUser('root'), 'users/bob'), { plan: 'premium', planExpires: null, planGrantedAt: '2026-10-09T00:00:00.000Z' }, { merge: true }));
  });

  it("does not let an admin's role check be bypassed by a non-admin", async () => {
    await assertFails(setDoc(doc(asUser('bob'), 'users/alice'), { plan: 'premium' }, { merge: true }));
  });

  it('lets owners and admins read, nobody else', async () => {
    await assertSucceeds(getDoc(doc(asUser('alice'), 'users/alice')));
    await assertSucceeds(getDoc(doc(asUser('root'), 'users/alice')));
    await assertFails(getDoc(doc(asUser('bob'), 'users/alice')));
    await assertFails(getDoc(doc(asGuest(), 'users/alice')));
  });

  it('blocks guests from writing', async () => {
    await assertFails(setDoc(doc(asGuest(), 'users/alice'), { displayName: 'x' }, { merge: true }));
  });

  it('still lets the owner delete their profile (account deletion)', async () => {
    await assertSucceeds(deleteDoc(doc(asUser('alice'), 'users/alice')));
  });
});
