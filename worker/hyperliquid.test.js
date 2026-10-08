import { describe, it, expect } from 'vitest';
import {
  aggregateHlFills, orderCoinFills, hlStopRows, normalizeHlOpen, hlPair, hlTradeId, isHlAddress, isPerpFill,
  handleHyperliquidRoute,
} from './hyperliquid';
import { findOpenTradeForClosed, closedRowIdentity } from '../src/utils/exchangeReconcile';
import fx from './hyperliquid.fixture.json';

// fx holds REAL Hyperliquid info-API responses (two public leaderboard
// addresses, captured 2026-10-08), trimmed to the trades covered here:
//   ethShort — one ETH short: 16 fills, its TP/SL orders, one funding payment
//   btcFlip  — BTC short → "Short > Long" flip → long → short closed by 2 orders
//   filOpen  — a still-open FIL long (fills + clearinghouseState + open orders)

const sum = (rows, k) => rows.reduce((s, r) => s + parseFloat(r[k]), 0);
const net = (t) => t.pnlFromExchange - t.fees;

describe('aggregateHlFills — ETH short (real fills)', () => {
  const { fills, orders, funding } = fx.ethShort;
  const { closed, open } = aggregateHlFills(fills, { funding, stops: hlStopRows(orders) });
  const t = closed[0];

  it('rebuilds exactly one closed round trip', () => {
    expect(closed).toHaveLength(1);
    expect(open.size).toBe(0);
  });

  it('maps to the shared closed-trade shape', () => {
    expect(t).toMatchObject({
      pair: 'ETHUSDT',
      direction: 'short',
      orderType: 'market',
      entryPrice: 2682.7,
      exitPrice: 2690.9,
      quantity: 46.5861,
      leverage: 1,
      entryDate: '2026-10-01T14:52:52.855Z',
      exitDate: '2026-10-01T15:15:47.463Z',
      source: 'hyperliquid',
    });
  });

  it('closedPnl is price P&L, gross of fees — and funding is added on top', () => {
    // closedPnl summed over the fills = (entry − exit) × qty for this short.
    expect(sum(fills, 'closedPnl')).toBeCloseTo((2682.7 - 2690.9) * 46.5861, 4);
    expect(t.funding).toBeCloseTo(1.566515, 6); // the 15:00 payment, received
    expect(t.fees).toBeCloseTo(sum(fills, 'fee'), 6);
    // netPnl the app derives = what Hyperliquid realized for the position.
    expect(net(t)).toBeCloseTo(sum(fills, 'closedPnl') - sum(fills, 'fee') + 1.566515, 5);
  });

  it('takes the ORIGINAL stop and TP from the trigger orders', () => {
    expect(t.stopLoss).toBe(2700);
    expect(t.tps).toEqual([2600]);
    expect(t.riskAmount).toBeCloseTo((2700 - 2682.7) * 46.5861, 1);
    expect(t.rrRatio).toBeCloseTo(8.2 / 17.3, 2);
  });

  it('id = opening fill tid, without ":" (exchangeReconcile splits on it)', () => {
    expect(t.externalId).toBe('hl-ETH-917964063326678');
    expect(t.positionId).toBe(t.externalId);
    expect(t.externalId).not.toContain(':');
    expect([...closedRowIdentity(t)]).toEqual([t.externalId]);
  });

  it('is independent of input order (same-ms fills chained by position)', () => {
    const reversed = aggregateHlFills(fills.slice().reverse(), { funding, stops: hlStopRows(orders) }).closed;
    expect(reversed).toEqual(closed);
  });
});

describe('aggregateHlFills — BTC flip + multi-order close (real fills)', () => {
  const { fills, funding } = fx.btcFlip;
  const { closed } = aggregateHlFills(fills, { funding });
  const [last, long, firstShort] = closed; // newest exit first

  it('splits the flip fill into a close and a new open', () => {
    expect(closed.map((t) => t.direction)).toEqual(['short', 'long', 'short']);
    expect(firstShort.exitDate).toBe('2026-09-22T19:35:53.294Z');
    expect(long.entryDate).toBe('2026-09-22T19:35:53.294Z');
    // Short was −8.17093 before the flip, the long +8.17093 after it.
    expect(firstShort.quantity).toBeCloseTo(8.17093, 8);
    expect(long.quantity).toBeCloseTo(8.17093, 8);
  });

  it('attributes funding to the trade that held the position at each payment', () => {
    // Short held 14:00…19:00 (received, positive); long held 20:00…00:00 (paid).
    const shortFunding = funding.filter((f) => f.time <= Date.parse('2026-09-22T19:35:53.294Z'));
    const longFunding = funding.filter((f) => f.time > Date.parse('2026-09-22T19:35:53.294Z'));
    expect(firstShort.funding).toBeCloseTo(shortFunding.reduce((s, f) => s + +f.delta.usdc, 0), 6);
    expect(long.funding).toBeCloseTo(longFunding.reduce((s, f) => s + +f.delta.usdc, 0), 6);
    expect(last.funding).toBe(0);
  });

  it('nets every fill exactly once across the three trades', () => {
    const totalNet = closed.reduce((s, t) => s + net(t), 0);
    const expected = sum(fills, 'closedPnl') - sum(fills, 'fee') + firstShort.funding + long.funding;
    expect(totalNet).toBeCloseTo(expected, 4);
  });

  it('builds a TP breakdown per closing ORDER, summing to 100%', () => {
    expect(last.exits).toEqual([{ price: 86680, percent: 1.06 }, { price: 86675, percent: 98.94 }]);
    expect(long.exits).toBeUndefined();
  });

  it('keeps ids stable when the fetched window changes (re-sync upserts)', () => {
    // A later window that starts AFTER the first short opened: that trip's
    // entry is unknown, so it is skipped — the others keep their ids.
    const cut = fills.filter((f) => f.time > Date.parse('2026-09-22T15:00:00Z'));
    const partial = aggregateHlFills(cut, { funding }).closed;
    expect(partial.map((t) => t.externalId)).toEqual([last.externalId, long.externalId]);
    expect(partial[1]).toEqual(long);
  });
});

describe('open positions (real clearinghouseState)', () => {
  const { fills, clearinghouseState, openOrders } = fx.filOpen;
  const { open } = aggregateHlFills(fills);
  const ap = clearinghouseState.assetPositions[0];
  const row = normalizeHlOpen(ap, open.get('FIL'), hlStopRows(openOrders));

  it('normalizes the live position', () => {
    expect(row).toMatchObject({
      pair: 'FILUSDT', direction: 'long', entryPrice: 1.03963, quantity: 45506, leverage: 5,
      status: 'open', source: 'hyperliquid', tps: [2], stopLoss: 0, liquidationPrice: 0.9248930975,
    });
  });

  it('shares its id with the closed row the same position will produce', () => {
    const firstFill = orderCoinFills(fills).find((f) => parseFloat(f.startPosition) === 0);
    expect(row.externalId).toBe(hlTradeId('FIL', firstFill.tid));
    expect(row.entryDate).toBe(new Date(firstFill.time).toISOString());
    // Simulate the close: one sell fill that flattens the position.
    const close = {
      coin: 'FIL', px: '1.05', sz: ap.position.szi, side: 'A', time: Date.now(), startPosition: ap.position.szi,
      dir: 'Close Long', closedPnl: '1', oid: 1, tid: 1, crossed: true, fee: '0.5', feeToken: 'USDC',
    };
    const closedRow = aggregateHlFills([...fills, close]).closed[0];
    expect(closedRow.externalId).toBe(row.externalId);
  });

  it('a different Hyperliquid open trade is never matched by id', () => {
    const closedRow = { ...aggregateHlFills(fx.ethShort.fills).closed[0] };
    const otherOpen = { id: 'x', status: 'open', source: 'hyperliquid', pair: 'ETHUSDT', direction: 'short', externalId: 'hl-ETH-1', entryPrice: 9999, entryDate: closedRow.entryDate };
    expect(findOpenTradeForClosed(closedRow, [otherOpen])).toBeNull();
    const sameOpen = { ...otherOpen, externalId: closedRow.externalId, entryPrice: 2682.7 };
    expect(findOpenTradeForClosed(closedRow, [sameOpen])).toBe(sameOpen);
  });
});

describe('helpers', () => {
  it('validates wallet addresses', () => {
    expect(isHlAddress(fx.ethShort.user)).toBe(true);
    expect(isHlAddress('0x123')).toBe(false);
    expect(isHlAddress('21535329bebe7387aa349948b839792585d25bc7')).toBe(false);
    expect(isHlAddress('0xZZ535329bebe7387aa349948b839792585d25bc7')).toBe(false);
  });

  it('maps coins to journal pairs', () => {
    expect(hlPair('BTC')).toBe('BTCUSDT');
    expect(hlPair('kPEPE')).toBe('1000PEPEUSDT');
    expect(hlPair('xyz:GOLD')).toBe('GOLD');
  });

  it('ignores spot fills', () => {
    expect(isPerpFill({ coin: 'PURR/USDC' })).toBe(false);
    expect(isPerpFill({ coin: '@107' })).toBe(false);
    expect(isPerpFill({ coin: 'BTC' })).toBe(true);
  });

  it('folds a net maker rebate into the P&L (fees stay ≥ 0)', () => {
    const base = { coin: 'SOL', crossed: false, oid: 1 };
    const { closed } = aggregateHlFills([
      { ...base, px: '100', sz: '10', side: 'B', time: 1, startPosition: '0', closedPnl: '0', fee: '-0.2', tid: 1 },
      { ...base, px: '101', sz: '10', side: 'A', time: 2, startPosition: '10', closedPnl: '10', fee: '-0.1', tid: 2, oid: 2 },
    ]);
    expect(closed[0].fees).toBe(0);
    expect(closed[0].pnlFromExchange).toBeCloseTo(10.3, 8);
    expect(closed[0].orderType).toBe('limit');
  });
});

describe('handleHyperliquidRoute', () => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const deps = { verifyToken: async (t) => (t === 'good' ? 'uid1' : null), rateLimit: async () => ({ count: 1 }), sessionFromDate: () => 'London' };
  const req = (path, token = 'good') => {
    const url = new URL(`https://w.example${path}`);
    return [new Request(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }), url];
  };
  const mockFetch = async (_u, init) => {
    const body = JSON.parse(init.body);
    const data = {
      userFills: fx.ethShort.fills,
      userFunding: fx.ethShort.funding,
      historicalOrders: fx.ethShort.orders,
      clearinghouseState: fx.filOpen.clearinghouseState,
      frontendOpenOrders: fx.filOpen.openOrders,
    }[body.type];
    return new Response(JSON.stringify(data ?? []), { headers: { 'Content-Type': 'application/json' } });
  };

  it('requires sign-in and a valid address', async () => {
    let res = await handleHyperliquidRoute(...req(`/hl/trades?address=${fx.ethShort.user}`, null), cors, deps, mockFetch);
    expect(res.status).toBe(401);
    res = await handleHyperliquidRoute(...req('/hl/trades?address=0xnope'), cors, deps, mockFetch);
    expect(res.status).toBe(400);
  });

  it('returns closed trades with a session', async () => {
    const res = await handleHyperliquidRoute(...req(`/hl/trades?address=${fx.ethShort.user}`), cors, deps, mockFetch);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.trades).toHaveLength(1);
    expect(data.trades[0]).toMatchObject({ externalId: 'hl-ETH-917964063326678', stopLoss: 2700, session: 'London' });
  });

  it('returns open positions and the account value', async () => {
    const res = await handleHyperliquidRoute(...req(`/hl/positions?address=${fx.ethShort.user}`), cors, deps, mockFetch);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.positions[0]).toMatchObject({ pair: 'FILUSDT', status: 'open' });
    expect(data.accountValue).toBeCloseTo(parseFloat(fx.filOpen.clearinghouseState.marginSummary.accountValue), 6);
    expect(data.accountValue).toBeGreaterThan(0);
    // Terminal fields + the open orders it fetched anyway (no second call).
    expect(data.positions[0]).toMatchObject({ marginMode: 'isolated', margin: 9851.876634, unrealizedPnl: 421.84008, funding: -3.765333 });
    expect(data.positions[0].markPrice).toBeCloseTo(47731.2434 / 45506, 8);
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0]).toMatchObject({ kind: 'take_profit', wholePosition: true, pair: 'FILUSDT' });
  });
});
