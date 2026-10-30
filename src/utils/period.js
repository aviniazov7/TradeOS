// Shared period/date helpers for the stats hooks. Extracted from
// useDashboardStats + useBacktestStats, which carried byte-identical copies
// (issue #216 — dedup). Behaviour is unchanged.

// Start-of-period Date for 'week' | 'month' | 'year', or null for 'all'.
// `now` defaults to the current time — call only inside a useMemo/effect
// (or pass a fixed Date from a test), never in a render body.
export function getPeriodStart(period, now = new Date()) {
  switch (period) {
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'year': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    default:
      return null;
  }
}

// Firestore Timestamp / Date / string → Date. Falls back to the epoch for
// missing values so sorts stay stable (differs from formatters.safeDate,
// which returns null — callers here sort/compare and need a real Date).
export function toDate(d) {
  if (!d) return new Date(0);
  return d.toDate ? d.toDate() : new Date(d);
}
