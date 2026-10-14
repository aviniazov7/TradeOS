import { format } from 'date-fns';

/** Pad the month grid into Sunday-first weeks of 7 (null = leading/trailing blank). */
export function chunkWeeks(days) {
  const weeks = [];
  const list = days || [];
  for (let i = 0; i < list.length; i += 7) {
    const slice = list.slice(i, i + 7);
    while (slice.length < 7) slice.push(null);
    weeks.push(slice);
  }
  return weeks;
}

/** Trade count and net P&L for one week row. Blank cells contribute nothing. */
export function weekTotals(weekDays, dailyData) {
  let pnl = 0;
  let count = 0;
  for (const day of weekDays || []) {
    if (!day) continue;
    const data = dailyData?.[format(day, 'yyyy-MM-dd')];
    if (!data) continue;
    pnl += data.pnl || 0;
    count += data.trades?.length || 0;
  }
  return { pnl, count };
}
