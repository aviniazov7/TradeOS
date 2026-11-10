import { calculateFuturesNotional, computeTradeFields, initialRiskUsd, usesContractMath } from './calculations';
import { sanitizeCustomMap } from './customTradeFields';

/**
 * The document the journal writes for a new trade. Shared by the client
 * (useTrades) and the public API so both persist the same derived fields.
 *
 * Dates are plain Date objects. The client wraps createdAt in a Firestore
 * Timestamp and updatedAt in serverTimestamp(); the Worker encodes Dates as
 * Firestore timestamps. Callers must not change pnl / positionSize / margin
 * after this returns — those are the values the UI reads.
 *
 * `journalId` replaces whatever the payload carried, matching useTrades
 * (the hook's active journal wins; null when the hook has no journal).
 */
export function buildStoredTrade(tradeData, { journalId = null, now = new Date() } = {}) {
  const { pnl, pnlPercent, rrRatio, netPnl, result } = computeTradeFields(tradeData);
  const clock = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

  const rawDate = tradeData.entryDate instanceof Date
    ? tradeData.entryDate
    : tradeData.entryDate ? new Date(tradeData.entryDate) : new Date(clock);
  const safeEntryDate = Number.isNaN(rawDate.getTime()) ? new Date(clock) : rawDate;

  // Futures positionSize/margin are notional-based (price × pointValue ×
  // contracts); the crypto formula (price × quantity / leverage) is wrong
  // for contracts and leverage doesn't apply.
  const isFutures = usesContractMath(tradeData);
  const notional = isFutures
    ? calculateFuturesNotional(tradeData.entryPrice, tradeData.contract.pointValue, tradeData.contract.contracts)
    : tradeData.entryPrice * tradeData.quantity;

  const stored = {
    ...tradeData,
    // Asset class is persisted explicitly so Firestore rules and analytics
    // can branch on it. Missing/absent means crypto — every pre-existing
    // trade was written before this field existed and must keep behaving
    // exactly as before (see docs/specs/futures-contracts.md).
    assetClass: tradeData.assetClass || 'crypto',
    entryDate: safeEntryDate,
    journalId: journalId || null,
    pnl,
    pnlPercent,
    rrRatio,
    netPnl,
    result,
    positionSize: notional,
    margin: isFutures ? notional : notional / (tradeData.leverage || 1),
    createdAt: safeEntryDate,
    updatedAt: clock,
  };
  // `custom` is optional. A missing field, an empty map, or junk stays off
  // the document so older trades keep the shape they had.
  if (Object.prototype.hasOwnProperty.call(tradeData, 'custom')) {
    const custom = sanitizeCustomMap(tradeData.custom);
    if (custom) stored.custom = custom;
    else delete stored.custom;
  }
  return stored;
}

/**
 * API creates only. When the caller omits riskAmount (or sends 0) but the
 * entry, the stop and the size can price the risk, store that dollar amount.
 * The journal form already sends a declared risk; this must not run on the
 * client save path, or a blank risk field would start being overwritten.
 */
export function withDerivedRiskAmount(trade) {
  const declared = Number(trade?.riskAmount);
  if (Number.isFinite(declared) && declared > 0) return trade;
  const derived = initialRiskUsd(trade);
  if (!(derived > 0)) return trade;
  return { ...trade, riskAmount: Math.round(derived * 100) / 100 };
}
