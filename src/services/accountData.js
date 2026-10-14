/**
 * Firestore, the local wipe, and the deletion audit. Imported dynamically
 * from AuthContext only after a user is signed in, so the login route's
 * graph is firebase/auth and not the Firestore SDK.
 */
export {
  getUserProfile,
  setUserProfile,
  setUserSetting,
  subscribeToUserProfile,
  touchLastActive,
  timestamp,
  deleteUserProfile,
  deleteUserSubcollection,
  deleteLeaderboardEntry,
  USER_SUBCOLLECTIONS,
} from './firestoreService';
export { clearLocalAccountData } from './localData';
export { logAccountDeletion } from './pushService';
