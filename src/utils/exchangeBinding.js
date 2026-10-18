import { isUnsetExchange } from './constants';

// What to do with the journal after a successful connect (or a Binance CSV
// import). A journal already tied to a real venue is left alone — connecting
// a second exchange must not retag it. A blank / `other` journal takes the
// venue that was just connected, which is what makes the live balance and
// the proposal banner show up.
export function planJournalExchangeBind({ journals = [], activeJournalId, exchangeId } = {}) {
  if (!exchangeId || isUnsetExchange(exchangeId)) return { action: 'none' };
  const active = (journals || []).filter((j) => j && !j.archived);
  const same = active.find((j) => j.exchange === exchangeId);
  if (same) return { action: 'select', journalId: same.id };

  const current = active.find((j) => j.id === activeJournalId) || active[0] || null;
  if (!current) return { action: 'create', exchangeId };
  if (isUnsetExchange(current.exchange)) {
    return { action: 'patch', journalId: current.id, exchange: exchangeId };
  }
  return { action: 'keep', journalId: current.id };
}
