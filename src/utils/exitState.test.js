import { describe, it, expect } from 'vitest';
import { resolveExitState } from './exitState';
import { computeTradeFields } from './calculations';

describe('resolveExitState', () => {
  it('a new trade with no exits is open', () => {
    expect(resolveExitState({ prevStatus: undefined, prevExitPrice: undefined, weightedExit: 0, exitCount: 0 }))
      .toEqual({ status: 'open', exitPrice: 0 });
  });

  it('an OPEN trade with no exits stays open', () => {
    expect(resolveExitState({ prevStatus: 'open', prevExitPrice: 0, weightedExit: 0, exitCount: 0 }))
      .toEqual({ status: 'open', exitPrice: 0 });
  });

  it('a trade closed WITHOUT an exit price is not demoted by an empty exit list', () => {
    // THE BUG. Broker CSV: profit column, no exit column. The form cannot
    // rebuild an exit row, so it arrived here with exitCount 0 and flipped the
    // trade to open — which zeroed a real profit on the next save.
    expect(resolveExitState({ prevStatus: 'closed', prevExitPrice: 0, weightedExit: 0, exitCount: 0 }))
      .toEqual({ status: 'closed', exitPrice: 0 });
  });

  it('a trade closed WITH an exit price that lost its exits is still closed', () => {
    expect(resolveExitState({ prevStatus: 'closed', prevExitPrice: 0, weightedExit: 0, exitCount: 0 }).status)
      .toBe('closed');
  });

  it('exits present: full close closes, partial close is partial', () => {
    expect(resolveExitState({ prevStatus: 'open', weightedExit: 110, exitCount: 1, fullyClosed: true }))
      .toEqual({ status: 'closed', exitPrice: 110 });
    expect(resolveExitState({ prevStatus: 'open', weightedExit: 110, exitCount: 1, fullyClosed: false }))
      .toEqual({ status: 'partial', exitPrice: 110 });
  });

  it('an ordinary open trade is never handed a phantom exit price', () => {
    expect(resolveExitState({ prevStatus: 'open', prevExitPrice: 99, weightedExit: 0, exitCount: 0 }).exitPrice)
      .toBe(0);
  });
});

describe('the round-trip the bug destroyed', () => {
  // End to end: import shape → edit → save → recompute. Before the fix the
  // second computeTradeFields returned pnl 0 and result 'breakeven'.
  const imported = {
    direction: 'long', entryPrice: 1.085, quantity: 10000, leverage: 1,
    status: 'closed', exitPrice: 0, pnlFromExchange: 250.4, fees: 0,
  };

  it('keeps the recorded profit across a no-op re-save', () => {
    const before = computeTradeFields(imported);
    expect(before.pnl).toBeCloseTo(250.4);
    expect(before.result).toBe('win');

    const next = resolveExitState({
      prevStatus: imported.status, prevExitPrice: imported.exitPrice,
      weightedExit: 0, exitCount: 0,
    });
    const after = computeTradeFields({ ...imported, ...next });

    expect(after.pnl).toBeCloseTo(250.4);
    expect(after.netPnl).toBeCloseTo(250.4);
    expect(after.result).toBe('win');
    expect(next.status).toBe('closed');
  });
});
