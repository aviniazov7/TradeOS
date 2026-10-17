// Admin notification collections are admin-only.
// Run against the local emulator: `npm run test:rules`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, setLogLevel,
} from 'firebase/firestore';

const RULES = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');

let env;
const asUser = (uid) => env.authenticatedContext(uid).firestore();
const asGuest = () => env.unauthenticatedContext().firestore();

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const NOTE = {
  type: 'churn_risk',
  userId: 'alice',
  userName: 'Alice',
  userEmail: 'alice@example.com',
  title: 'סיכון נטישה',
  body: 'Alice היה פעיל והפסיק',
  episode: 1,
  read: false,
  readAt: null,
  createdAt: new Date('2026-06-01T00:00:00Z'),
};

beforeAll(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-tradeos-rules-admin-notif',
    firestore: { rules: RULES },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/alice', { displayName: 'Alice', role: 'user', plan: 'free' });
  await seed('users/root', { displayName: 'Admin', role: 'admin' });
  await seed('adminNotifications/churn_risk_alice_1', NOTE);
  await seed('adminNotificationSettings/config', { enabled: true, types: { churn_risk: true } });
  await seed('adminNotificationState/alice', { churnOpen: true, churnEpisode: 1 });
});

afterAll(async () => {
  await env?.cleanup();
});

const PATHS = [
  ['adminNotifications', 'churn_risk_alice_1'],
  ['adminNotificationSettings', 'config'],
  ['adminNotificationState', 'alice'],
];

describe('admin notification collections — non-admins', () => {
  for (const [col, id] of PATHS) {
    it(`guest cannot read or write ${col}`, async () => {
      const db = asGuest();
      await assertFails(getDoc(doc(db, col, id)));
      await assertFails(getDocs(collection(db, col)));
      await assertFails(setDoc(doc(db, col, 'new'), { type: 'signup' }));
    });

    it(`a regular user cannot read or write ${col}`, async () => {
      const db = asUser('alice');
      await assertFails(getDoc(doc(db, col, id)));
      await assertFails(getDocs(collection(db, col)));
      await assertFails(updateDoc(doc(db, col, id), { read: true }));
      await assertFails(deleteDoc(doc(db, col, id)));
    });
  }
});

describe('admin notification collections — admins', () => {
  it('can read the feed, settings, and dedupe state', async () => {
    const db = asUser('root');
    await assertSucceeds(getDoc(doc(db, 'adminNotifications/churn_risk_alice_1')));
    await assertSucceeds(getDocs(collection(db, 'adminNotifications')));
    await assertSucceeds(getDoc(doc(db, 'adminNotificationSettings/config')));
    await assertSucceeds(getDoc(doc(db, 'adminNotificationState/alice')));
  });

  it('can mark a notification read and replace settings', async () => {
    const db = asUser('root');
    await assertSucceeds(updateDoc(doc(db, 'adminNotifications/churn_risk_alice_1'), { read: true }));
    await assertSucceeds(setDoc(doc(db, 'adminNotificationSettings/config'), {
      enabled: false,
      types: { churn_risk: false, inactive_user: true },
      thresholds: { churnDays: 7, inactiveDays: 30 },
    }));
  });

  it('can create a notification and a state doc', async () => {
    const db = asUser('root');
    await assertSucceeds(setDoc(doc(db, 'adminNotifications/signup_bob_1'), { ...NOTE, type: 'signup', userId: 'bob' }));
    await assertSucceeds(setDoc(doc(db, 'adminNotificationState/bob'), { signupSeen: true }));
  });
});
