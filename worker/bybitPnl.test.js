import { describe, it, expect } from 'vitest';
import { normalizeClosedPnl, tradingFees, positionDirection } from './bybitPnl';

// One record, read by both the push poller and the journal sync. Each quirk
// below cost real debugging once, on one path only.

const rec = (over = {}) => ({
  orderId: 'o1', symbol: 'BTCUSDT', side: 'Sell',
  avgEntryPrice: '60000', avgExitPrice: '62000', qty: '0.5', leverage: '10',
  closedPnl: '995.5', openFee: '2.2', closeFee: '2.3',
  createdTime: '1754042400000', updatedTime: '1754046000000',
  ...over,
});

describe('positionDirection', () => {
  it('flips the CLOSING order side to get the position side', () => {
    // A long is closed by a Sell. Reading side directly imported every long
    // as a short.
    expect(positionDirection({ side: 'Sell' })).toBe('long');
    expect(positionDirection({ side: 'Buy' })).toBe('short');
  });
});

describe('tradingFees', () => {
  it('sums open and close fees', () => {
    expect(tradingFees({ openFee: '2.2', closeFee: '2.3' })).toBeCloseTo(4.5);
  });
  it('takes absolute values — a negative fee is still a cost', () => {
    expect(tradingFees({ openFee: '-2.2', closeFee: '-2.3' })).toBeCloseTo(4.5);
  });
  it('falls back to the other endpoints\' field names only when both are absent', () => {
    expect(tradingFees({ execFee: '3' })).toBe(3);
    // Present open/close fees win over the fallback.
    expect(tradingFees({ openFee: '1', closeFee: '1', execFee: '99' })).toBe(2);
  });
  it('trims float-sum noise instead of storing a twelve-digit number', () => {
    const f = tradingFees({ openFee: '5.079', closeFee: '0.0000000003' });
    expect(String(f).length).toBeLessThan(13);
  });
  it('pins the fallback chain to the ORIGINAL || semantics, quirk included', () => {
    // The values arrive as strings, and the string '0' is truthy, so a zero
    // execFee does NOT fall through to tradingFee — it wins and yields 0.
    // Recorded because it is surprising, and because the whole point of this
    // module is that the two consumers cannot drift on it.
    expect(tradingFees({ execFee: '0', tradingFee: '5' })).toBe(0);
    // A NUMERIC zero is falsy and does fall through.
    expect(tradingFees({ execFee: 0, tradingFee: '5' })).toBe(5);
  });
  it('no fee fields at all is zero, not NaN', () => {
    expect(tradingFees({})).toBe(0);
    expect(tradingFees(null)).toBe(0);
  });
});

describe('normalizeClosedPnl', () => {
  it('exposes BOTH the net figure Bybit reports and the gross the journal needs', () => {
    // closedPnl is already net of both fees. The journal derives
    // net = gross - fees downstream, so handing it the net value subtracted
    // the fees twice and turned a real win into a much smaller one.
    const n = normalizeClosedPnl(rec());
    expect(n.netPnl).toBeCloseTo(995.5);
    expect(n.fees).toBeCloseTo(4.5);
    expect(n.grossPnl).toBeCloseTo(1000);
    expect(n.grossPnl - n.fees).toBeCloseTo(n.netPnl);
  });

  it('parses prices, size and leverage off either field spelling', () => {
    const n = normalizeClosedPnl(rec());
    expect(n.entryPrice).toBe(60000);
    expect(n.exitPrice).toBe(62000);
    expect(n.quantity).toBe(0.5);
    expect(n.leverage).toBe(10);
    const alt = normalizeClosedPnl(rec({ avgEntryPrice: undefined, entryPrice: '100', avgExitPrice: undefined, exitPrice: '110' }));
    expect(alt.entryPrice).toBe(100);
    expect(alt.exitPrice).toBe(110);
  });

  it('reports ROI on the margin actually committed, not the notional', () => {
    // 0.5 @ 60000 with 10x = 3000 margin; 995.5 / 3000 ≈ 33.2%
    expect(normalizeClosedPnl(rec()).roiPct).toBeCloseTo(33.18, 1);
  });

  it('never divides by zero', () => {
    expect(normalizeClosedPnl(rec({ qty: '0' })).roiPct).toBe(0);
    expect(normalizeClosedPnl(rec({ avgEntryPrice: '0' })).roiPct).toBe(0);
  });

  it('falls back to a timestamp id when the record has no orderId', () => {
    expect(normalizeClosedPnl(rec({ orderId: undefined })).externalId).toBe('1754046000000');
  });

  it('defaults leverage to 1 rather than 0, so margin stays finite', () => {
    expect(normalizeClosedPnl(rec({ leverage: undefined })).leverage).toBe(1);
  });

  it('survives a completely empty record', () => {
    const n = normalizeClosedPnl({});
    expect(n.netPnl).toBe(0);
    expect(n.grossPnl).toBe(0);
    expect(n.roiPct).toBe(0);
    expect(Number.isNaN(n.entryPrice)).toBe(false);
  });
});
