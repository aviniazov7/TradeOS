import { useState, useEffect, useMemo } from 'react';
import {
  subscribeToUserCollection,
  addToUserCollection,
  addToUserCollectionBulk,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
  dateToTimestamp,
} from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import { computeTradeFields, calculateFuturesNotional } from '../utils/calculations';

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
