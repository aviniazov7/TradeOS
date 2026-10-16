import { exchangeLabel } from './constants';

/**
 * Account balance the position calculator should start from.
 * A positive live wallet wins; otherwise a positive opening balance saved on
 * the journal; otherwise nothing (the field stays empty).
 */
export function journalAccountBalance(journal, liveBalance) {
  const live = Number(liveBalance);
  if (Number.isFinite(live) && live > 0) return live;
  const initial = Number(journal?.initialBalance);
  if (Number.isFinite(initial) && initial > 0) return initial;
  return null;
}

/**
 * Risk the calculator should start from.
 * A positive value saved on the journal wins. An unset percent risk (stored
 * as 0 when the journal form was left blank) falls back to 1 — the same
 * default the profile uses — so entry, stop and target can produce a size.
 * A fixed-dollar risk with nothing saved stays blank.
 */
export function calculatorRiskValue(journal) {
  const n = Number(journal?.riskValue);
  if (Number.isFinite(n) && n > 0) return String(n);
  if ((journal?.riskType || 'percent') === 'fixed') return '';
  return '1';
}

/** Two-decimal string for the balance input. Empty when there is no balance. */
export function formatBalanceInput(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || !(n > 0)) return '';
  const shifted = Number(`${n}e2`);
  const rounded = Number.isFinite(shifted) ? Math.round(shifted) / 100 : Math.round(n * 100) / 100;
  return rounded.toFixed(2);
}

/** "סקלפינג · Bybit", or just "MEXC" when the journal is already named for the venue. */
export function calculatorJournalLabel(journal) {
  const name = String(journal?.name || '').trim();
  const ex = exchangeLabel(journal?.exchange);
  if (name && ex && name.localeCompare(ex, undefined, { sensitivity: 'accent' }) !== 0) {
    return `${name} · ${ex}`;
  }
  return name || ex || 'יומן';
}

/** Where the filled balance came from, so a multi-journal account can see it. */
export function calculatorBalanceCaption(journal, liveBalance) {
  if (!journal) return '';
  const label = calculatorJournalLabel(journal);
  const live = Number(liveBalance);
  if (Number.isFinite(live) && live > 0) return `ארנק ${label}`;
  const initial = Number(journal.initialBalance);
  if (Number.isFinite(initial) && initial > 0) return `יתרה התחלתית · ${label}`;
  return '';
}
