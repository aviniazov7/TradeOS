import { isClosedTrade, safePnl } from './calculations';

// Day bucket for the daily-loss banner. localDayKey follows the device clock;
// this alert is defined on Israel midnight, so it does not use that helper.
export function jerusalemDayKey(date = new Date()) {
  let d = date;
  if (typeof d?.toDate === 'function') d = d.toDate();
  else if (!(d instanceof Date)) d = new Date(d);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function closedToday(trades, today, journalId) {
  let net = 0;
  for (const trade of trades || []) {
    if (!trade || !isClosedTrade(trade)) continue;
    if (journalId && trade.journalId !== journalId) continue;
    const day = jerusalemDayKey(trade.exitDate || trade.entryDate);
    if (!day || day !== today) continue;
    net += safePnl(trade);
  }
  return Math.round(net * 100) / 100;
}

/**
 * Net result of today's closed trades against a fixed dollar cap.
 * Wins offset losses. Open trades and partial exits are ignored.
 * `show` is true only when the alert is on and |net| has reached the cap.
 */
export function dailyLossAlertState(trades, alert, { now = new Date(), journalId = null } = {}) {
  const amount = Number(alert?.amount);
  const off = !alert || alert.enabled !== true || !(amount > 0);
  const today = jerusalemDayKey(now);
  const net = today ? closedToday(trades, today, journalId) : 0;
  const loss = net < 0 ? Math.abs(net) : 0;
  return {
    show: !off && loss >= amount,
    net,
    loss,
    amount: amount > 0 ? amount : null,
  };
}

// What to merge onto the journal. Undefined means "do not write the field",
// so a journal that never enabled the alert stays without it. Demo never writes.
export function dailyLossAlertPatch(existing, input, { demo = false } = {}) {
  if (demo) return undefined;
  const amount = Number(input?.amount);
  const valid = Number.isFinite(amount) && amount > 0;
  const next = {
    enabled: input?.enabled === true && valid,
    amount: valid ? amount : null,
  };
  if (existing == null && !next.enabled) return undefined;
  return next;
}
