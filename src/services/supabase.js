import { createClient } from '@supabase/supabase-js';

// Supabase client for the TradeOS redesign (project ref: mrgxbvsyiujqbvmtccbu).
//
// Like the Firebase config, the URL + anon (publishable) key are intentionally
// public: the real security boundary is Row Level Security on every table, not
// this key. We hardcode them as fallbacks so the app never breaks when a deploy
// environment forgets the env vars, and still allow override via VITE_SUPABASE_*.
//
// ⚠️ Not wired into the live app yet. This just makes the client available so
// the migration (Firestore → Supabase) can be built incrementally. Nothing in
// production reads from here until the service layer is switched over.
const DEFAULTS = {
  url: 'https://mrgxbvsyiujqbvmtccbu.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZ3hidnN5aXVqcWJ2bXRjY2J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MDgxMTcsImV4cCI6MjEwMDI4NDExN30.fZqJGmOCqwmuF1HyVE92O83h2iiH66RODyY3rgEF39E',
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
