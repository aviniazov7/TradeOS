import { useState, useEffect, useMemo } from 'react';
import {
  subscribeToUserCollection,
  seedUserCollection,
  addToUserCollection,
  addToUserCollectionBulk,
  updateUserDocument,
  deleteUserDocument,
  timestamp,
  dateToTimestamp,
} from '../services/firestoreService';
import { deleteTradeImages } from '../services/tradeImageService';
import { useAuth } from '../contexts/AuthContext';
import { computeTradeFields, calculateFuturesNotional, usesContractMath } from '../utils/calculations';
import { buildStoredTrade } from '../utils/tradeDoc';

export function useTrades(journalId = null) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [allTrades, setAllTrades] = useState(() => seedUserCollection(uid, 'trades').data);
  const [loading, setLoading] = useState(() => seedUserCollection(uid, 'trades').loading);

  // Subscribe to ALL trades once, filter client-side by journalId
  useEffect(() => {
    if (!uid) {
      setAllTrades([]);
      setLoading(false);
      return undefined;
    }

    const cached = seedUserCollection(uid, 'trades');
    if (!cached.loading) {
      setAllTrades(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    return subscribeToUserCollection(
      uid,
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
  }, [uid]);

  // Client-side filter by journalId — instant switching, no re-subscription
  const trades = useMemo(() => {
    if (!journalId) return allTrades;
    return allTrades.filter((t) => t.journalId === journalId);
  }, [allTrades, journalId]);

  // Full document for a new trade: computed P&L fields + safe dates + journal
  // binding. Shared by the single-add and bulk-import paths so both write
  // identical documents.
  // Same document the public API writes (src/utils/tradeDoc.js). Dates are
  // turned into Firestore timestamps here; the Worker encodes the Dates itself.
  const buildTradeDoc = (tradeData) => {
    const stored = buildStoredTrade(tradeData, { journalId, now: new Date() });
    return {
      ...stored,
      createdAt: dateToTimestamp(stored.createdAt),
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

      const isFutures = usesContractMath(tradeData);
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
      // Best-effort: drop legacy chart-screenshot docs too (separate
      // subcollection). Not awaited — a failure must not fail the delete.
      deleteTradeImages(user.uid, tradeId).catch((e) => console.warn('Trade screenshot cleanup failed:', e));
    } catch (error) {
      console.error('Failed to delete trade:', error);
      throw error;
    }
  };

  return { trades, loading, addTrade, addTradesBulk, updateTrade, deleteTrade };
}
