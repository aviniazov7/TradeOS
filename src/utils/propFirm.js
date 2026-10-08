import { isClosedTrade, localDayKey, partialRealizedPnl, safePnl } from './calculations';
import { PROP_FIRM_PRESETS } from './constants';

/**
 * Prop-firm challenge evaluator — pure, deterministic, no I/O.
 *
 * A journal can be marked as a prop-firm account (`journal.propFirm`). Given
 * the journal's trades it answers the questions a challenge trader checks
 * all day: how far to the target, how much can I still lose today, how close
 * is the drawdown floor, did I trade enough days, is one day carrying the
 * whole profit — and has any rule already been broken.
 *
 * Money basis: REALIZED P&L only (closed trades + the booked legs of manual
 * partial exits), bucketed by local (Israel) calendar day of the exit. Firms
 * measure equity including open positions and use their own day boundary
 * (FTMO: midnight CE(S)T; CME futures: 17:00 CT), so the numbers here are a
 * close, honest approximation — the caller may pass the live open P&L as
 * `unrealizedPnl` to include it in today's figures.
 */

export const WARN_AT_PCT = 70;
const EPS = 1e-9;

const num = (v, d = 0) => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : d;
};

export function getPropFirmPreset(id) {
  return PROP_FIRM_PRESETS.find((p) => p.id === id) || null;
}

// Object rules merge field-by-field; `null` removes the rule; scalars replace.
function mergeRules(base, over) {
  if (!over) return base;
  const out = { ...base };
  Object.entries(over).forEach(([k, v]) => {
    if (v === null) out[k] = null;
    else if (typeof v === 'object' && !Array.isArray(v)) out[k] = { ...(out[k] || {}), ...v };
    else out[k] = v;
  });
  return out;
}

/**
 * The editable rule set for a preset + phase + account size — what the
 * settings form starts from when the user picks a firm.
 */
export function buildPropFirmRules(presetId, phaseId, accountSize) {
  const preset = getPropFirmPreset(presetId) || getPropFirmPreset('custom');
  const phase = preset.phases.find((p) => p.id === phaseId) || preset.phases[0];
  const size = num(accountSize) > 0 ? num(accountSize) : preset.defaultSize;
  let rules = { ...preset.rules };
  rules = mergeRules(rules, preset.sizeRules?.[size]);
  rules = mergeRules(rules, phase.rules);
  return {
    presetId: preset.id,
    phase: phase.id,
    accountSize: size,
    profitTarget: rules.profitTarget ? { ...rules.profitTarget } : null,
    maxDailyLoss: rules.maxDailyLoss ? { ...rules.maxDailyLoss } : null,
    maxDrawdown: rules.maxDrawdown ? { ...rules.maxDrawdown } : null,
    minTradingDays: num(rules.minTradingDays),
    consistencyPct: rules.consistencyPct == null ? null : num(rules.consistencyPct),
  };
}

const UNITS = ['pct', 'usd'];
const BASES = ['initial', 'start_of_day'];
const DD_TYPES = ['static', 'trailing_eod', 'trailing_intraday'];

function cleanAmount(r) {
  if (!r || typeof r !== 'object') return null;
  const value = num(r.value);
  if (!(value > 0)) return null;
  return { value, unit: UNITS.includes(r.unit) ? r.unit : 'pct' };
}

/**
 * Sanitize a stored `propFirm` map (values may be strings from a form, or
 * missing on older docs). Returns null when the journal is not a prop account.
 */
export function normalizePropFirm(raw) {
  if (!raw || typeof raw !== 'object' || !raw.enabled) return null;
  const accountSize = num(raw.accountSize);
  if (!(accountSize > 0)) return null;
  const preset = getPropFirmPreset(raw.presetId) || getPropFirmPreset('custom');
  const phase = preset.phases.find((p) => p.id === raw.phase) || null;

  const target = cleanAmount(raw.profitTarget);
  const dailyBase = cleanAmount(raw.maxDailyLoss);
  const ddBase = cleanAmount(raw.maxDrawdown);
  const lockRaw = raw.maxDrawdown?.lockOffset;
  const consistency = num(raw.consistencyPct);

  return {
    presetId: preset.id,
    firmName: (typeof raw.firmName === 'string' && raw.firmName.trim()) || preset.name,
    phase: phase?.id || raw.phase || '',
    phaseLabel: phase?.label || '',
    verified: !!preset.verified,
    accountSize,
    startDate: typeof raw.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate) ? raw.startDate : '',
    profitTarget: target,
    maxDailyLoss: dailyBase && { ...dailyBase, basis: BASES.includes(raw.maxDailyLoss.basis) ? raw.maxDailyLoss.basis : 'initial' },
    maxDrawdown: ddBase && {
      ...ddBase,
      type: DD_TYPES.includes(raw.maxDrawdown.type) ? raw.maxDrawdown.type : 'static',
      lockOffset: lockRaw === null || lockRaw === undefined || lockRaw === '' || !Number.isFinite(Number(lockRaw)) ? null : Number(lockRaw),
    },
    minTradingDays: Math.max(0, Math.floor(num(raw.minTradingDays))),
    consistencyPct: consistency > 0 && consistency < 100 ? consistency : null,
  };
}

/** A {value, unit} rule in dollars. `base` is what a percentage is OF. */
export function ruleAmountUsd(rule, base) {
  if (!rule) return null;
  return rule.unit === 'usd' ? rule.value : (rule.value / 100) * base;
}

const toMs = (raw) => {
  if (!raw) return 0;
  const d = typeof raw?.toDate === 'function' ? raw.toDate() : raw instanceof Date ? raw : new Date(raw);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const meterState = (usedPct, breached) => {
  if (breached || usedPct >= 100 - EPS) return 'breached';
  if (usedPct >= WARN_AT_PCT) return 'warning';
  return 'ok';
};

// Realized P&L events (closed trades + booked partial legs) on/after startKey.
function collectEvents(trades, startKey) {
  const events = [];
  (trades || []).forEach((t, i) => {
    if (!t) return;
    let pnl;
    if (isClosedTrade(t)) pnl = safePnl(t);
    else {
      pnl = partialRealizedPnl(t);
      if (pnl === 0) return;
    }
    const when = t.exitDate || t.entryDate;
    const day = localDayKey(when);
    if (!day || (startKey && day < startKey)) return;
    events.push({ day, ms: toMs(when), pnl, i });
  });
  events.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.ms - b.ms || a.i - b.i));
  return events;
}

// Days with trading activity: any day a (non-pending) trade was opened, plus
// any day a realized result was booked.
function collectTradingDays(trades, events, startKey, todayKey) {
  const days = new Set(events.map((e) => e.day));
  (trades || []).forEach((t) => {
    if (!t) return;
    if (t.orderType === 'limit' && !t.limitTriggered && !isClosedTrade(t)) return; // never filled
    const d = localDayKey(t.entryDate);
    if (d && (!startKey || d >= startKey) && d <= todayKey) days.add(d);
  });
  return days;
}

/**
 * Evaluate a prop-firm journal.
 *
 * @param {Array}  trades   the journal's trades (any status)
 * @param {Object} rawConfig journal.propFirm (raw, as stored)
 * @param {Object} opts.now            injected clock (day boundary)
 * @param {number} opts.unrealizedPnl  live P&L of open positions (optional)
 * @returns {Object|null} null when the journal is not a prop account
 */
export function evaluatePropFirm(trades, rawConfig, { now = new Date(), unrealizedPnl = 0 } = {}) {
  const cfg = normalizePropFirm(rawConfig);
  if (!cfg) return null;

  const { accountSize } = cfg;
  const todayKey = localDayKey(now);
  const startKey = cfg.startDate;
  const events = collectEvents(trades, startKey).filter((e) => e.day <= todayKey);
  const open = num(unrealizedPnl);

  // Group events by day (already sorted).
  const days = [];
  events.forEach((e) => {
    const last = days[days.length - 1];
    if (last && last.day === e.day) last.events.push(e);
    else days.push({ day: e.day, events: [e] });
  });

  const dd = cfg.maxDrawdown;
  const ddLimit = dd ? ruleAmountUsd(dd, accountSize) : null;
  const lockLevel = dd && dd.type !== 'static' && dd.lockOffset != null ? accountSize + dd.lockOffset : Infinity;
  const floorFor = (hwm) => {
    if (!dd) return -Infinity;
    if (dd.type === 'static') return accountSize - ddLimit;
    return Math.min(hwm - ddLimit, lockLevel);
  };
  const dailyLimitFor = (dayStart) => (cfg.maxDailyLoss
    ? ruleAmountUsd(cfg.maxDailyLoss, cfg.maxDailyLoss.basis === 'start_of_day' ? dayStart : accountSize)
    : null);

  let balance = accountSize;
  let hwm = accountSize;
  let lowestBalance = accountSize;
  const breaches = [];
  const dailyPnl = {};
  let worstDayLoss = 0; // largest intraday realized loss vs a day's open

  days.forEach(({ day, events: evs }) => {
    const dayStart = balance;
    const dailyLimit = dailyLimitFor(dayStart);
    let running = 0;
    let dailyHit = false;
    evs.forEach((e) => {
      running += e.pnl;
      balance += e.pnl;
      lowestBalance = Math.min(lowestBalance, balance);
      worstDayLoss = Math.max(worstDayLoss, -running);
      if (dailyLimit != null && !dailyHit && -running >= dailyLimit - EPS) {
        dailyHit = true;
        breaches.push({ rule: 'daily', day, amount: -running, limit: dailyLimit });
      }
      if (dd && balance <= floorFor(hwm) + EPS && !breaches.some((b) => b.rule === 'drawdown')) {
        breaches.push({ rule: 'drawdown', day, balance, floor: floorFor(hwm) });
      }
      if (dd?.type === 'trailing_intraday') hwm = Math.max(hwm, balance);
    });
    dailyPnl[day] = running;
    // End-of-day high-water mark — today hasn't closed yet, so it doesn't move the floor.
    if (dd?.type === 'trailing_eod' && day < todayKey) hwm = Math.max(hwm, balance);
  });

  const totalPnl = balance - accountSize;
  const equity = balance + open;

  // ── Daily loss (today) ──
  const todayRealized = dailyPnl[todayKey] || 0;
  const todayStart = balance - todayRealized;
  let daily = null;
  if (cfg.maxDailyLoss) {
    const limitUsd = dailyLimitFor(todayStart);
    const todayPnl = todayRealized + open;
    const usedUsd = Math.max(0, -todayPnl);
    if (open && usedUsd >= limitUsd - EPS && !breaches.some((b) => b.rule === 'daily' && b.day === todayKey)) {
      breaches.push({ rule: 'daily', day: todayKey, amount: usedUsd, limit: limitUsd, live: true });
    }
    const pastBreach = breaches.find((b) => b.rule === 'daily');
    const usedPct = limitUsd > 0 ? (usedUsd / limitUsd) * 100 : 0;
    daily = {
      limitUsd,
      todayPnl,
      usedUsd,
      remainingUsd: Math.max(0, limitUsd - usedUsd),
      usedPct,
      floor: todayStart - limitUsd,
      breached: !!pastBreach,
      breachDay: pastBreach?.day || null,
      breachAmount: pastBreach?.amount ?? null,
      worstDayLoss,
      state: meterState(usedPct, !!pastBreach),
    };
  }

  // ── Max drawdown ──
  let drawdown = null;
  if (dd) {
    const floor = floorFor(hwm);
    if (open && equity <= floor + EPS && !breaches.some((b) => b.rule === 'drawdown')) {
      breaches.push({ rule: 'drawdown', day: todayKey, balance: equity, floor, live: true });
    }
    const pastBreach = breaches.find((b) => b.rule === 'drawdown');
    const remainingUsd = Math.max(0, equity - floor);
    const usedUsd = Math.max(0, ddLimit - remainingUsd);
    const usedPct = ddLimit > 0 ? (usedUsd / ddLimit) * 100 : 0;
    drawdown = {
      type: dd.type,
      limitUsd: ddLimit,
      floor,
      highWaterMark: dd.type === 'static' ? accountSize : hwm,
      locked: dd.type !== 'static' && Number.isFinite(lockLevel) && hwm - ddLimit >= lockLevel - EPS,
      remainingUsd,
      usedUsd,
      usedPct,
      lowestBalance,
      breached: !!pastBreach,
      breachDay: pastBreach?.day || null,
      state: meterState(usedPct, !!pastBreach),
    };
  }

  // ── Trading days ──
  const tradingDaySet = collectTradingDays(trades, events, startKey, todayKey);
  const required = cfg.minTradingDays;
  const dayCount = tradingDaySet.size;
  const daysInfo = {
    required,
    count: dayCount,
    remaining: Math.max(0, required - dayCount),
    met: dayCount >= required,
    pct: required > 0 ? Math.min(100, (dayCount / required) * 100) : 100,
  };

  // ── Profit target ──
  let target = null;
  if (cfg.profitTarget) {
    const amountUsd = ruleAmountUsd(cfg.profitTarget, accountSize);
    target = {
      amountUsd,
      profitUsd: totalPnl,
      remainingUsd: Math.max(0, amountUsd - totalPnl),
      progressPct: amountUsd > 0 ? Math.max(0, Math.min(100, (totalPnl / amountUsd) * 100)) : 0,
      reached: totalPnl >= amountUsd - EPS,
    };
  }

  // ── Consistency ──
  let consistency = null;
  if (cfg.consistencyPct) {
    let bestDayPnl = 0;
    let bestDayKey = null;
    Object.entries(dailyPnl).forEach(([day, pnl]) => {
      if (pnl > bestDayPnl) { bestDayPnl = pnl; bestDayKey = day; }
    });
    const applicable = totalPnl > 0 && bestDayPnl > 0;
    const sharePct = applicable ? (bestDayPnl / totalPnl) * 100 : null;
    consistency = {
      limitPct: cfg.consistencyPct,
      bestDayPnl,
      bestDayKey,
      sharePct,
      ok: applicable ? sharePct <= cfg.consistencyPct + EPS : null,
      // Total profit needed for the best day to fall within the limit.
      requiredTotalUsd: bestDayPnl > 0 ? bestDayPnl / (cfg.consistencyPct / 100) : 0,
    };
  }

  // ── Status ──
  const breached = breaches.length > 0;
  const pending = [];
  if (target?.reached) {
    if (!daysInfo.met) pending.push('days');
    if (consistency && consistency.ok === false) pending.push('consistency');
  }
  let status;
  if (breached) status = 'breached';
  else if (target?.reached && pending.length === 0) status = 'passed';
  else if (daily?.state === 'warning' || drawdown?.state === 'warning' || consistency?.ok === false) status = 'warning';
  else status = 'on_track';

  return {
    firmName: cfg.firmName,
    phase: cfg.phase,
    phaseLabel: cfg.phaseLabel,
    verified: cfg.verified,
    accountSize,
    startDate: startKey,
    balance,
    equity,
    totalPnl,
    tradeCount: events.length,
    target,
    daily,
    drawdown,
    days: daysInfo,
    consistency,
    breaches,
    pending,
    status,
  };
}
