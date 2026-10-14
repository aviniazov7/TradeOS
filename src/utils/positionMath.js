/**
 * Pure math for the global position-size calculator.
 * A stop on the wrong side of the entry is an error: |entry − stop| would
 * otherwise size a position and print a positive R:R for a stop that never
 * defined risk (long stop above entry, short stop below).
 */

export function stopSideProblem(direction, entry, stop) {
  const e = Number(entry);
  const s = Number(stop);
  if (!(e > 0) || !(s > 0) || e === s) return null;
  if (direction === 'long' && s >= e) return 'בלונג הסטופ חייב להיות מתחת למחיר הכניסה';
  if (direction === 'short' && s <= e) return 'בשורט הסטופ חייב להיות מעל למחיר הכניסה';
  return null;
}

export function calculatePosition(form) {
  const balance = parseFloat(form?.balance);
  const entry = parseFloat(form?.entryPrice);
  const sl = parseFloat(form?.stopLoss);
  const lev = parseInt(form?.leverage, 10) || 1;
  const target = parseFloat(form?.targetPrice);
  const riskVal = parseFloat(form?.riskValue);

  if (!(entry > 0) || !(sl > 0) || entry === sl) return null;

  const side = stopSideProblem(form?.direction, entry, sl);
  if (side) return { error: side };

  let riskAmount;
  if (form?.riskType === 'percent' && balance > 0 && riskVal > 0) {
    riskAmount = (riskVal / 100) * balance;
  } else if (form?.riskType === 'fixed' && riskVal > 0) {
    riskAmount = riskVal;
  } else {
    return null;
  }

  const slDistance = Math.abs(entry - sl);
  const slDistancePercent = (slDistance / entry) * 100;
  const positionSize = (riskAmount * entry) / slDistance;
  const quantity = positionSize / entry;
  const margin = positionSize / lev;
  const riskPercent = balance > 0 ? (riskAmount / balance) * 100 : null;

  let rrRatio = null;
  let potentialProfit = null;
  if (target > 0 && target !== entry) {
    const reward = form.direction === 'long' ? target - entry : entry - target;
    // A target on the loss side is not a reward. Leave R blank rather than
    // printing 1:2 for a price that loses money; the dollar figure stays signed.
    if (reward > 0) rrRatio = reward / slDistance;
    potentialProfit = reward * quantity;
  }

  return {
    error: null,
    riskAmount,
    positionSize,
    quantity,
    margin,
    slDistancePercent,
    riskPercent,
    rrRatio,
    potentialProfit,
    potentialLoss: -riskAmount,
  };
}
