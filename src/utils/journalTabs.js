// Crypto journals get the exchange hub. Stock and futures journals do not:
// there is no exchange sync for them. `positions` is the old open-positions
// tab; it lands on the same hub.
export const CRYPTO_JOURNAL_TABS = ['trades', 'exchange', 'analytics', 'calendar'];
export const OTHER_JOURNAL_TABS = ['trades', 'analytics', 'calendar'];

export function resolveJournalTab(param, { crypto = true } = {}) {
  const requested = param === 'positions' ? 'exchange' : (param || 'trades');
  const tabs = crypto ? CRYPTO_JOURNAL_TABS : OTHER_JOURNAL_TABS;
  return tabs.includes(requested) ? requested : 'trades';
}
