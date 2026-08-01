import { supabase } from './supabase';
import { mapToRow, mapFromRow } from './supabaseMap';

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
// subscribeToUserCollection (onSnapshot). Loads once, then re-fetches on any
// insert/update/delete for this user. Returns an unsubscribe function.
export function subscribeToUserCollection(uid, collectionName, callback, onError) {
  const table = tableFor(collectionName);
  let active = true;

  const emit = async () => {
    const { data, error } = await scopedSelect(collectionName, uid);
    if (!active) return;
    if (error) { onError?.(error); return; }
    callback((data || []).map((r) => mapFromRow(collectionName, r)));
  };

  emit(); // initial load

  const channel = supabase
    .channel(`${table}:${uid}`)
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

export async function addToUserCollectionBulk(uid, collectionName, items) {
  const table = tableFor(collectionName);
  const rows = (items || []).map((d) => ({ ...mapToRow(collectionName, d), user_id: uid }));
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw error;
  return (data || []).map((r) => mapFromRow(collectionName, r));
}

export async function updateUserDocument(uid, collectionName, id, data) {
  const table = tableFor(collectionName);
  const { error } = await supabase.from(table).update(mapToRow(collectionName, data)).eq('id', id).eq('user_id', uid);
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

// Profile (mirror of the user doc). profiles.id === auth user id.
export async function getProfile(uid) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(uid, data) {
  const { error } = await supabase.from('profiles').update(data).eq('id', uid);
  if (error) throw error;
}
