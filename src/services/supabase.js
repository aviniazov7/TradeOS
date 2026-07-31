import { createClient } from '@supabase/supabase-js';

// Supabase client for the TradeOS migration.
// Project: tradeos-prod (ref: jzlbactamdjyzqjlfunr), dedicated account
// tradeos.app@gmail.com, eu-central-1 (Frankfurt).
//
// Like the Firebase config, the URL + publishable key are intentionally public:
// the real security boundary is Row Level Security on every table, not this key.
// (This is a new-generation `sb_publishable_...` key, which recent supabase-js
// accepts in place of the legacy JWT anon key.) Hardcoded as fallbacks so the
// app never breaks if a deploy forgets the env vars; override via VITE_SUPABASE_*.
//
// ⚠️ Not wired into the live app yet. This just makes the client available so
// the migration (Firestore → Supabase) can be built incrementally. Nothing in
// production reads from here until the service layer is switched over.
const DEFAULTS = {
  url: 'https://jzlbactamdjyzqjlfunr.supabase.co',
  anonKey: 'sb_publishable_JOhIQHxfrgd-Cr9iW8atOw_RbFudT9f',
};

const pickEnv = (key, fallback) => {
  const v = import.meta.env[key];
  if (!v || typeof v !== 'string' || v.startsWith('your_')) return fallback;
  return v;
};

const supabaseUrl = pickEnv('VITE_SUPABASE_URL', DEFAULTS.url);
const supabaseAnonKey = pickEnv('VITE_SUPABASE_ANON_KEY', DEFAULTS.anonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
