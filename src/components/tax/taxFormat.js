import { LRM } from '../../utils/formatters';

// Shekel amount for the tax report. LRM keeps the sign on the left inside RTL
// text ("-₪1,234.00", not "₪1,234.00-").
//   signed — '+' on positives (P&L); off for plain amounts (tax, fees)
export function formatIls(value, { signed = true, decimals = 2 } = {}) {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  let sign = value < 0 ? '-' : '';
  if (signed && value > 0) sign = '+';
  return `${LRM}${sign}₪${abs}`;
}

export function formatUsd(value, { signed = true, decimals = 2 } = {}) {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  let sign = value < 0 ? '-' : '';
  if (signed && value > 0) sign = '+';
  return `${LRM}${sign}$${abs}`;
}

export const formatRate = (r) => (r == null || !Number.isFinite(r) ? '—' : r.toFixed(r < 10 ? 4 : 2).replace(/0+$/, '').replace(/\.$/, ''));

// 'YYYY-MM-DD' → 'DD/MM/YYYY'
export const formatDay = (day) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '—');

export const pnlTone = (v) => (v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-secondary');

export const DIRECTION_LABELS = { long: 'לונג', short: 'שורט' };
