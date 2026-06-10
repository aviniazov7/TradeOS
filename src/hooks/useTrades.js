import { useState, useEffect, useMemo } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  addToUserCollectionBulk,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
} from '../services/firestoreService';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import {
  calculatePnL,
  calculatePnLPercent,
  calculateRR,
  calculateNetPnL,
  getTradeResult,
  calculatePartialPnL,
  calculateWeightedExitPrice,
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
    let pnl, rrRatio;

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
    } else if (tradeData.exits?.length) {
      pnl = calculatePartialPnL(tradeData.direction, tradeData.entryPrice, tradeData.exits, tradeData.quantity);
      const weightedExit = calculateWeightedExitPrice(tradeData.exits);
      rrRatio = calculateRR(tradeData.entryPrice, weightedExit, tradeData.stopLoss);
    } else {
      pnl = calculatePnL(tradeData.direction, tradeData.entryPrice, tradeData.exitPrice, tradeData.quantity);
      rrRatio = calculateRR(tradeData.entryPrice, tradeData.exitPrice, tradeData.stopLoss);
    }

    const pnlPercent = calculatePnLPercent(pnl, tradeData.entryPrice, tradeData.quantity, tradeData.leverage);
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

    return {
      ...tradeData,
      entryDate: safeEntryDate,
      journalId: journalId || null,
      pnl,
      pnlPercent,
      rrRatio,
      netPnl,
      result,
      positionSize: tradeData.entryPrice * tradeData.quantity,
      margin: (tradeData.entryPrice * tradeData.quantity) / (tradeData.leverage || 1),
      createdAt: Timestamp.fromDate(safeEntryDate),
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

      await updateUserDocument(user.uid, 'trades', tradeId, {
        ...tradeData,
        pnl,
        pnlPercent,
        rrRatio,
        netPnl,
        result,
        positionSize: tradeData.entryPrice * tradeData.quantity,
        margin: (tradeData.entryPrice * tradeData.quantity) / (tradeData.leverage || 1),
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
