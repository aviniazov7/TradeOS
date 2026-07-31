// Auth facade — the single switch point between Firebase Auth and Supabase Auth
// for the migration (Phase 3). AuthContext imports auth functions from HERE, so
// flipping USE_SUPABASE swaps the whole auth backend in one place.
//
// ⚠️ Default is Firebase (USE_SUPABASE off), so this changes NOTHING in
// production today. Supabase auth also needs the data/profile layer switched
// before the flag can actually be flipped — see the migration plan.

import * as firebaseAuth from './authService';
import * as supabaseAuth from './supabaseAuth';
import { USE_SUPABASE } from './supabaseService';

const impl = USE_SUPABASE ? supabaseAuth : firebaseAuth;

export const {
  isStandalone,
  onAuthChange,
  handleRedirectResult,
  loginWithGoogle,
  loginWithGoogleIdToken,
  registerWithEmail,
  loginWithEmail,
  logout,
  resetPassword,
  changePassword,
  reauthenticate,
  deleteAuthUser,
  getCurrentUser,
} = impl;
