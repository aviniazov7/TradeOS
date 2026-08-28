// The value TradesProvider exposes, and its retry schedule — pure, so both can
// be tested. The provider itself cannot be: there is no jsdom or React testing
// library in this repo, which is exactly how the bug below shipped.
//
// Backoff rather than a fixed interval: a permission-denied does not heal until
// the Firestore rules are deployed by hand (CI cannot — see CLAUDE.md), and a
// tight 5 s loop against a listener that will keep refusing is a lot of
// connections for nothing. It still retries forever, just slower, so a
// transient network drop recovers fast and a structural failure settles down.
export const RETRY_MS = 5000;
export const RETRY_MAX_MS = 60000;
export const backoffMs = (n) => Math.min(RETRY_MS * 2 ** n, RETRY_MAX_MS);

const SIGNED_OUT = { allTrades: [], loading: false, error: null };
const AWAITING = { allTrades: [], loading: true, error: null };

/**
 * `snapshot` is stamped with the uid it came from and `failure` with the uid of
 * the listener that raised it, so neither can ever be served to a different
 * account.
 *
 * The failure is tracked BESIDE the snapshot rather than folded into it,
 * because folding it in could not work. The initial snapshot carries uid:null,
 * so the error handler's `prev.uid === uid` guard never matched before the
 * first successful read — and this function returned AWAITING regardless,
 * since the stamp still did not match the user. `loading` was structurally
 * unable to become false on an error, and the app sat on a full-page skeleton,
 * re-subscribing every five seconds, indefinitely.
 *
 * Note the order: a snapshot for this user wins over a failure for this user.
 * Clearing the failure on success is the success handler's job, but ordering
 * between two setState calls is not something to rely on for correctness.
 */
export function tradesValue(user, snapshot, failure) {
  if (!user) return SIGNED_OUT;
  if (snapshot.uid === user.uid) {
    return { allTrades: snapshot.allTrades, loading: snapshot.loading, error: null };
  }
  // Errored before any data arrived: stop the skeleton and say so. Reporting
  // loading:false with an empty list and NO error would be worse than the hang
  // it replaces — the journal would render its ordinary empty state and tell
  // the user they have no trades, which is a lie about their own records.
  if (failure && failure.uid === user.uid) {
    return { allTrades: [], loading: false, error: failure.code };
  }
  return AWAITING;
}
