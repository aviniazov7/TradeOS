/**
 * What status and exit price a trade should carry after an edit.
 *
 * Pulled out of TradeForm because the rule is not obvious and getting it wrong
 * destroys data silently. A trade can be CLOSED with no exit price: a broker
 * CSV that carries a profit column but no exit column imports as status
 * 'closed' with pnlFromExchange set and exitPrice 0, and computeTradeFields is
 * built to handle exactly that shape. The edit form cannot rebuild an exit row
 * it was never given, so its exit list comes back empty — and demoting the
 * trade on that alone flipped it to 'open' with exitPrice 0, at which point
 * computeTradeFields skipped its exchange-P&L branch and wrote pnl 0 /
 * result 'breakeven' over a real recorded profit. Opening such a trade and
 * pressing save without changing anything was enough to lose it.
 *
 * The rule: an empty exit list may only leave a trade open if the trade was
 * not already closed without one.
 */
export function resolveExitState({ prevStatus, prevExitPrice, weightedExit, exitCount, fullyClosed }) {
  const prevExit = parseFloat(prevExitPrice) || 0;
  const closedWithoutExit = prevStatus === 'closed' && !(prevExit > 0);

  if (!exitCount) {
    return {
      status: closedWithoutExit ? 'closed' : 'open',
      exitPrice: closedWithoutExit ? prevExit : 0,
    };
  }
  return {
    status: fullyClosed ? 'closed' : 'partial',
    exitPrice: weightedExit > 0 ? weightedExit : (closedWithoutExit ? prevExit : 0),
  };
}
