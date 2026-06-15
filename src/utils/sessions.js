// Trading session detection — uses Israel timezone (Asia/Jerusalem, UTC+2/+3)
// Single source of truth used by both the trade entry form and the dashboard analytics,
// so a trade is always classified the same way regardless of where it's displayed.

const FALLBACK_LABEL = 'Asia';

function israelHour(date) {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Jerusalem',
    }).format(date),
    10,
  );
}

export function getSessionFromDate(value, { fallback = FALLBACK_LABEL } = {}) {
  if (!value) return '';
  const d = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
  if (!d || isNaN(d.getTime())) return fallback;
  const h = israelHour(d);
  if (h >= 14 && h < 18) return 'London/NY Overlap';
  if (h >= 9 && h < 14) return 'London';
  if (h >= 18 && h < 23) return 'New York';
  // 23:00–09:00 Israel = Asian session. Return it explicitly so a valid
  // overnight trade is never collapsed into the invalid-date `fallback`
  // (callers like the dashboard pass fallback: SESSION_UNKNOWN).
  return 'Asia';
}

// Dashboard label for trades that don't have an entry date (legacy / partial data).
export const SESSION_UNKNOWN = 'לא צוין';
