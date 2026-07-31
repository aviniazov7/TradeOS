import { supabase } from './supabase';

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
};

function tableFor(collectionName) {
  const table = COLLECTION_TABLE[collectionName];
  if (!table) throw new Error(`supabaseService: no table mapped for "${collectionName}"`);
  return table;
}

// Realtime subscription to a user's rows in a table — mirrors Firestore's
// subscribeToUserCollection (onSnapshot). Loads once, then re-fetches on any
// insert/update/delete for this user. Returns an unsubscribe function.
export function subscribeToUserCollection(uid, collectionName, callback, onError) {
  const table = tableFor(collectionName);
  let active = true;

  const emit = async () => {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', uid);
    if (!active) return;
    if (error) { onError?.(error); return; }
    callback(data || []);
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
    .insert({ ...data, user_id: uid })
    .select()
    .single();
  if (error) throw error;
  return row;
}

export async function addToUserCollectionBulk(uid, collectionName, items) {
  const table = tableFor(collectionName);
  const rows = (items || []).map((d) => ({ ...d, user_id: uid }));
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw error;
  return data || [];
}

export async function updateUserDocument(uid, collectionName, id, data) {
  const table = tableFor(collectionName);
  const { error } = await supabase.from(table).update(data).eq('id', id).eq('user_id', uid);
  if (error) throw error;
}

export async function deleteUserDocument(uid, collectionName, id) {
  const table = tableFor(collectionName);
  const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', uid);
  if (error) throw error;
}

export async function getUserCollectionDocs(uid, collectionName) {
  const table = tableFor(collectionName);
  const { data, error } = await supabase.from(table).select('*').eq('user_id', uid);
  if (error) throw error;
  return data || [];
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
