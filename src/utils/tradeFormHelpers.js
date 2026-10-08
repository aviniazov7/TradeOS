/**
 * Pure helpers behind the trade form's "pro" features: scale-in fills,
 * per-journal commission presets, the plan checklist, the remembered
 * strategy/timeframe/trigger, and the SL→BE shortcut. The trade P&L/R math
 * itself stays in calculations.js — these only shape the INPUTS fed to it.
 */
import { initialStopLoss } from './calculations';

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
  return num(t?.stopLoss) !== entry;
}
