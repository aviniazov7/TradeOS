import { isClosedTrade, safePnl } from './calculations';
import { jerusalemDayKey } from './dailyLossAlert';

// Journal risk rules beyond the existing daily dollar alert.
// Closed trades only. The clock is Asia/Jerusalem. The week starts on Sunday.
// evaluateJournalRisk only measures. journalRiskRulesPatch only shapes the
// object a journal may store. Neither reads nor writes Firestore, and neither
// decides how a banner is drawn. Recording a trade stays allowed.

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function asDate(value) {
  let d = value;
  if (typeof d?.toDate === 'function') d = d.toDate();
  else if (!(d instanceof Date)) d = new Date(d);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d;
}

function shiftDayKey(dayKey, deltaDays) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return '';
  const shifted = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + deltaDays,
  ));
  return shifted.toISOString().slice(0, 10);
}

function weekdayIndex(date) {
  const d = asDate(date);
  if (!d) return null;
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  }).format(d);
  return WEEKDAY_INDEX[name] ?? null;
}

/** Sunday YYYY-MM-DD of the Israel week that contains `date`. */
export function jerusalemWeekStart(date = new Date()) {
  const day = jerusalemDayKey(date);
  const index = weekdayIndex(date);
  if (!day || index == null) return '';
  return shiftDayKey(day, -index);
}

/** Minutes after Israel midnight. 00:00 is 0. Invalid dates return null. */
export function jerusalemMinutes(date = new Date()) {
  const d = asDate(date);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  let hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour === 24) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isOn(rule) {
  return rule?.enabled === true;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function lossOf(net) {
  return net < 0 ? Math.abs(net) : 0;
}

function closeInstant(trade) {
  return trade.exitDate || trade.entryDate;
}

function entryInstant(trade) {
  return trade.entryDate || trade.exitDate;
}

function closedInJournal(trades, journalId) {
  const out = [];
  for (const trade of trades || []) {
    if (!trade || !isClosedTrade(trade)) continue;
    if (journalId && trade.journalId !== journalId) continue;
    out.push(trade);
  }
  return out;
}

// Loss and the daily count use the close day, falling back to the entry day
// for an import that has no exit. Same bucket as the daily dollar alert.
function booked(trades, acceptDay) {
  let net = 0;
  let count = 0;
  for (const trade of trades) {
    const day = jerusalemDayKey(closeInstant(trade));
    if (!day || !acceptDay(day)) continue;
    net += safePnl(trade);
    count += 1;
  }
  return { net: roundMoney(net), count };
}

function amountState(rule, book) {
  const cap = isOn(rule) ? positive(rule.amount) : null;
  const loss = lossOf(book.net);
  return {
    enabled: cap != null,
    breached: cap != null && loss >= cap,
    net: book.net,
    loss,
    cap,
    trades: book.count,
  };
}

// `balance` is the journal opening balance the caller already has. The cap
// does not move with today's result. No positive balance means the percent
// cannot be measured, so it is not a breach.
function percentState(rule, book, balance) {
  const percent = isOn(rule) ? positive(rule.percent) : null;
  const base = positive(balance);
  const cap = percent != null && base != null ? roundMoney(base * (percent / 100)) : null;
  const loss = lossOf(book.net);
  return {
    enabled: percent != null,
    measurable: cap != null,
    breached: cap != null && loss >= cap,
    net: book.net,
    loss,
    cap,
    percent,
    balance: base,
    trades: book.count,
  };
}

function maxTradesState(rule, count) {
  const max = isOn(rule) ? positive(rule.count) : null;
  return {
    enabled: max != null,
    breached: max != null && count >= max,
    count,
    max,
  };
}

function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function clockLabel(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// End is exclusive. A window may cross midnight (22:00–02:00).
// Identical ends are not a window.
function containsMinute(minute, start, end) {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

// Hours look at the entry clock, and only when that entry falls on the
// evaluation day. Closing yesterday's trade this afternoon is not a new
// session. The current clock is reported and is not itself a breach.
function hoursState(rule, trades, dayKey, now) {
  const start = isOn(rule) ? parseClock(rule.start) : null;
  const end = isOn(rule) ? parseClock(rule.end) : null;
  const windowOk = start != null && end != null && start !== end;
  let outsideCount = 0;
  if (windowOk && dayKey) {
    for (const trade of trades) {
      const instant = entryInstant(trade);
      if (instant == null || instant === '') continue;
      const day = jerusalemDayKey(instant);
      const minute = jerusalemMinutes(instant);
      if (day !== dayKey || minute == null) continue;
      if (!containsMinute(minute, start, end)) outsideCount += 1;
    }
  }
  const nowMinute = jerusalemMinutes(now);
  const nowInside = windowOk && nowMinute != null ? containsMinute(nowMinute, start, end) : null;
  return {
    enabled: windowOk,
    breached: windowOk && outsideCount > 0,
    start: windowOk ? clockLabel(start) : null,
    end: windowOk ? clockLabel(end) : null,
    nowInside,
    outsideCount,
  };
}

/**
 * Measure the journal risk rules against closed trades.
 *
 * `rules.weeklyLoss` is a dollar cap for the Israel week (Sunday–Saturday).
 * `rules.dailyLossPercent` and `rules.weeklyLossPercent` are caps as a percent
 * of `balance` (the opening balance). `rules.maxTradesPerDay` counts closed
 * trades booked today. `rules.tradingHours` is an Israel clock window.
 *
 * A missing or disabled rule stays off. Wins offset losses. Reaching a cap
 * counts as a breach, same as the daily dollar alert.
 */
export function evaluateJournalRisk(trades, rules, {
  now = new Date(),
  journalId = null,
  balance = null,
} = {}) {
  const dayKey = jerusalemDayKey(now);
  const weekStart = jerusalemWeekStart(now);
  const weekEnd = weekStart ? shiftDayKey(weekStart, 6) : '';
  const closed = closedInJournal(trades, journalId);
  const today = booked(closed, (day) => day === dayKey);
  const week = booked(closed, (day) => !!weekStart && day >= weekStart && day <= weekEnd);
  const weeklyLoss = amountState(rules?.weeklyLoss, week);
  const dailyLossPercent = percentState(rules?.dailyLossPercent, today, balance);
  const weeklyLossPercent = percentState(rules?.weeklyLossPercent, week, balance);
  const maxTrades = maxTradesState(rules?.maxTradesPerDay, today.count);
  const tradingHours = hoursState(rules?.tradingHours, closed, dayKey, now);
  const breached = weeklyLoss.breached
    || dailyLossPercent.breached
    || weeklyLossPercent.breached
    || maxTrades.breached
    || tradingHours.breached;
  return {
    dayKey,
    weekStart,
    weeklyLoss,
    dailyLossPercent,
    weeklyLossPercent,
    maxTrades,
    tradingHours,
    breached,
  };
}

function roundMoneyOrNull(value) {
  const n = positive(value);
  if (n == null) return null;
  const rounded = roundMoney(n);
  return rounded > 0 ? rounded : null;
}

function clockOrNull(value) {
  const minutes = parseClock(value);
  return minutes == null ? null : clockLabel(minutes);
}

// A switch without a positive value, or without a real hour window, stays off.
// A positive number is stored either way, so switching a rule off keeps the
// number the form still holds. Empty clocks stay null.
function normalizeJournalRiskRules(input) {
  const weeklyAmount = roundMoneyOrNull(input?.weeklyLoss?.amount);
  const dailyPercent = roundMoneyOrNull(input?.dailyLossPercent?.percent);
  const weeklyPercent = roundMoneyOrNull(input?.weeklyLossPercent?.percent);
  const trades = roundMoneyOrNull(input?.maxTradesPerDay?.count);
  const start = clockOrNull(input?.tradingHours?.start);
  const end = clockOrNull(input?.tradingHours?.end);
  const hoursOn = start != null && end != null && start !== end;
  return {
    weeklyLoss: {
      enabled: input?.weeklyLoss?.enabled === true && weeklyAmount != null,
      amount: weeklyAmount,
    },
    dailyLossPercent: {
      enabled: input?.dailyLossPercent?.enabled === true && dailyPercent != null,
      percent: dailyPercent,
    },
    weeklyLossPercent: {
      enabled: input?.weeklyLossPercent?.enabled === true && weeklyPercent != null,
      percent: weeklyPercent,
    },
    maxTradesPerDay: {
      enabled: input?.maxTradesPerDay?.enabled === true && trades != null,
      count: trades,
    },
    tradingHours: {
      enabled: input?.tradingHours?.enabled === true && hoursOn,
      start,
      end,
    },
  };
}

function rulesEnabled(rules) {
  return rules.weeklyLoss.enabled
    || rules.dailyLossPercent.enabled
    || rules.weeklyLossPercent.enabled
    || rules.maxTradesPerDay.enabled
    || rules.tradingHours.enabled;
}

/** Form state for the journal settings. Missing rules are off and blank. */
export function journalRiskRulesInput(rules) {
  const number = (value) => {
    const n = positive(value);
    return n == null ? '' : String(n);
  };
  return {
    weeklyLoss: {
      enabled: rules?.weeklyLoss?.enabled === true,
      amount: number(rules?.weeklyLoss?.amount),
    },
    dailyLossPercent: {
      enabled: rules?.dailyLossPercent?.enabled === true,
      percent: number(rules?.dailyLossPercent?.percent),
    },
    weeklyLossPercent: {
      enabled: rules?.weeklyLossPercent?.enabled === true,
      percent: number(rules?.weeklyLossPercent?.percent),
    },
    maxTradesPerDay: {
      enabled: rules?.maxTradesPerDay?.enabled === true,
      count: number(rules?.maxTradesPerDay?.count),
    },
    tradingHours: {
      enabled: rules?.tradingHours?.enabled === true,
      start: clockOrNull(rules?.tradingHours?.start) || '',
      end: clockOrNull(rules?.tradingHours?.end) || '',
    },
  };
}

/**
 * What to merge onto the journal. Undefined means "do not write the field",
 * so a journal that never enabled a rule stays without it. Turning the last
 * rule off keeps the field. Demo never writes.
 */
export function journalRiskRulesPatch(existing, input, { demo = false } = {}) {
  if (demo) return undefined;
  const next = normalizeJournalRiskRules(input);
  if (existing == null && !rulesEnabled(next)) return undefined;
  return next;
}

/** True when the form still matches what is already stored. */
export function journalRiskRulesSame(existing, input) {
  const next = journalRiskRulesPatch(existing, input);
  const base = existing == null
    ? undefined
    : journalRiskRulesPatch(existing, journalRiskRulesInput(existing));
  return JSON.stringify(next ?? null) === JSON.stringify(base ?? null);
}

/** A switch is on, but the value is empty, not positive, or not a real window. */
export function journalRiskRulesInputRejected(input) {
  const next = normalizeJournalRiskRules(input);
  return (input?.weeklyLoss?.enabled === true && !next.weeklyLoss.enabled)
    || (input?.dailyLossPercent?.enabled === true && !next.dailyLossPercent.enabled)
    || (input?.weeklyLossPercent?.enabled === true && !next.weeklyLossPercent.enabled)
    || (input?.maxTradesPerDay?.enabled === true && !next.maxTradesPerDay.enabled)
    || (input?.tradingHours?.enabled === true && !next.tradingHours.enabled);
}
