import { isClosedTrade, safePnl, signedTradeR, winRateOf } from './calculations';

// Setup tags on a trade (LPS, Spring, breakout, …). Separate from the
// free-form psychology `tags` and from the single `strategy` / `trigger`
// fields. Missing on every trade written before this feature — readers must
// treat "no setups" as empty, never as an error.

export const MAX_SETUPS = 8;
export const MAX_SETUP_LENGTH = 40;

export const SETUP_PRESETS = [
  'LPS',
  'Spring',
  'breakout',
  'UTAD',
  'LPSY',
  'UTAD/LPSY short',
];

export const SETUP_LABELS = {
  LPS: 'LPS',
  Spring: 'Spring',
  breakout: 'פריצה',
  UTAD: 'UTAD',
  LPSY: 'LPSY',
  'UTAD/LPSY short': 'UTAD/LPSY שורט',
};

const PRESET_BY_KEY = new Map(SETUP_PRESETS.map((name) => [name.toLowerCase(), name]));

export function setupLabel(name) {
  return SETUP_LABELS[name] || name || '';
}

/**
 * Clean whatever is stored on a trade into a short unique list.
 * Absent, null, or a non-list becomes []. A comma-separated string (a dirty
 * import) is split. Known presets are canonicalized so "spring" and "Spring"
 * are one setup.
 */
export function tradeSetups(trade) {
  const raw = trade?.setups;
  const list = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' ? raw.split(',') : []);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const trimmed = String(item ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_SETUP_LENGTH);
    if (!trimmed) continue;
    const name = PRESET_BY_KEY.get(trimmed.toLowerCase()) || trimmed;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_SETUPS) break;
  }
  return out;
}

/**
 * Stats for each setup, over CLOSED trades only. A trade tagged with two
 * setups counts in both. Trades with no setups are skipped — they stay in
 * every other stat.
 *
 * avgNetR is the mean of signed net R (fees inside the number), the same
 * definition as the journal header "R ממוצע". Trades whose risk was never
 * defined are left out of the average.
 *
 * expectancy is that same net R, weighted the way a decided-trade expectancy
 * is: (win% × avg winning R) − (loss% × avg losing R), with breakevens left
 * out of the weights. It equals avgNetR when every counted trade is a win or
 * a loss; a breakeven pulls the average down and leaves expectancy unchanged.
 */
export function computeSetupStats(trades) {
  const buckets = new Map();
  for (const t of trades || []) {
    if (!isClosedTrade(t)) continue;
    const setups = tradeSetups(t);
    if (!setups.length) continue;
    const pnl = safePnl(t);
    const r = signedTradeR(t);
    for (const name of setups) {
      let b = buckets.get(name);
      if (!b) {
        b = {
          name,
          count: 0,
          wins: 0,
          losses: 0,
          pnl: 0,
          rSum: 0,
          rCount: 0,
          winRSum: 0,
          winRCount: 0,
          lossRSum: 0,
          lossRCount: 0,
        };
        buckets.set(name, b);
      }
      b.count += 1;
      if (t.result === 'win') b.wins += 1;
      else if (t.result === 'loss') b.losses += 1;
      b.pnl += pnl;
      if (r === null) continue;
      b.rCount += 1;
      b.rSum += r;
      if (r > 0) {
        b.winRSum += r;
        b.winRCount += 1;
      } else if (r < 0) {
        b.lossRSum += r;
        b.lossRCount += 1;
      }
    }
  }

  return [...buckets.values()].map((b) => {
    const avgNetR = b.rCount ? b.rSum / b.rCount : null;
    const decided = b.winRCount + b.lossRCount;
    const avgWinR = b.winRCount ? b.winRSum / b.winRCount : 0;
    const avgLossR = b.lossRCount ? Math.abs(b.lossRSum / b.lossRCount) : 0;
    const expectancy = decided
      ? (b.winRCount / decided) * avgWinR - (b.lossRCount / decided) * avgLossR
      : null;
    return {
      name: b.name,
      label: setupLabel(b.name),
      count: b.count,
      wins: b.wins,
      losses: b.losses,
      winRate: winRateOf(b.wins, b.losses),
      avgNetR,
      expectancy,
      pnl: b.pnl,
    };
  }).sort((a, b) => b.count - a.count || b.pnl - a.pnl || a.name.localeCompare(b.name));
}
