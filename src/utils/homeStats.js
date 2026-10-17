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
/** "—" until there is at least one win or loss. 0.00 on an empty journal is not a factor. */
export function profitFactorText(profitFactor, wins = 0, losses = 0) {
  if ((Number(wins) || 0) + (Number(losses) || 0) === 0) return '—';
  if (profitFactor == null || profitFactor === Infinity) return '∞';
  const n = Number(profitFactor);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

/** Win rate label. An empty sample is a dash, not "0.0%". */
export function winRateText(winRate, wins = 0, losses = 0) {
  if ((Number(wins) || 0) + (Number(losses) || 0) === 0) return '—';
  const n = Number(winRate);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
}

export function streakDaysLabel(n) {
  const d = Number(n) || 0;
  if (d <= 0) return 'אין רצף ימים';
  if (d === 1) return 'יום אחד ברצף';
  if (d === 2) return 'יומיים ברצף';
  return `${d} ימים ברצף`;
}
