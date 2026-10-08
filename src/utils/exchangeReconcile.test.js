import { describe, it, expect } from 'vitest';
import { findOpenTradeForClosed, closedRowIdentity } from './exchangeReconcile';
import { normalizeOkxClosed, normalizeOkxOpen, normalizeMexcClosed, normalizeBitgetClosed } from '../../worker/exchangeNormalize';

const H = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 10, 8, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
// What Firestore hands back for an imported open trade.
const stored = (row, id = 'doc1', extra = {}) => ({
  id,
  ...row,
  status: 'open',
  entryDate: { toDate: () => new Date(row.entryDate) },
  ...extra,
});

describe('findOpenTradeForClosed — per exchange', () => {
  it('OKX: matches the open posId to the closed "posId:cTime" row', () => {
    const raw = { instId: 'BTC-USDT-SWAP', posId: '42', cTime: String(T0), lever: '10' };
    const open = normalizeOkxOpen({ ...raw, avgPx: '60000', pos: '3', posSide: 'long' }, 0.01);
    const closed = normalizeOkxClosed({
      ...raw, direction: 'long', openAvgPx: '60000', closeAvgPx: '61000', closeTotalPos: '3',
      uTime: String(T0 + 2 * H), realizedPnl: '29', fee: '-1',
    }, 0.01);
    expect(closed.externalId).toBe(`42:${T0}`);
    const trades = [stored(open)];
    expect(findOpenTradeForClosed(closed, trades)?.id).toBe('doc1');
    // closedRowIdentity also yields the root id without positionId.
    const noPos = { ...closed };
    delete noPos.positionId;
    expect(closedRowIdentity(noPos).has('42')).toBe(true);
  });

  it('MEXC: matches by the live positionId', () => {
    const open = {
      pair: 'RVNUSDT', direction: 'long', entryPrice: 0.03491, quantity: 1141, source: 'mexc',
      externalId: '390281084', entryDate: iso(1711512408000),
    };
    const closed = normalizeMexcClosed({
      positionId: '390281084', symbol: 'RVN_USDT', positionType: '1', closeVol: '1141',
      openAvgPrice: '0.03491', closeAvgPrice: '0.03494', realised: '0.18', fee: '0.16', leverage: '50',
    }, { externalId: 'hist-9', entryDate: iso(1711512408000), exitDate: iso(1711512553000) });
    expect(findOpenTradeForClosed(closed, [stored(open)])?.id).toBe('doc1');
  });

  it('Bybit: no shared id — matches by pair/direction/entry price inside the lifetime', () => {
    // Bybit stamps the open snapshot with its LAST activity (e.g. a moved SL).
    const open = {
      pair: 'ETHUSDT', direction: 'short', entryPrice: 3000.5, quantity: 2, source: 'bybit',
      externalId: `ETHUSDT_0_${T0 + H}`, entryDate: iso(T0 + H),
    };
    const closed = {
      pair: 'ETHUSDT', direction: 'short', entryPrice: 3000.5, exitPrice: 2950, quantity: 2,
      source: 'bybit', externalId: 'order-abc', externalIds: ['order-abc'],
      entryDate: iso(T0), exitDate: iso(T0 + 3 * H), pnlFromExchange: 101,
    };
    expect(findOpenTradeForClosed(closed, [stored(open)])?.id).toBe('doc1');
  });

  it('Bitget: legacy pair_ctime ids still line up (and are found by id)', () => {
    const closed = normalizeBitgetClosed({
      symbol: 'BTCUSDT', holdSide: 'long', openAvgPrice: '37272.1', closeAvgPrice: '37300',
      closeTotalPos: '0.001', ctime: String(T0), utime: String(T0 + H), netProfit: '0.02',
    });
    const open = {
      pair: 'BTCUSDT', direction: 'long', entryPrice: 37280, quantity: 0.001, source: 'bitget',
      externalId: `BTCUSDT_${T0}`, entryDate: iso(T0),
    };
    expect(findOpenTradeForClosed(closed, [stored(open)])?.id).toBe('doc1');
  });
});

describe('findOpenTradeForClosed — safety', () => {
  const open = {
    pair: 'ETHUSDT', direction: 'long', entryPrice: 3000, quantity: 1, source: 'bybit',
    externalId: 'open-1', entryDate: iso(T0),
  };
  const closed = {
    pair: 'ETHUSDT', direction: 'long', entryPrice: 3000, exitPrice: 3100, quantity: 1,
    source: 'bybit', externalId: 'close-1', entryDate: iso(T0), exitDate: iso(T0 + H),
  };

  it('ignores other exchanges, directions, pairs and closed trades', () => {
    expect(findOpenTradeForClosed(closed, [stored({ ...open, source: 'mexc' })])).toBeNull();
    expect(findOpenTradeForClosed(closed, [stored({ ...open, direction: 'short' })])).toBeNull();
    expect(findOpenTradeForClosed(closed, [stored({ ...open, pair: 'BTCUSDT' })])).toBeNull();
    expect(findOpenTradeForClosed(closed, [stored(open, 'd', { status: 'closed' })])).toBeNull();
  });

  it('ignores an open trade from outside the position lifetime', () => {
    const old = { ...open, entryDate: iso(T0 - 48 * H) };
    expect(findOpenTradeForClosed(closed, [stored(old)])).toBeNull();
  });

  it('ignores a different entry price without a shared id', () => {
    expect(findOpenTradeForClosed(closed, [stored({ ...open, entryPrice: 3100 })])).toBeNull();
  });

  it('does not let a partial close consume a larger open position', () => {
    expect(findOpenTradeForClosed({ ...closed, quantity: 0.4 }, [stored(open)])).toBeNull();
  });

  it('skips trades already claimed by another row of the same batch', () => {
    expect(findOpenTradeForClosed(closed, [stored(open)], { claimed: new Set(['doc1']) })).toBeNull();
  });

  it('never matches an OPEN row (open positions are added, not reconciled)', () => {
    expect(findOpenTradeForClosed({ ...closed, _isOpen: true }, [stored(open)])).toBeNull();
  });

  it('prefers the id match, then the closest entry price', () => {
    const near = stored({ ...open, entryPrice: 3001 }, 'near');
    const exact = stored({ ...open, entryPrice: 3000 }, 'exact');
    expect(findOpenTradeForClosed(closed, [near, exact])?.id).toBe('exact');
    const byId = stored({ ...open, entryPrice: 3010, externalId: 'pos-7' }, 'byId');
    expect(findOpenTradeForClosed({ ...closed, positionId: 'pos-7' }, [exact, byId])?.id).toBe('byId');
  });
});
