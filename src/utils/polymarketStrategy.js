// Strategy engine — turns a saved rule-set into a ranked shortlist of live
// markets. Pure functions so the criteria can be tested and reused (scan tab,
// personal brief, future alerts) without touching the UI.

// NOTE: the markets API exposes no category field, so topic targeting is done
// with a keyword match on the question rather than an invented taxonomy.
export const STRATEGY_DEFAULTS = {
  name: '',
  keyword: '',             // '' = any market
  priceMin: 0.05,          // probability band the strategy hunts in
  priceMax: 0.95,
  minLiquidity: 5_000,
  minVolume24h: 1_000,
  maxDaysToClose: 90,      // ignore far-dated markets
  minDaysToClose: 0,       // ignore markets closing too soon to manage
  requireSmartMoney: false,
  notes: '',
};

// Bands the UI offers — each is a real, teachable strategy stance.
export const PRICE_PRESETS = [
  { key: 'longshot', label: 'לונגשוט (5–25¢)', min: 0.05, max: 0.25, hint: 'סיכוי נמוך, תשואה גבוהה — צריך דיוק' },
  { key: 'balanced', label: 'מאוזן (35–65¢)', min: 0.35, max: 0.65, hint: 'השוק מתלבט — שם נמצא היתרון האינפורמטיבי' },
  { key: 'favorite', label: 'פייבוריט (70–95¢)', min: 0.70, max: 0.95, hint: 'סיכוי גבוה, רווח קטן — עבודה על נפח' },
  { key: 'custom', label: 'טווח חופשי', min: null, max: null, hint: '' },
];

export function daysToClose(endDate) {
  if (!endDate) return null;
  const d = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  return Number.isFinite(d) ? d : null;
}

// The best tradeable price in a market for this strategy: the outcome whose
// price sits inside the band (highest such price wins — closest to a favorite).
function bandMatch(market, s) {
  let best = null;
  market.prices.forEach((p, i) => {
    if (p >= s.priceMin && p <= s.priceMax && (!best || p > best.price)) {
      best = { price: p, outcome: market.outcomes[i] ?? `#${i}`, index: i };
    }
  });
  return best;
}

/**
 * Score a market against a strategy. Returns null when it fails a hard filter,
 * otherwise a match object with a 0–100 fit score explaining WHY it matched.
 * @param {object} market  normalized market (see polymarketService)
 * @param {object} s       strategy rule-set
 * @param {number} smartCount  how many smart/tracked wallets hold it (0 if unknown)
 */
export function matchMarket(market, s, smartCount = 0) {
  const dtc = daysToClose(market.endDate);

  // Hard filters
  const kw = (s.keyword || '').trim().toLowerCase();
  if (kw && !(market.question || '').toLowerCase().includes(kw)) return null;
  if (market.liquidity < s.minLiquidity) return null;
  if (market.volume24hr < s.minVolume24h) return null;
  if (dtc != null && (dtc > s.maxDaysToClose || dtc < s.minDaysToClose)) return null;
  if (s.requireSmartMoney && smartCount <= 0) return null;
  const band = bandMatch(market, s);
  if (!band) return null;

  // Fit score — liquidity depth, fresh activity, a sane runway, smart backing.
  const liqScore = Math.min(1, market.liquidity / Math.max(1, s.minLiquidity * 10));
  const volScore = Math.min(1, market.volume24hr / Math.max(1, s.minVolume24h * 10));
  const timeScore = dtc == null ? 0.5 : Math.min(1, Math.max(0, 1 - dtc / Math.max(1, s.maxDaysToClose)));
  const smartScore = Math.min(1, smartCount / 3);
  const fit = Math.round((liqScore * 0.3 + volScore * 0.3 + timeScore * 0.2 + smartScore * 0.2) * 100);

  return { market, band, daysLeft: dtc, smartCount, fit };
}

/** Run a strategy over a market list; returns matches sorted by fit. */
export function runStrategy(markets, s, smartCountByMarket = {}) {
  return markets
    .map((m) => matchMarket(m, s, smartCountByMarket[m.conditionId] || 0))
    .filter(Boolean)
    .sort((a, b) => b.fit - a.fit);
}

/** One-line human summary of the rule-set (shown on the strategy card). */
export function describeStrategy(s) {
  const liq = s.minLiquidity >= 1000 ? `${Math.round(s.minLiquidity / 1000)}K` : String(s.minLiquidity);
  const parts = [
    `${Math.round(s.priceMin * 100)}–${Math.round(s.priceMax * 100)}¢`,
    ...(s.keyword ? [`"${s.keyword}"`] : []),
    `נזילות $${liq}+`,
    `עד ${s.maxDaysToClose} ימים`,
    ...(s.requireSmartMoney ? ['עם כסף חכם'] : []),
  ];
  return parts.join(' · ');
}
