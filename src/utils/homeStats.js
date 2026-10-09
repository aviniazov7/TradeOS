// Display rules for the home-page KPIs when the sample is tiny. One closed
// trade used to read as "77 / 100 · מצוין", a win/loss ratio of 200 (the
// average win itself, for want of a loss) and an average loss of "+$0.00".

// Closed trades needed before the performance score / grade is shown.
export const MIN_SCORE_TRADES = 5;

export function scoreReady(closedTrades) {
  return Number(closedTrades) >= MIN_SCORE_TRADES;
}

/** Average win ÷ |average loss|, or null when there is no loss to divide by. */
export function winLossRatio(avgWin, avgLoss) {
  const loss = Math.abs(Number(avgLoss) || 0);
  if (!loss) return null;
  const win = Number(avgWin) || 0;
  return win / loss;
}

/** "N ימים ברצף" with Hebrew singular / zero forms. */
export function streakDaysLabel(n) {
  const d = Number(n) || 0;
  if (d <= 0) return 'אין רצף ימים';
  if (d === 1) return 'יום אחד ברצף';
  if (d === 2) return 'יומיים ברצף';
  return `${d} ימים ברצף`;
}
