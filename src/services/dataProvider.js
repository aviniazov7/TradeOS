// Data facade — the single switch point between Firestore and Supabase for the
// app's per-user data (migration Phase 5). Hooks + AuthContext import the data
// functions from HERE, so flipping USE_SUPABASE swaps the whole data backend.
//
// ⚠️ Default is Firestore (USE_SUPABASE off), so this changes NOTHING in
// production today — it resolves to the exact same firestoreService functions.
// Only the SHARED per-user API is routed here; cross-cutting collections
// (leaderboard / payments / push / audit) stay on firestoreService until the
// server-side (Worker) migration.

import * as firestore from './firestoreService';
import * as supabase from './supabaseService';
import { USE_SUPABASE } from './supabaseService';

const impl = USE_SUPABASE ? supabase : firestore;

export const {
  subscribeToUserCollection,
  addToUserCollection,
  addToUserCollectionBulk,
  updateUserDocument,
  deleteUserDocument,
  getUserDocument,
  getUserCollectionDocs,
  subscribeToUserSetting,
  setUserSetting,
  getUserProfile,
  subscribeToUserProfile,
  setUserProfile,
  touchLastActive,
  timestamp,
  dateToTimestamp,
} = impl;
