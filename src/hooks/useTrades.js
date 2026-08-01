import { useState, useEffect, useMemo } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  addToUserCollectionBulk,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
  dateToTimestamp,
} from '../services/dataProvider';
import { useAuth } from '../contexts/AuthContext';
import {
  calculatePnL,
  calculatePnLPercent,
  calculateRR,
  calculateNetPnL,
  getTradeResult,
  calculatePartialPnL,
  calculateWeightedExitPrice,
  calculateFuturesPnL,
  calculateFuturesPartialPnL,
  calculateFuturesContractsPnL,
  calculateFuturesNotional,
} from '../utils/calculations';

export function useTrades(journalId = null) {
  const { user } = useAuth();
  const [allTrades, setAllTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to ALL trades once, filter client-side by journalId
  useEffect(() => {
    if (!user) {
      setAllTrades([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    return subscribeToUserCollection(
      user.uid,
      'trades',
      {},
      (data) => {
        setAllTrades(data);
        setLoading(false);
      },
      (error) => {
        console.error('Firestore trades listener error:', error);
        setLoading(false);
      }
    );
  }, [user]);

  // Client-side filter by journalId — instant switching, no re-subscription
  const trades = useMemo(() => {
    if (!journalId) return allTrades;
    return allTrades.filter((t) => t.journalId === journalId);
  }, [allTrades, journalId]);

  const computeTradeFields = (tradeData) => {
    let pnl, rrRatio, pnlPercent;

    // CME futures: dollar P&L is points × pointValue × contracts, never
    // price × quantity (see docs/specs/futures-contracts.md). Crypto trades
    // (assetClass missing or 'crypto') keep the original path untouched.
    const isFutures = tradeData.assetClass === 'futures_cme' && tradeData.contract;

    // Exchange-imported closed trades: use pnlFromExchange to preserve the exact
    // settlement value from the exchange (avoids recalculation drift from qty rounding).
    // NOTE: pnlFromExchange === 0 is valid (breakeven) — do NOT exclude it with !== 0
    const hasExchangePnl = typeof tradeData.pnlFromExchange === 'number';
    const isClosed = (tradeData.exitPrice > 0) || tradeData.status === 'closed';

    if (hasExchangePnl && isClosed) {
      pnl = tradeData.pnlFromExchange;
      const exitForRR = tradeData.exits?.length
        ? calculateWeightedExitPrice(tradeData.exits)
        : (tradeData.exitPrice || 0);
      rrRatio = calculateRR(tradeData.entryPrice, exitForRR, tradeData.stopLoss);
    } else if (isFutures) {
      const { pointValue, contracts } = tradeData.contract;
      if (tradeData.exits?.length) {
        // Prefer exact per-exit contract counts; fall back to percent exits.
        pnl = tradeData.exits.some((e) => e.contracts != null)
          ? calculateFuturesContractsPnL(tradeData.direction, tradeData.entryPrice, tradeData.exits, pointValue)
          : calculateFuturesPartialPnL(tradeData.direction, tradeData.entryPrice, tradeData.exits, pointValue, contracts);
        rrRatio = calculateRR(tradeData.entryPrice, calculateWeightedExitPrice(tradeData.exits), tradeData.stopLoss);
      } else {
        pnl = calculateFuturesPnL(tradeData.direction, tradeData.entryPrice, tradeData.exitPrice, pointValue, contracts);
        rrRatio = calculateRR(tradeData.entryPrice, tradeData.exitPrice, tradeData.stopLoss);
      }
    } else if (tradeData.exits?.length) {
      pnl = calculatePartialPnL(tradeData.direction, tradeData.entryPrice, tradeData.exits, tradeData.quantity);
      const weightedExit = calculateWeightedExitPrice(tradeData.exits);
      rrRatio = calculateRR(tradeData.entryPrice, weightedExit, tradeData.stopLoss);
    } else {
      pnl = calculatePnL(tradeData.direction, tradeData.entryPrice, tradeData.exitPrice, tradeData.quantity);
      rrRatio = calculateRR(tradeData.entryPrice, tradeData.exitPrice, tradeData.stopLoss);
    }

    if (isFutures) {
      // Percent return on notional — honest (no leverage multiplier); real
      // futures margin is exchange-set and unknown in v1, so ROE would lie.
      const notional = calculateFuturesNotional(tradeData.entryPrice, tradeData.contract.pointValue, tradeData.contract.contracts);
      pnlPercent = notional ? (pnl / notional) * 100 : 0;
    } else {
      pnlPercent = calculatePnLPercent(pnl, tradeData.entryPrice, tradeData.quantity, tradeData.leverage);
    }
    const netPnl = calculateNetPnL(pnl, tradeData.fees);
    // Use netPnl for result classification — a trade with small gross profit
    // but large fees should be a 'loss', not a 'win'
    const result = getTradeResult(netPnl);
    return { pnl, pnlPercent, rrRatio, netPnl, result };
  };

  // Full document for a new trade: computed P&L fields + safe dates + journal
  // binding. Shared by the single-add and bulk-import paths so both write
  // identical documents.
  const buildTradeDoc = (tradeData) => {
    const { pnl, pnlPercent, rrRatio, netPnl, result } = computeTradeFields(tradeData);

    const rawDate = tradeData.entryDate instanceof Date
      ? tradeData.entryDate
      : tradeData.entryDate ? new Date(tradeData.entryDate) : new Date();
    const safeEntryDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

    // Futures positionSize/margin are notional-based (price × pointValue ×
    // contracts); the crypto formula (price × quantity / leverage) is wrong
    // for contracts and leverage doesn't apply.
    const isFutures = tradeData.assetClass === 'futures_cme' && tradeData.contract;
    const notional = isFutures
      ? calculateFuturesNotional(tradeData.entryPrice, tradeData.contract.pointValue, tradeData.contract.contracts)
      : tradeData.entryPrice * tradeData.quantity;

    return {
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
      createdAt: dateToTimestamp(safeEntryDate),
      updatedAt: timestamp(),
    };
  };

  const addTrade = async (tradeData) => {
    if (!user) throw new Error('No user');
    try {
      await addToUserCollection(user.uid, 'trades', buildTradeDoc(tradeData));
    } catch (error) {
      console.error('Failed to add trade:', error);
      throw error;
    }
  };

  // Bulk insert for CSV import — batched Firestore writes (one round-trip per
  // 499 trades) instead of an awaited write per row, which made large imports
  // slow and failure-prone. onProgress(committedCount) fires per chunk.
  const addTradesBulk = async (tradesData, onProgress) => {
    if (!user) throw new Error('No user');
    try {
      return await addToUserCollectionBulk(
        user.uid,
        'trades',
        tradesData.map(buildTradeDoc),
        onProgress
      );
    } catch (error) {
      console.error('Failed to bulk add trades:', error);
      throw error;
    }
  };

  const updateTrade = async (tradeId, tradeData) => {
    if (!user) throw new Error('No user');
    try {
      const { pnl, pnlPercent, rrRatio, netPnl, result } = computeTradeFields(tradeData);

      const isFutures = tradeData.assetClass === 'futures_cme' && tradeData.contract;
      const notional = isFutures
        ? calculateFuturesNotional(tradeData.entryPrice, tradeData.contract.pointValue, tradeData.contract.contracts)
        : tradeData.entryPrice * tradeData.quantity;

      await updateUserDocument(user.uid, 'trades', tradeId, {
        ...tradeData,
        pnl,
        pnlPercent,
        rrRatio,
        netPnl,
        result,
        positionSize: notional,
        margin: isFutures ? notional : notional / (tradeData.leverage || 1),
        updatedAt: timestamp(),
      });
    } catch (error) {
      console.error('Failed to update trade:', error);
      throw error;
    }
  };

  const deleteTrade = async (tradeId) => {
    if (!user) throw new Error('No user');
    try {
      await deleteUserDocument(user.uid, 'trades', tradeId);
    } catch (error) {
      console.error('Failed to delete trade:', error);
      throw error;
    }
  };

  return { trades, loading, addTrade, addTradesBulk, updateTrade, deleteTrade };
}
