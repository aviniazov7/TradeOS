// Trade-tape labels stay in English — the market names, outcomes and venue are
// English, so mixing Hebrew verbs into the same row reads worse than keeping
// the whole line in one language.

/** "now" · "5m ago" · "3h ago" · "2d ago" — from a unix-seconds timestamp. */
export function timeAgoEn(ts) {
  if (!ts) return '';
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (secs < 60) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** BUY / SELL, falling back to the raw activity type (REDEEM, SPLIT…). */
export function sideLabelEn(side, type) {
  if (side === 'BUY') return 'BUY';
  if (side === 'SELL') return 'SELL';
  return type || '—';
}

/** "1.6M shares" — compact share count. */
export function fmtSharesEn(n) {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}
