import { format, formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

// Invisible LEFT-TO-RIGHT MARK. A signed number shown inside Hebrew (RTL)
// text loses its sign to the end ("$14.13-") because the sign and "$" carry no
// direction of their own. Prefixing the mark keeps it "-$14.13" everywhere —
// it renders as nothing and survives copy/paste harmlessly.
export const LRM = '\u200E';

/**
 * Format currency value: $1,234.56
 */
export function formatCurrency(value, decimals = 2) {
  if (value == null || isNaN(value)) return '$0.00';
  const sign = value >= 0 ? '+' : '-';
  return `${LRM}${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Signed money for tight spots (small tiles on a phone): full value up to
 * $99,999.99, then $123.4K / $1.12M so it never has to be cut.
 */
export function formatCurrencyShort(value) {
  if (value == null || isNaN(value)) return '$0.00';
  const abs = Math.abs(value);
  if (abs < 1e5) return formatCurrency(value);
  const sign = value >= 0 ? '+' : '-';
  const body = abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : `${(abs / 1e3).toFixed(1)}K`;
  return `${LRM}${sign}$${body}`;
}

/**
 * Format percentage: +3.85%
 */
export function formatPercent(value, decimals = 2) {
  if (value == null || isNaN(value)) return '0.00%';
  const sign = value >= 0 ? '+' : '-';
  return `${LRM}${sign}${Math.abs(value).toFixed(decimals)}%`;
}

/**
 * Format number with commas: 1,234.56
 */
export function formatNumber(value, decimals = 2) {
  if (value == null || isNaN(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format price with smart decimals based on magnitude
 * BTC ($80,000) → 2 decimals, ETH ($3,000) → 2, small coins (<$1) → up to 8
 */
export function formatPrice(value) {
  if (value == null || isNaN(value) || value === 0) return '0';
  const abs = Math.abs(value);
  let decimals;
  if (abs >= 100) decimals = 2;
  else if (abs >= 1) decimals = 4;
  else if (abs >= 0.01) decimals = 6;
  else decimals = 8;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

/**
 * Compact USD for big aggregates: $1.50T / $2.3B / $4.5M / $12,345.
 * Used for market cap, 24h volume, open interest and liquidation totals.
 * 0 / null / NaN render as an em-dash. (Consolidated from local copies in
 * MarketOverview, CoinAnalysis and Dashboard — issue #216.)
 */
export function formatCompactUsd(n) {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

/**
 * Coin price with a $ prefix and magnitude-aware decimals:
 * ≥ $1 → up to 2 decimals with grouping, < $1 → 6 decimals.
 * (Consolidated from the identical local copies in MarketOverview,
 * CoinAnalysis and ChatChart — issue #216. SignalCard keeps its own no-$
 * variant on purpose.)
 */
export function formatCoinPrice(p) {
  if (!p && p !== 0) return '—';
  if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(6)}`;
}

/**
 * Format date: 17/03/2026
 */
// Exported: Firestore Timestamp / Date / string / garbage → Date or null.
// Callers that feed date-fns MUST use this — format() on an Invalid Date
// throws RangeError and takes the whole screen down with it.
export function safeDate(date) {
  if (!date) return null;
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

export function formatDate(date) {
  const d = safeDate(date);
  if (!d) return '—';
  return format(d, 'dd/MM/yyyy');
}

/**
 * Format date with time: 17/03/2026 14:30
 */
export function formatDateTime(date) {
  const d = safeDate(date);
  if (!d) return '—';
  return format(d, 'dd/MM/yyyy HH:mm');
}

/**
 * Format short date: 17/03
 */
export function formatDateShort(date) {
  const d = safeDate(date);
  if (!d) return '—';
  return format(d, 'dd/MM');
}

/**
 * Format time: 14:30
 */
export function formatTime(date) {
  const d = safeDate(date);
  if (!d) return '—';
  return format(d, 'HH:mm');
}

/**
 * Relative time: "2 hours ago"
 */
export function formatRelativeTime(date) {
  const d = safeDate(date);
  if (!d) return '—';
  return formatDistanceToNow(d, { addSuffix: true, locale: he });
}

/**
 * Format duration in hours to Hebrew string
 */
export function formatDuration(hours) {
  if (!hours || hours <= 0) return '–';
  if (hours < 1) return `${Math.round(hours * 60)} דקות`;
  if (hours < 24) return `${hours.toFixed(1)} שעות`;
  const days = hours / 24;
  return `${days.toFixed(1)} ימים`;
}

/**
 * Format R multiple: +1.92R or -1.00R
 * Pass pnl to determine sign (positive for wins, negative for losses)
 */
export function formatRR(value, pnl) {
  if (!value || isNaN(value)) return '–';
  const isLoss = pnl !== undefined && pnl < 0;
  return `${LRM}${isLoss ? '-' : ''}${value.toFixed(2)}R`;
}
