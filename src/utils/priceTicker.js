// What the header price ticker should show, given how many quotes are ready
// and the state of the feeds behind them. Pure so it can be unit-tested.

// Below this many items the strip doesn't scroll: the marquee loops by
// rendering the list twice, so a lone quote (e.g. gold when the crypto feed
// failed) would otherwise show up twice side by side.
export const MIN_SCROLL_ITEMS = 5;

/**
 * @param {{ itemCount: number, loading: boolean, failed: boolean }} s
 *   loading — some enabled feed hasn't answered yet
 *   failed  — some enabled feed's latest attempt returned nothing
 * @returns {{ state: 'loading'|'error'|'ready', scroll?: boolean, showRetry?: boolean }}
 */
export function tickerView({ itemCount, loading, failed }) {
  if (itemCount > 0) {
    return { state: 'ready', scroll: itemCount >= MIN_SCROLL_ITEMS, showRetry: Boolean(failed) && !loading };
  }
  if (loading) return { state: 'loading' };
  return { state: 'error' };
}
