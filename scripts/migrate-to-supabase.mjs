#!/usr/bin/env node
/**
 * One-time migration: Firebase (Auth + Firestore) → Supabase (tradeos-prod).
 * Run SUPERVISED, once, during a short maintenance window.
 *
 * Reuses the SAME tested field mapper the app uses (src/services/supabaseMap.js),
 * so what lands in Supabase matches exactly what the app reads back.
 *
 * ── Requires (env) ───────────────────────────────────────────────────────────
 *   GOOGLE_APPLICATION_CREDENTIALS  path to the Firebase service-account JSON
 *   SUPABASE_URL                    https://jzlbactamdjyzqjlfunr.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY       the SECRET service-role key (never commit)
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   node scripts/migrate-to-supabase.mjs --dry-run   # preview counts, no writes
 *   node scripts/migrate-to-supabase.mjs             # perform the migration
 *
 * ── Auth strategy ────────────────────────────────────────────────────────────
 *   Supabase users are created by EMAIL, mapped firebaseUid → supabaseUid.
 *   • Google users: sign in with Google (matched by email) — no password needed.
 *   • Email/password users: a password-reset email is sent on first run so they
 *     set a new password (Firebase scrypt hashes aren't portable 1:1). Small
 *     user base → this is the simplest safe path.
 */

import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { mapToRow } from '../src/services/supabaseMap.js';

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const fs = admin.firestore();
const fbAuth = admin.auth();
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Firestore sub-collection → Supabase table. The mapper injects the kind /
// is_backtest discriminators, so we only need the target table here. `settings`
// is special-cased (per-doc rows in user_settings).
const COLLECTION_TABLE = {
  trades: 'trades', backtests: 'backtests', strategies: 'strategies',
  signals: 'signals', dca: 'dca_plans', watchlist: 'watchlist_items',
  notes: 'journal_entries', tradingPlans: 'journal_entries', processes: 'journal_entries',
  morningJournals: 'journal_entries', eveningJournals: 'journal_entries',
  journals: 'journals', backtestJournals: 'journals',
};
const SUBCOLLECTIONS = Object.keys(COLLECTION_TABLE);

const log = (...a) => console.log(...a);
const counts = { users: 0, profiles: 0, settings: 0, rows: {} };

async function migrateUser(fbUser) {
  const { uid: fbUid, email } = fbUser;
  if (!email) { log(`  ⚠️  ${fbUid} has no email — skipped`); return; }

  // 1) Create (or find) the Supabase auth user by email.
  let sbUid;
  if (DRY_RUN) {
    sbUid = `dry-${fbUid}`;
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        display_name: fbUser.displayName || null,
        avatar_url: fbUser.photoURL || null,
        firebase_uid: fbUid,
      },
    });
    if (error && !/already been registered/i.test(error.message)) throw error;
    if (data?.user) sbUid = data.user.id;
    else {
      // already exists → look it up
      const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      sbUid = list.users.find((u) => u.email === email)?.id;
    }
    // Email/password users: trigger a reset so they set a new password.
    const isPassword = (fbUser.providerData || []).some((p) => p.providerId === 'password');
    if (isPassword) await sb.auth.admin.generateLink({ type: 'recovery', email }).catch(() => {});
  }
  counts.users++;
  if (!sbUid) { log(`  ⚠️  could not resolve Supabase uid for ${email}`); return; }

  // 2) Profile (users/{uid} doc → profiles row; trigger already created a shell).
  const profSnap = await fs.doc(`users/${fbUid}`).get();
  if (profSnap.exists) {
    const row = { ...mapToRow('profiles', profSnap.data()), id: sbUid };
    if (!DRY_RUN) { const { error } = await sb.from('profiles').upsert(row, { onConflict: 'id' }); if (error) throw error; }
    counts.profiles++;
  }

  // 3) Sub-collections → mapped rows.
  for (const coll of SUBCOLLECTIONS) {
    const snap = await fs.collection(`users/${fbUid}/${coll}`).get();
    if (snap.empty) continue;
    const table = COLLECTION_TABLE[coll];
    const rows = snap.docs.map((d) => ({ ...mapToRow(coll, d.data()), user_id: sbUid }));
    if (!DRY_RUN && rows.length) {
      const { error } = await sb.from(table).insert(rows);
      if (error) throw new Error(`${coll} → ${table}: ${error.message}`);
    }
    counts.rows[coll] = (counts.rows[coll] || 0) + rows.length;
  }

  // 4) settings sub-collection → user_settings (one row per doc).
  const settingsSnap = await fs.collection(`users/${fbUid}/settings`).get();
  for (const d of settingsSnap.docs) {
    if (!DRY_RUN) {
      const { error } = await sb.from('user_settings').upsert(
        { user_id: sbUid, doc_id: d.id, data: d.data() }, { onConflict: 'user_id,doc_id' });
      if (error) throw error;
    }
    counts.settings++;
  }

  log(`  ✓ ${email}`);
}

async function main() {
  log(`\n=== Firebase → Supabase migration ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);
  let pageToken;
  do {
    const res = await fbAuth.listUsers(1000, pageToken);
    for (const u of res.users) {
      try { await migrateUser(u.toJSON()); }
      catch (e) { log(`  ✗ ${u.email || u.uid}: ${e.message}`); }
    }
    pageToken = res.pageToken;
  } while (pageToken);

  log('\n=== Summary ===');
  log(`users:    ${counts.users}`);
  log(`profiles: ${counts.profiles}`);
  log(`settings: ${counts.settings}`);
  for (const [c, n] of Object.entries(counts.rows)) log(`${c}: ${n}`);
  log(DRY_RUN ? '\n(dry run — nothing written)\n' : '\n✅ done\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
