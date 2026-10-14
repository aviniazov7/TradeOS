/**
 * Pure helpers behind the trade form's "pro" features: scale-in fills,
 * per-journal commission presets, the plan checklist, the remembered
 * strategy/timeframe/trigger, and the SL→BE shortcut. The trade P&L/R math
 * itself stays in calculations.js — these only shape the INPUTS fed to it.
 */
import { initialStopLoss, isStopOnRiskSide } from './calculations';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Size-weighted aggregate of entry fills (scale-in / add to position).
 * fills: [{ price, quantity }] — strings are fine, invalid rows are ignored.
 * price is the volume-weighted average entry, quantity the total size and
 * notional Σ price × quantity. All zero when no fill is valid.
 */
export function aggregateFills(fills) {
  let quantity = 0;
  let notional = 0;
  for (const f of fills || []) {
    const p = num(f?.price);
    const q = num(f?.quantity);
    if (p > 0 && q > 0) {
      quantity += q;
      notional += p * q;
    }
  }
  return { price: quantity > 0 ? notional / quantity : 0, quantity, notional };
}

/**
 * Percent of the position already closed by the recorded exits. Futures exits
 * carry a contract count (exact, against the total contracts); crypto/stocks
 * exits carry a percent.
 */
export function exitsClosedPercent(exits, { isFutures = false, totalContracts = 0 } = {}) {
  const list = exits || [];
  if (isFutures) {
    if (!(totalContracts > 0)) return 0;
    const sum = list.reduce((s, e) => s + num(e?.contracts), 0);
    return (sum / totalContracts) * 100;
  }
  return list.reduce((s, e) => s + num(e?.percent), 0);
}

// ── Commission presets ──────────────────────────────────────────────────────
// Stored on the journal document as ONE map field (`commissions`) so it adds
// a single key to the field-count-bounded journal doc:
//   cryptoMakerPct / cryptoTakerPct — % of notional per side
//   stockPerShare / stockMinPerOrder — $ per share, minimum $ per order
//   futuresPerContractSide — $ per contract per side
export const COMMISSION_KEYS = ['cryptoMakerPct', 'cryptoTakerPct', 'stockPerShare', 'stockMinPerOrder', 'futuresPerContractSide'];

/** Sanitise a commissions map for storage: finite, non-negative numbers only. */
export function normalizeCommissions(raw) {
  const out = {};
  for (const k of COMMISSION_KEYS) {
    const v = num(raw?.[k]);
    out[k] = v > 0 ? v : 0;
  }
  return out;
}

/** True when the preset defines a fee for this asset class. */
export function hasCommissionPreset(assetClass, preset) {
  if (!preset) return false;
  if (assetClass === 'futures_cme') return num(preset.futuresPerContractSide) > 0;
  if (assetClass === 'stocks') return num(preset.stockPerShare) > 0 || num(preset.stockMinPerOrder) > 0;
  return num(preset.cryptoMakerPct) > 0 || num(preset.cryptoTakerPct) > 0;
}

/**
 * Round-trip commission estimate from a journal preset.
 *   fills — entry fills [{ price, quantity }] (units / shares / contracts)
 *   exits — recorded exits [{ price, quantity }] in the same unit; whatever
 *           size is not exited yet is assumed to leave in ONE order at the
 *           average entry price (so an open trade still gets a round trip).
 * Crypto: entry notional × (maker for a limit order, taker for market) +
 *         exit notional × taker (exits are treated as taker — conservative).
 * Stocks: every fill and every exit is an order: max(min, perShare × shares).
 * Futures: $ per contract per side × total contracts × 2.
 * Returns null when no preset applies or there is no size yet.
 */
export function estimateCommission({ assetClass = 'crypto', preset, orderType = 'market', fills = [], exits = [] } = {}) {
  if (!hasCommissionPreset(assetClass, preset)) return null;
  const entry = aggregateFills(fills);
  if (!(entry.quantity > 0)) return null;

  const validExits = (exits || [])
    .map((e) => ({ price: num(e?.price), quantity: num(e?.quantity) }))
    .filter((e) => e.price > 0 && e.quantity > 0);
  const exitedQty = validExits.reduce((s, e) => s + e.quantity, 0);
  const remainder = Math.max(0, entry.quantity - exitedQty);
  const hasRemainder = remainder > entry.quantity * 1e-9;

  if (assetClass === 'futures_cme') {
    return round2(num(preset.futuresPerContractSide) * entry.quantity * 2);
  }

  if (assetClass === 'stocks') {
    const perShare = num(preset.stockPerShare);
    const minOrder = num(preset.stockMinPerOrder);
    const orderFee = (q) => Math.max(minOrder, perShare * q);
    let total = (fills || [])
      .filter((f) => num(f?.price) > 0 && num(f?.quantity) > 0)
      .reduce((s, f) => s + orderFee(num(f.quantity)), 0);
    total += validExits.reduce((s, e) => s + orderFee(e.quantity), 0);
    if (hasRemainder) total += orderFee(remainder);
    return round2(total);
  }

  const maker = num(preset.cryptoMakerPct) / 100;
  const taker = num(preset.cryptoTakerPct) / 100;
  const entryRate = orderType === 'limit' ? maker : taker;
  const exitNotional = validExits.reduce((s, e) => s + e.price * e.quantity, 0)
    + (hasRemainder ? remainder * entry.price : 0);
  return round2(entry.notional * entryRate + exitNotional * taker);
}

// ── Trading-plan checklist ──────────────────────────────────────────────────

/**
 * Rows for the pre-entry checklist: the plan's current items (in plan order)
 * with their ticked state from the trade's stored snapshot, followed by any
 * stored item the plan no longer has — so editing a plan never erases what
 * the trade recorded. stored: [{ item, done }] (the persisted shape).
 */
export function buildChecklistRows(planItems, stored) {
  const items = (Array.isArray(planItems) ? planItems : [])
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
  const storedList = Array.isArray(stored) ? stored.filter((r) => r && typeof r.item === 'string' && r.item.trim()) : [];
  const doneByItem = new Map(storedList.map((r) => [r.item, !!r.done]));
  const rows = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    rows.push({ item, done: doneByItem.get(item) || false });
  }
  for (const r of storedList) {
    if (seen.has(r.item)) continue;
    seen.add(r.item);
    rows.push({ item: r.item, done: !!r.done });
  }
  return rows;
}

/** Checklist adherence: % of items ticked (rounded), null when there are none. */
export function checklistAdherence(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  return Math.round((list.filter((r) => r?.done).length / list.length) * 100);
}

// ── Remembered choices (per journal) ────────────────────────────────────────

const lastChoicesKey = (journalId) => `tradeos_tradeForm_last_${journalId || 'default'}`;

/** Last strategy / timeframe / trigger used in this journal, or null. */
export function loadLastTradeChoices(journalId, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(lastChoicesKey(journalId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const pick = (k) => (typeof v[k] === 'string' ? v[k] : '');
    return { strategy: pick('strategy'), timeframe: pick('timeframe'), trigger: pick('trigger') };
  } catch {
    return null;
  }
}

export function saveLastTradeChoices(journalId, { strategy = '', timeframe = '', trigger = '' } = {}, storage = globalThis.localStorage) {
  try {
    storage?.setItem(lastChoicesKey(journalId), JSON.stringify({ strategy, timeframe, trigger }));
  } catch { /* storage unavailable — remembering is a convenience only */ }
}

// ── Stop to breakeven ───────────────────────────────────────────────────────

/**
 * Whether the SL→BE shortcut applies: the trade has a real initial stop on
 * the risk side (so the form keeps accepting a stop AT entry as a trail, and
 * originalStopLoss keeps the R) and the current stop is not already at entry.
 */
export function canMoveStopToBreakeven(t) {
  const entry = num(t?.entryPrice);
  if (!(entry > 0)) return false;
  if (!(initialStopLoss(t) > 0)) return false;
  // Tolerance: a scale-in average is written back rounded (toPrecision), so
  // "already at entry" must not hinge on the 12th significant digit.
  return Math.abs(num(t?.stopLoss) - entry) > entry * 1e-9;
}

/** The breakeven stop as a clean input string (no float noise). */
export function breakevenStopValue(entryPrice) {
  const e = num(entryPrice);
  return e > 0 ? String(+e.toPrecision(12)) : '';
}

// ── Ticket summary (display only) ───────────────────────────────────────────
// The numbers in the trade ticket's summary rail. None of these feed the
// saved trade — handleSubmit computes what is stored on its own.

/**
 * The trade's risk against the account. With a balance: % of it, flagged
 * when it breaks a percent limit (critical past twice the limit). Without a
 * balance: only a fixed-$ limit can be checked. null when there is nothing
 * to report. limitLabel is the journal limit for display ("1%" / "$100").
 */
export function riskBudgetCheck(risk, { riskType, riskValue, currentBalance, balanceKnown = null } = {}) {
  const r = num(risk);
  if (!(r > 0)) return null;
  const limit = num(riskValue);
  const limitLabel = limit > 0
    ? (riskType === 'percent' ? `${riskValue}%` : riskType === 'fixed' ? `$${riskValue}` : null)
    : null;
  // A blank journal opening balance used to fall through to "current P&L" as
  // the denominator, so "% of portfolio" was just this trade against itself.
  // Callers pass balanceKnown:false in that case; we ask for a real balance
  // instead of inventing a percent. A fixed-$ limit can still be checked.
  if (balanceKnown === false && !(num(currentBalance) > 0)) {
    if (riskType === 'fixed' && limit > 0 && r > limit) {
      return {
        percent: null,
        exceeds: true,
        missingBalance: true,
        limitLabel,
        severity: r > limit * 2 ? 'critical' : 'warning',
        message: `סיכון $${r.toFixed(2)} — חורג מהמגבלה ($${riskValue})`,
      };
    }
    return {
      percent: null,
      exceeds: false,
      missingBalance: true,
      limitLabel,
      severity: 'info',
      message: 'הגדר יתרה התחלתית בהגדרות היומן כדי לראות אחוז מהתיק',
    };
  }
  if (num(currentBalance) > 0) {
    const percent = (r / num(currentBalance)) * 100;
    const exceeds = riskType === 'percent' && limit > 0 && percent > limit;
    const critical = exceeds && percent > limit * 2;
    return {
      percent,
      exceeds,
      limitLabel,
      severity: critical ? 'critical' : exceeds ? 'warning' : 'info',
      message: exceeds
        ? `סיכון ${percent.toFixed(1)}% מהתיק — חורג מהמגבלה (${riskValue}%)`
        : `סיכון ${percent.toFixed(1)}% מהתיק`,
    };
  }
  if (riskType === 'fixed' && limit > 0 && r > limit) {
    return {
      percent: null,
      exceeds: true,
      limitLabel,
      severity: r > limit * 2 ? 'critical' : 'warning',
      message: `סיכון $${r.toFixed(2)} — חורג מהמגבלה ($${riskValue})`,
    };
  }
  return null;
}

/**
 * Notional sized from a dollar risk and a stop. null when the stop is missing
 * or sits on the wrong side of the entry (long stop must be below, short
 * above) — abs(entry − stop) would otherwise invent a position and a
 * positive R from a stop that doesn't define risk.
 */
export function riskSizedNotional(direction, entry, stop, risk) {
  const e = num(entry);
  const s = num(stop);
  const r = num(risk);
  if (!(e > 0) || !(s > 0) || !(r > 0) || e === s) return null;
  if (!isStopOnRiskSide(direction, e, s)) return null;
  return (r * e) / Math.abs(e - s);
}

/** Dollar risk to the stop: size × |entry − stop| × point value (1 outside futures). */
export function riskToStop({ entry, stop, units, pointValue = 1 } = {}) {
  const e = num(entry);
  const s = num(stop);
  const u = num(units);
  if (!(e > 0) || !(s > 0) || !(u > 0)) return 0;
  return u * Math.abs(e - s) * num(pointValue);
}

/** Stop distance as % of the entry price, or null when either is missing. */
export function stopDistancePct(entry, stop) {
  const e = num(entry);
  const s = num(stop);
  if (!(e > 0) || !(s > 0)) return null;
  return (Math.abs(e - s) / e) * 100;
}

/**
 * Signed R multiple of a price: the move from entry in the trade's favour,
 * in units of the stop distance (long 100 / stop 95 → 110 = +2R, 95 = −1R).
 * null when entry, stop or price is missing.
 */
export function rMultiple(direction, entry, stop, price) {
  const e = num(entry);
  const s = num(stop);
  const p = num(price);
  if (!(e > 0) || !(s > 0) || !(p > 0) || e === s) return null;
  const move = direction === 'short' ? e - p : p - e;
  return move / Math.abs(e - s);
}

/**
 * Planned reward:risk of the targets — to TP1 and to the blended target.
 * targets: [{ price, weight }] where weight is the % of the position the
 * target closes (0 / empty = not set). Targets with a weight keep it; the
 * rest of the position is split evenly over the targets without one, so a
 * plain list of TPs blends equally. Fields are null when there is no stop or
 * no target.
 */
export function plannedRewardRisk({ direction, entry, stop, targets } = {}) {
  const list = (targets || [])
    .map((t) => ({ price: num(t?.price), weight: Math.max(0, num(t?.weight)) }))
    .filter((t) => t.price > 0);
  const tp1 = list.length ? rMultiple(direction, entry, stop, list[0].price) : null;
  if (tp1 == null) return { tp1: null, blended: null };
  const used = list.reduce((s, t) => s + t.weight, 0);
  const open = list.filter((t) => !(t.weight > 0)).length;
  const rest = Math.max(0, 100 - used);
  const weights = list.map((t) => (t.weight > 0 ? t.weight : open ? rest / open : 0));
  const total = weights.reduce((s, w) => s + w, 0);
  const price = total > 0 ? list.reduce((s, t, i) => s + t.price * weights[i], 0) / total : list[0].price;
  return { tp1, blended: rMultiple(direction, entry, stop, price) };
}

function minuteMs(d) {
  return Math.floor(d.getTime() / 60000);
}

function asDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

/** Local midnight of `value`, for a date-only minDate (the time stays in filterTime). */
export function startOfLocalDay(value) {
  const d = asDate(value);
  if (!d) return null;
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** True when `value`'s minute is strictly after `min`'s minute. */
export function isAfterMinute(value, min) {
  const a = asDate(value);
  const b = asDate(min);
  if (!a || !b) return false;
  return minuteMs(a) > minuteMs(b);
}

/**
 * True when `value` is missing or its clock minute is >= `min`'s minute.
 * Same displayed minute counts as equal — an exit stamped a few seconds
 * before the entry used to fail the save even though both read as 14:32.
 */
export function isOnOrAfterMinute(min, value) {
  const a = asDate(min);
  const b = asDate(value);
  if (!a || !b) return true;
  return minuteMs(b) >= minuteMs(a);
}

/**
 * Entry-price message for the ticket. Empty, negative and zero each say
 * what is actually wrong (they used to share "please enter an entry price").
 */
export function entryPriceProblem(raw) {
  if (raw === '' || raw == null) return 'נא להזין מחיר כניסה';
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!Number.isFinite(n)) return 'נא להזין מחיר כניסה';
  if (n < 0) return 'מחיר הכניסה לא יכול להיות שלילי';
  if (n === 0) return 'מחיר הכניסה חייב להיות גדול מ-0';
  return null;
}

/**
 * Time-slot filter for the entry/exit date pickers.
 *
 * Slots are compared by minute, and the minimum is applied per calendar day:
 * on the entry's day a slot must be that minute or later; on a later day any
 * non-future time is allowed. Comparing full timestamps (and passing the
 * entry datetime as minDate) collapsed the list to the current minute,
 * because the entry and "now" were the same minute and every 15-minute slot
 * fell just before the entry or just after now.
 *
 * @param {Date} time  the candidate slot (date + time)
 * @param {{ now?: Date, min?: Date|null }} [opts]
 */
export function isSelectableTradeTime(time, { now = new Date(), min = null } = {}) {
  const slot = asDate(time);
  const clock = asDate(now);
  if (!slot || !clock) return false;
  if (minuteMs(slot) > minuteMs(clock)) return false;
  const earliest = asDate(min);
  if (!earliest) return true;
  const slotDay = startOfLocalDay(slot).getTime();
  const minDay = startOfLocalDay(earliest).getTime();
  if (slotDay < minDay) return false;
  if (slotDay === minDay && minuteMs(slot) < minuteMs(earliest)) return false;
  return true;
}

/**
 * Extra clock times for the exit picker. 15-minute slots skip the current
 * minute when it isn't on a quarter hour, so an exit opened in the same
 * minute as the entry had no selectable time at all. Inject that minute
 * (and the entry minute) — but only when they fall on `selected`'s day.
 * react-datepicker keeps the injected Date's own calendar day on click, so
 * a time from another day would jump the calendar.
 */
export function exitPickerInjectTimes(selected, entry, now = new Date()) {
  const day = startOfLocalDay(selected || now);
  if (!day) return [];
  const dayMs = day.getTime();
  const out = [];
  const seen = new Set();
  for (const candidate of [entry, now]) {
    const d = asDate(candidate);
    if (!d || startOfLocalDay(d).getTime() !== dayMs) continue;
    const t = new Date(day);
    t.setHours(d.getHours(), d.getMinutes(), 0, 0);
    if (seen.has(t.getTime())) continue;
    seen.add(t.getTime());
    out.push(t);
  }
  return out;
}
