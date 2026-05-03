// ─── Technical Analysis Utilities ─────────────────────────────────

export function computeRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function computeMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function computeVolatility(prices) {
  if (prices.length < 2) return null;
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * 100;
}

export function computeFibonacci(prices) {
  if (!prices.length) return null;
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const diff = high - low;
  return {
    high,
    low,
    levels: {
      '0.236': high - diff * 0.236,
      '0.382': high - diff * 0.382,
      '0.5': high - diff * 0.5,
      '0.618': high - diff * 0.618,
    },
  };
}

/** Find local support/resistance from significant pivots in price data */
export function computeSupportResistance(prices) {
  if (prices.length < 5) return { support: null, resistance: null };

  const pivots = [];
  for (let i = 2; i < prices.length - 2; i++) {
    const isHigh = prices[i] > prices[i - 1] && prices[i] > prices[i - 2] &&
                   prices[i] > prices[i + 1] && prices[i] > prices[i + 2];
    const isLow = prices[i] < prices[i - 1] && prices[i] < prices[i - 2] &&
                  prices[i] < prices[i + 1] && prices[i] < prices[i + 2];
    if (isHigh) pivots.push({ type: 'high', price: prices[i] });
    if (isLow) pivots.push({ type: 'low', price: prices[i] });
  }

  const current = prices[prices.length - 1];
  const lows = pivots.filter((p) => p.type === 'low' && p.price < current).map((p) => p.price);
  const highs = pivots.filter((p) => p.type === 'high' && p.price > current).map((p) => p.price);

  return {
    support: lows.length ? lows[lows.length - 1] : null,
    resistance: highs.length ? highs[highs.length - 1] : null,
  };
}

// ─── Coin Detection ──────────────────────────────────────────────

const COIN_ALIASES = {
  bitcoin: { aliases: ['btc', 'ביטקוין', 'bitcoin'], symbol: 'BTC' },
  ethereum: { aliases: ['eth', 'אתריום', 'ethereum'], symbol: 'ETH' },
  solana: { aliases: ['sol', 'סולנה', 'solana'], symbol: 'SOL' },
  ripple: { aliases: ['xrp', 'ריפל', 'ripple'], symbol: 'XRP' },
  binancecoin: { aliases: ['bnb', 'בינאנס קוין', 'binance coin'], symbol: 'BNB' },
  dogecoin: { aliases: ['doge', 'דוג', 'dogecoin'], symbol: 'DOGE' },
  cardano: { aliases: ['ada', 'קרדנו', 'cardano'], symbol: 'ADA' },
  'avalanche-2': { aliases: ['avax', 'אבלאנצ', 'avalanche'], symbol: 'AVAX' },
  'pax-gold': { aliases: ['xau', 'זהב', 'gold'], symbol: 'XAU' },
  litecoin: { aliases: ['ltc', 'לייטקוין', 'litecoin'], symbol: 'LTC' },
  polkadot: { aliases: ['dot', 'פולקדוט', 'polkadot'], symbol: 'DOT' },
  chainlink: { aliases: ['link', "צ'יינלינק", 'chainlink'], symbol: 'LINK' },
  uniswap: { aliases: ['uni', 'יוניסוואפ', 'uniswap'], symbol: 'UNI' },
  'matic-network': { aliases: ['matic', 'polygon', 'פוליגון'], symbol: 'MATIC' },
  tron: { aliases: ['trx', 'טרון', 'tron'], symbol: 'TRX' },
};

/**
 * Detect a coin mentioned in free-form text.
 * Returns { coingeckoId, symbol } or null.
 */
export function detectCoinFromText(text) {
  if (!text) return null;
  // Normalize: lowercase + split into words (handles Hebrew and English)
  const lower = text.toLowerCase();
  const words = lower.split(/[\s,.\-?!:;]+/).filter(Boolean);

  for (const [geckoId, { aliases, symbol }] of Object.entries(COIN_ALIASES)) {
    for (const alias of aliases) {
      // Check if any word matches the alias exactly, or if the full text contains multi-word aliases
      if (words.includes(alias) || (alias.includes(' ') && lower.includes(alias))) {
        return { coingeckoId: geckoId, symbol };
      }
    }
  }
  return null;
}
