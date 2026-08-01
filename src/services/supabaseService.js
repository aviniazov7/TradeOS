import { supabase } from './supabase';
import { mapToRow, mapFromRow } from './supabaseMap';
import { APP_VERSION } from '../utils/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Parallel data layer over Supabase, mirroring the shape of firestoreService so
// hooks/components can switch with minimal changes (Firestore → Supabase
// migration, Phase 2 — see docs/redesign/supabase-migration-plan.md).
//
// ⚠️ NOT wired into the live app. Gated by VITE_USE_SUPABASE (default OFF).
// ⚠️ WIP: written against the schema in the migration plan but NOT yet tested
//    against the live project (jzlbactamdjyzqjlfunr). Validate each query once
//    the Supabase MCP connector is pointed at the new account.
// ─────────────────────────────────────────────────────────────────────────────

// Feature flag — the app reads/writes Supabase only when this is on. Default OFF
// so production is untouched until the cutover.
export const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true';

// Firestore sub-collection name → Supabase table. Only the clean 1:1 mappings
// are here. The ambiguous ones are pending a mapping decision (migration plan):
//   journals / backtestJournals / tradingPlans / notes / processes /
//   morningJournals / eveningJournals → journal_entries (kind=…)?
//   settings → profiles (json)? · payments / adminNotes → dedicated tables.
export const COLLECTION_TABLE = {
  trades: 'trades',
  backtests: 'backtests',
  strategies: 'strategies',
  signals: 'signals',
  dca: 'dca_plans',
  watchlist: 'watchlist_items',
  // journal family — several collections share one table, split by a filter:
  notes: 'journal_entries',
  tradingPlans: 'journal_entries',
  processes: 'journal_entries',
  morningJournals: 'journal_entries',
  eveningJournals: 'journal_entries',
  journals: 'journals',
  backtestJournals: 'journals',
};

// Discriminator filter for collections that share a table. MUST stay in sync
// with the `fixed` values in supabaseMap (written on insert, filtered on read).
const COLLECTION_FILTER = {
  notes: { kind: 'note' },
  tradingPlans: { kind: 'plan' },
  processes: { kind: 'process' },
  morningJournals: { kind: 'morning' },
  eveningJournals: { kind: 'evening' },
  journals: { is_backtest: false },
  backtestJournals: { is_backtest: true },
};

function tableFor(collectionName) {
  const table = COLLECTION_TABLE[collectionName];
  if (!table) throw new Error(`supabaseService: no table mapped for "${collectionName}"`);
  return table;
}

// Scope a select to the user + the collection's discriminator filter.
function scopedSelect(collectionName, uid) {
  let q = supabase.from(tableFor(collectionName)).select('*').eq('user_id', uid);
  const f = COLLECTION_FILTER[collectionName];
  if (f) for (const [k, v] of Object.entries(f)) q = q.eq(k, v);
  return q;
}

// Realtime subscription to a user's rows in a table — mirrors Firestore's
// subscribeToUserCollection (onSnapshot). Signature matches firestoreService:
// (uid, collectionName, options, onData, onError). `options` (orderField /
// whereFilters) is accepted for parity but ignored — the app re-sorts client
// side and the row sets are small. Loads once, then re-fetches on any change.
// Returns an unsubscribe function.
export function subscribeToUserCollection(uid, collectionName, _options, onData, onError) {
  const table = tableFor(collectionName);
  let active = true;
  let seq = 0;

  const emit = async () => {
    const mine = ++seq;
    const { data, error } = await scopedSelect(collectionName, uid);
    if (!active || mine !== seq) return; // superseded by a newer refetch (latest-wins)
    if (error) { onError?.(error); return; }
    onData((data || []).map((r) => mapFromRow(collectionName, r)));
  };

  emit(); // initial load

  const channel = supabase
    // per-COLLECTION topic — collections that share a table (journal_entries,
    // journals) must not collide on the same channel name.
    .channel(`sb:${collectionName}:${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `user_id=eq.${uid}` },
      emit,
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

export async function addToUserCollection(uid, collectionName, data) {
  const table = tableFor(collectionName);
  const { data: row, error } = await supabase
    .from(table)
    .insert({ ...mapToRow(collectionName, data), user_id: uid })
    .select()
    .single();
  if (error) throw error;
  return mapFromRow(collectionName, row);
}

// Matches firestoreService: (uid, collection, items, onProgress) → committed count,
// inserted in chunks (Supabase caps large single inserts).
export async function addToUserCollectionBulk(uid, collectionName, items, onProgress) {
  const table = tableFor(collectionName);
  const rows = (items || []).map((d) => ({ ...mapToRow(collectionName, d), user_id: uid }));
  let committed = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
    committed += chunk.length;
    onProgress?.(committed, rows.length);
  }
  return committed;
}

export async function updateUserDocument(uid, collectionName, id, data) {
  const table = tableFor(collectionName);
  const patch = mapToRow(collectionName, data);
  // Firestore updateDoc/setDoc(merge) keeps untouched fields; a Postgres UPDATE
  // of the `meta` jsonb would REPLACE it. Merge with the existing meta so a
  // partial update (e.g. DCA addEntry) doesn't wipe the other meta keys.
  if (patch.meta) {
    const { data: existing } = await supabase.from(table).select('meta').eq('id', id).eq('user_id', uid).maybeSingle();
    patch.meta = { ...(existing?.meta || {}), ...patch.meta };
  }
  const { error } = await supabase.from(table).update(patch).eq('id', id).eq('user_id', uid);
  if (error) throw error;
}

export async function deleteUserDocument(uid, collectionName, id) {
  const table = tableFor(collectionName);
  const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', uid);
  if (error) throw error;
}

export async function getUserCollectionDocs(uid, collectionName) {
  const { data, error } = await scopedSelect(collectionName, uid);
  if (error) throw error;
  return (data || []).map((r) => mapFromRow(collectionName, r));
}

export async function getUserDocument(uid, collectionName, docId) {
  let q = supabase.from(tableFor(collectionName)).select('*').eq('id', docId).eq('user_id', uid);
  const f = COLLECTION_FILTER[collectionName];
  if (f) for (const [k, v] of Object.entries(f)) q = q.eq(k, v);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data ? mapFromRow(collectionName, data) : null;
}

// ── Profile (mirror of the Firestore user doc). profiles.id === auth user id ──
// Same API shape as firestoreService so AuthContext can switch via the facade.

export async function getUserProfile(uid) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return { exists: !!data, data: data ? mapFromRow('profiles', data) : null };
}

export function subscribeToUserProfile(uid, callback, onError) {
  let active = true;
  let seq = 0;
  const emit = async () => {
    const mine = ++seq;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (!active || mine !== seq) return;
    if (error) { onError?.(error); return; }
    // Match Firestore: only emit when the row exists — a spurious null used to
    // race the initial getUserProfile() and blank isAdmin/isPremium.
    if (data) callback(mapFromRow('profiles', data));
  };
  emit();
  const channel = supabase
    .channel(`sb:profiles:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, emit)
    .subscribe();
  return () => { active = false; supabase.removeChannel(channel); };
}

export async function setUserProfile(uid, data) {
  const patch = mapToRow('profiles', data);
  // Firestore setDoc(merge:true) deep-merges nested maps; a Postgres upsert
  // REPLACES the settings/meta jsonb. Merge them so a partial write (e.g.
  // { settings: { journalMigrated: true } }) doesn't wipe defaultLeverage etc.
  if (patch.settings || patch.meta) {
    const { data: existing } = await supabase.from('profiles').select('settings, meta').eq('id', uid).maybeSingle();
    if (patch.settings) patch.settings = { ...(existing?.settings || {}), ...patch.settings };
    if (patch.meta) patch.meta = { ...(existing?.meta || {}), ...patch.meta };
  }
  const { error } = await supabase.from('profiles').upsert({ ...patch, id: uid }, { onConflict: 'id' });
  if (error) throw error;
}

export async function touchLastActive(uid) {
  const { error } = await supabase.from('profiles')
    .update({ last_active: new Date().toISOString(), app_version: APP_VERSION })
    .eq('id', uid);
  if (error) throw error;
}

// ── User settings (Firestore users/{uid}/settings/{docId} → user_settings) ────
export function subscribeToUserSetting(uid, docId, callback) {
  let active = true;
  let seq = 0;
  const emit = async () => {
    const mine = ++seq;
    const { data } = await supabase.from('user_settings').select('data').eq('user_id', uid).eq('doc_id', docId).maybeSingle();
    if (active && mine === seq) callback(data?.data ?? null);
  };
  emit();
  const channel = supabase
    .channel(`sb:user_settings:${uid}:${docId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${uid}` }, emit)
    .subscribe();
  return () => { active = false; supabase.removeChannel(channel); };
}

export async function setUserSetting(uid, docId, data) {
  const { error } = await supabase.from('user_settings').upsert({ user_id: uid, doc_id: docId, data }, { onConflict: 'user_id,doc_id' });
  if (error) throw error;
}

// ── Firestore-parity helpers ─────────────────────────────────────────────────
// timestamp(): Firestore returns a serverTimestamp() sentinel; on Supabase a
// plain Date works (the mapper turns it into an ISO string, and columns also
// default to now()). dateToTimestamp(): pass the Date through (mapper handles it).
export function timestamp() { return new Date(); }
export function dateToTimestamp(date) { return date; }
