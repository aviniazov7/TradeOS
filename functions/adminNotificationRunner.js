// Applies the pure planner to Firestore. Called by the scheduled function and
// by the user/trade triggers. Not deployed until the owner runs
// `firebase deploy --only functions` — a deploy writes to the shared
// production database.

const { FieldValue } = require('firebase-admin/firestore');

const SETTINGS_ID = 'config';
const TRADE_LOOKUP_BUDGET = 80;

let plannerPromise;
function planner() {
  if (!plannerPromise) plannerPromise = import('./adminNotifications.mjs');
  return plannerPromise;
}

const STATE_KEYS = [
  'churnOpen', 'churnEpisode', 'inactiveOpen', 'inactiveEpisode',
  'signupSeen', 'premiumInitialized', 'premiumActive', 'premiumRev',
];

function normalizeUser(uid, data) {
  const d = data || {};
  return {
    uid,
    role: d.role || 'user',
    plan: d.plan || 'free',
    planExpires: d.planExpires ?? null,
    planGrantedAt: d.planGrantedAt ?? null,
    createdAt: d.createdAt ?? null,
    lastActive: d.lastActive ?? null,
    lastTradeAt: d.lastTradeAt ?? null,
    displayName: d.displayName || '',
    email: d.email || '',
  };
}

function sameState(blankState, prev, next) {
  const a = { ...blankState(), ...(prev || {}) };
  const b = { ...blankState(), ...(next || {}) };
  return STATE_KEYS.every((key) => a[key] === b[key]);
}

async function loadSettings(db) {
  const snap = await db.collection('adminNotificationSettings').doc(SETTINGS_ID).get();
  return snap.exists ? snap.data() : {};
}

async function listUsers(db) {
  const out = [];
  let last = null;
  for (let page = 0; page < 50; page++) {
    let q = db.collection('users').limit(200);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) out.push(normalizeUser(doc.id, doc.data()));
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }
  return out;
}

// Churn compares logins with trades. lastTradeAt is filled by the trade
// trigger going forward; this backfills a bounded number of quiet users who
// don't have the field yet, and stores it so the next scan is one read.
async function enrichLastTrades(db, users, settings, now) {
  const { toMs, normalizeSettings, tradeActivityMs } = await planner();
  const s = normalizeSettings(settings);
  let budget = TRADE_LOOKUP_BUDGET;
  for (const user of users) {
    if (budget <= 0) break;
    if (user.role === 'admin' || toMs(user.lastTradeAt)) continue;
    const anchor = toMs(user.lastActive) || toMs(user.createdAt);
    if (!anchor || (now - anchor) / (24 * 60 * 60 * 1000) < s.thresholds.churnDays) continue;
    budget -= 1;
    try {
      const snap = await db.collection('users').doc(user.uid).collection('trades')
        .orderBy('entryDate', 'desc').limit(1).get();
      if (snap.empty) continue;
      const t = tradeActivityMs(snap.docs[0].data());
      if (!t) continue;
      user.lastTradeAt = t;
      await db.collection('users').doc(user.uid).set({ lastTradeAt: new Date(t) }, { merge: true });
    } catch (err) {
      console.error('admin notifications: last trade lookup failed', user.uid, err);
    }
  }
}

function notificationDoc(note) {
  return {
    type: note.type,
    userId: note.userId,
    userName: note.userName,
    userEmail: note.userEmail,
    title: note.title,
    body: note.body,
    episode: note.episode,
    read: false,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  };
}

// Returns how many notification documents were created.
async function commitUser(db, user, settings, now, source) {
  if (!user?.uid || user.role === 'admin') return 0;
  const { planUser, blankState } = await planner();
  const stateRef = db.collection('adminNotificationState').doc(user.uid);
  const peek = await stateRef.get();
  const peeked = peek.exists ? peek.data() : {};
  const preview = planUser(user, peeked, settings, now, source);
  if (preview.notifications.length === 0 && sameState(blankState, peeked, preview.state)) return 0;

  return db.runTransaction(async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const prev = stateSnap.exists ? stateSnap.data() : {};
    const { state, notifications } = planUser(user, prev, settings, now, source);
    const refs = notifications.map((n) => db.collection('adminNotifications').doc(n.id));
    const existing = [];
    for (const ref of refs) existing.push(await tx.get(ref));
    let created = 0;
    notifications.forEach((note, i) => {
      if (existing[i].exists) return;
      tx.set(refs[i], notificationDoc(note));
      created += 1;
    });
    if (created > 0 || !sameState(blankState, prev, state)) {
      tx.set(stateRef, { ...state, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return created;
  });
}

async function runAdminNotificationScan(db, now = Date.now()) {
  const settings = await loadSettings(db);
  const users = await listUsers(db);
  await enrichLastTrades(db, users, settings, now);
  let created = 0;
  for (const user of users) {
    try {
      created += await commitUser(db, user, settings, now, 'scan');
    } catch (err) {
      console.error('admin notifications: scan failed for', user.uid, err);
    }
  }
  console.log(`admin notifications scan: ${users.length} users, ${created} created`);
  return { users: users.length, created };
}

async function handleUserNotificationEvent(db, uid, source, data) {
  if (!uid || !data || data.role === 'admin') return 0;
  const settings = await loadSettings(db);
  return commitUser(db, normalizeUser(uid, data), settings, Date.now(), source);
}

async function stampLastTradeAt(db, uid, trade) {
  const { tradeActivityMs, toMs } = await planner();
  const t = tradeActivityMs(trade);
  if (!uid || !t) return;
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = toMs(snap.exists ? snap.get('lastTradeAt') : null);
    if (t > prev) tx.set(ref, { lastTradeAt: new Date(t) }, { merge: true });
  });
}

module.exports = {
  normalizeUser,
  runAdminNotificationScan,
  handleUserNotificationEvent,
  stampLastTradeAt,
};
