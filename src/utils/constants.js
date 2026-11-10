// App version — bumped on each release. Shown in the sidebar so it's
// easy to confirm which version a device is actually running.
export const APP_VERSION = '2.3.0';

export const COINS = [
  // Layer 1s
  { symbol: 'BTC',    name: 'Bitcoin',          coingeckoId: 'bitcoin' },
  { symbol: 'ETH',    name: 'Ethereum',          coingeckoId: 'ethereum' },
  { symbol: 'SOL',    name: 'Solana',            coingeckoId: 'solana' },
  { symbol: 'AVAX',   name: 'Avalanche',         coingeckoId: 'avalanche-2' },
  { symbol: 'BNB',    name: 'BNB',               coingeckoId: 'binancecoin' },
  { symbol: 'ADA',    name: 'Cardano',           coingeckoId: 'cardano' },
  { symbol: 'XRP',    name: 'Ripple',            coingeckoId: 'ripple' },
  { symbol: 'TRX',    name: 'TRON',              coingeckoId: 'tron' },
  { symbol: 'SUI',    name: 'Sui',               coingeckoId: 'sui' },
  { symbol: 'NEAR',   name: 'NEAR Protocol',     coingeckoId: 'near' },
  { symbol: 'APT',    name: 'Aptos',             coingeckoId: 'aptos' },
  { symbol: 'DOT',    name: 'Polkadot',          coingeckoId: 'polkadot' },
  { symbol: 'ATOM',   name: 'Cosmos',            coingeckoId: 'cosmos' },
  { symbol: 'LTC',    name: 'Litecoin',          coingeckoId: 'litecoin' },
  { symbol: 'ETC',    name: 'Ethereum Classic',  coingeckoId: 'ethereum-classic' },
  { symbol: 'FTM',    name: 'Fantom',            coingeckoId: 'fantom' },
  { symbol: 'KAIA',   name: 'Kaia',              coingeckoId: 'kaia' },
  // Layer 2s
  { symbol: 'ARB',    name: 'Arbitrum',          coingeckoId: 'arbitrum' },
  { symbol: 'OP',     name: 'Optimism',          coingeckoId: 'optimism' },
  { symbol: 'STRK',   name: 'Starknet',          coingeckoId: 'starknet' },
  { symbol: 'ZK',     name: 'ZKsync',            coingeckoId: 'zksync' },
  { symbol: 'MANTA',  name: 'Manta Network',     coingeckoId: 'manta-network' },
  { symbol: 'BLAST',  name: 'Blast',             coingeckoId: 'blast' },
  // DeFi
  { symbol: 'LINK',   name: 'Chainlink',         coingeckoId: 'chainlink' },
  { symbol: 'UNI',    name: 'Uniswap',           coingeckoId: 'uniswap' },
  { symbol: 'AAVE',   name: 'Aave',              coingeckoId: 'aave' },
  { symbol: 'MKR',    name: 'Maker',             coingeckoId: 'maker' },
  { symbol: 'INJ',    name: 'Injective',         coingeckoId: 'injective-protocol' },
  { symbol: 'JUP',    name: 'Jupiter',           coingeckoId: 'jupiter-exchange-solana' },
  { symbol: 'JTO',    name: 'Jito',              coingeckoId: 'jito-governance-token' },
  { symbol: 'PYTH',   name: 'Pyth Network',      coingeckoId: 'pyth-network' },
  { symbol: 'GRT',    name: 'The Graph',         coingeckoId: 'the-graph' },
  { symbol: 'FIL',    name: 'Filecoin',          coingeckoId: 'filecoin' },
  { symbol: 'SEI',    name: 'Sei',               coingeckoId: 'sei-network' },
  { symbol: 'TIA',    name: 'Celestia',          coingeckoId: 'celestia' },
  { symbol: 'W',      name: 'Wormhole',          coingeckoId: 'wormhole' },
  { symbol: 'EIGEN',  name: 'EigenLayer',        coingeckoId: 'eigenlayer' },
  { symbol: 'IO',     name: 'io.net',            coingeckoId: 'io-net' },
  // AI
  { symbol: 'FET',    name: 'Fetch.ai',          coingeckoId: 'fetch-ai' },
  { symbol: 'RENDER', name: 'Render',            coingeckoId: 'render-token' },
  { symbol: 'RNDR',   name: 'Render',            coingeckoId: 'render-token' },
  { symbol: 'TAO',    name: 'Bittensor',         coingeckoId: 'bittensor' },
  { symbol: 'WLD',    name: 'Worldcoin',         coingeckoId: 'worldcoin-wld' },
  { symbol: 'KAITO',  name: 'Kaito',             coingeckoId: 'kaito' },
  // Meme
  { symbol: 'DOGE',   name: 'Dogecoin',          coingeckoId: 'dogecoin' },
  { symbol: 'SHIB',   name: 'Shiba Inu',         coingeckoId: 'shiba-inu' },
  { symbol: 'PEPE',   name: 'Pepe',              coingeckoId: 'pepe' },
  { symbol: 'WIF',    name: 'dogwifhat',          coingeckoId: 'dogwifhat' },
  { symbol: 'BONK',   name: 'Bonk',              coingeckoId: 'bonk' },
  { symbol: 'FLOKI',  name: 'Floki',             coingeckoId: 'floki' },
  { symbol: 'POPCAT', name: 'Popcat',            coingeckoId: 'popcat' },
  { symbol: 'MOODENG',name: 'Moo Deng',          coingeckoId: 'moo-deng' },
  { symbol: 'PENGU',  name: 'Pudgy Penguins',    coingeckoId: 'pudgy-penguins' },
  { symbol: 'TRUMP',  name: 'Official Trump',    coingeckoId: 'official-trump' },
  { symbol: 'NOT',    name: 'Notcoin',           coingeckoId: 'notcoin' },
  // Gaming / Metaverse
  { symbol: 'AXS',    name: 'Axie Infinity',     coingeckoId: 'axie-infinity' },
  { symbol: 'SAND',   name: 'The Sandbox',       coingeckoId: 'the-sandbox' },
  { symbol: 'MANA',   name: 'Decentraland',      coingeckoId: 'decentraland' },
  { symbol: 'GALA',   name: 'Gala',              coingeckoId: 'gala' },
  { symbol: 'IMX',    name: 'Immutable',         coingeckoId: 'immutable-x' },
  // Other
  { symbol: 'MATIC',  name: 'Polygon',           coingeckoId: 'matic-network' },
  { symbol: 'POL',    name: 'Polygon',           coingeckoId: 'polygon-ecosystem-token' },
  { symbol: 'CFX',    name: 'Conflux',           coingeckoId: 'conflux-token' },
  { symbol: 'MAGIC',  name: 'Magic',             coingeckoId: 'magic' },
  { symbol: 'XAU',    name: 'Gold',              coingeckoId: 'pax-gold' },
];

export const PAIRS = COINS.map((c) => `${c.symbol}USDT`);

// ─── CME futures + spot CFDs (epic #32) ───────────────────────────
// pointValue is the dollar value of ONE full price point per contract (futures)
// or per standard lot (CFD). Dollar P&L is (exit − entry) × pointValue × size.
// Futures size is whole contracts. CFD size is lots, including fractions
// (0.01, 0.1, 1). tickSize is the minimum price increment.
// CME rows: keep in sync with docs/specs/futures-contracts.md.
export const FUTURES_CONTRACTS = [
  // Equity indices
  { symbol: 'ES',  name: 'E-mini S&P 500',        exchange: 'CME',   pointValue: 50,    tickSize: 0.25,  currency: 'USD' },
  { symbol: 'MES', name: 'Micro E-mini S&P 500',  exchange: 'CME',   pointValue: 5,     tickSize: 0.25,  currency: 'USD' },
  { symbol: 'NQ',  name: 'E-mini Nasdaq-100',     exchange: 'CME',   pointValue: 20,    tickSize: 0.25,  currency: 'USD' },
  { symbol: 'MNQ', name: 'Micro E-mini Nasdaq',   exchange: 'CME',   pointValue: 2,     tickSize: 0.25,  currency: 'USD' },
  { symbol: 'YM',  name: 'E-mini Dow',            exchange: 'CBOT',  pointValue: 5,     tickSize: 1,     currency: 'USD' },
  { symbol: 'MYM', name: 'Micro E-mini Dow',      exchange: 'CBOT',  pointValue: 0.5,   tickSize: 1,     currency: 'USD' },
  { symbol: 'RTY', name: 'E-mini Russell 2000',   exchange: 'CME',   pointValue: 50,    tickSize: 0.1,   currency: 'USD' },
  { symbol: 'M2K', name: 'Micro E-mini Russell',  exchange: 'CME',   pointValue: 5,     tickSize: 0.1,   currency: 'USD' },
  // Energy
  { symbol: 'CL',  name: 'Crude Oil WTI',         exchange: 'NYMEX', pointValue: 1000,  tickSize: 0.01,  currency: 'USD' },
  { symbol: 'MCL', name: 'Micro Crude Oil',       exchange: 'NYMEX', pointValue: 100,   tickSize: 0.01,  currency: 'USD' },
  { symbol: 'NG',  name: 'Natural Gas',           exchange: 'NYMEX', pointValue: 10000, tickSize: 0.001, currency: 'USD' },
  // Metals
  { symbol: 'GC',  name: 'Gold',                  exchange: 'COMEX', pointValue: 100,   tickSize: 0.1,   currency: 'USD' },
  { symbol: 'MGC', name: 'Micro Gold',            exchange: 'COMEX', pointValue: 10,    tickSize: 0.1,   currency: 'USD' },
  { symbol: 'SI',  name: 'Silver',                exchange: 'COMEX', pointValue: 5000,  tickSize: 0.005, currency: 'USD' },
  // Rates
  { symbol: 'ZB',  name: '30-Year T-Bond',        exchange: 'CBOT',  pointValue: 1000,  tickSize: 0.03125, currency: 'USD' },
  { symbol: 'ZN',  name: '10-Year T-Note',        exchange: 'CBOT',  pointValue: 1000,  tickSize: 0.015625, currency: 'USD' },
];

// Spot / index CFDs (Vantage and other forex brokers). kind:'cfd' means the
// size is lots, not integer contracts. XAUUSD standard lot = 100 oz, so one
// point on one lot is $100 — the same multiplier as a full GC, but 0.1 lot
// is a tenth of that. XAGUSD standard lot = 5,000 oz. NAS100 and US100 are
// the same Nasdaq-100 CFD under the two symbols brokers use; 1 lot pays
// $1 per index point.
export const CFD_INSTRUMENTS = [
  { symbol: 'XAUUSD', name: 'Gold spot CFD',     exchange: 'CFD', pointValue: 100,  tickSize: 0.01,  currency: 'USD', kind: 'cfd', note: '100 oz/lot' },
  { symbol: 'XAGUSD', name: 'Silver spot CFD',   exchange: 'CFD', pointValue: 5000, tickSize: 0.001, currency: 'USD', kind: 'cfd', note: '5000 oz/lot' },
  { symbol: 'NAS100', name: 'Nasdaq-100 CFD',    exchange: 'CFD', pointValue: 1,      tickSize: 0.1,     currency: 'USD', kind: 'cfd', note: '$1/pt' },
  { symbol: 'US100',  name: 'Nasdaq-100 CFD',    exchange: 'CFD', pointValue: 1,      tickSize: 0.1,     currency: 'USD', kind: 'cfd', note: '$1/pt' },
  { symbol: 'US30',   name: 'Dow Jones CFD',     exchange: 'CFD', pointValue: 1,      tickSize: 1,       currency: 'USD', kind: 'cfd', note: '$1/pt' },
  { symbol: 'US500',  name: 'S&P 500 CFD',       exchange: 'CFD', pointValue: 1,      tickSize: 0.1,     currency: 'USD', kind: 'cfd', note: '$1/pt' },
  // Quote is USD, so a price move × 100,000 × lots is already dollars.
  { symbol: 'EURUSD', name: 'Euro / US dollar',  exchange: 'CFD', pointValue: 100000, tickSize: 0.00001, currency: 'USD', kind: 'cfd', note: '100k' },
  { symbol: 'GBPUSD', name: 'Pound / US dollar', exchange: 'CFD', pointValue: 100000, tickSize: 0.00001, currency: 'USD', kind: 'cfd', note: '100k' },
  { symbol: 'AUDUSD', name: 'Aussie / US dollar', exchange: 'CFD', pointValue: 100000, tickSize: 0.00001, currency: 'USD', kind: 'cfd', note: '100k' },
  { symbol: 'NZDUSD', name: 'Kiwi / US dollar',  exchange: 'CFD', pointValue: 100000, tickSize: 0.00001, currency: 'USD', kind: 'cfd', note: '100k' },
  // Quote is not USD. pointValue × points × lots is in that currency, not dollars.
  { symbol: 'USDJPY', name: 'US dollar / Yen',   exchange: 'CFD', pointValue: 100000, tickSize: 0.001,   currency: 'JPY', kind: 'cfd', note: '100k' },
  { symbol: 'USDCAD', name: 'US dollar / Canada', exchange: 'CFD', pointValue: 100000, tickSize: 0.00001, currency: 'CAD', kind: 'cfd', note: '100k' },
  { symbol: 'USDCHF', name: 'US dollar / Swiss', exchange: 'CFD', pointValue: 100000, tickSize: 0.00001, currency: 'CHF', kind: 'cfd', note: '100k' },
];

const INSTRUMENTS = [...FUTURES_CONTRACTS, ...CFD_INSTRUMENTS];

/** Contract spec lookup by symbol (case-insensitive). Returns null when unknown. */
export function getContractSpec(symbol) {
  if (!symbol) return null;
  const s = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return INSTRUMENTS.find((c) => c.symbol === s) || null;
}

/** True for spot/index CFDs sized in fractional lots. */
export function isCfdSpec(spec) {
  return spec?.kind === 'cfd';
}

// One-line English names for the picker. The official `name` is longer
// ("Micro E-mini S&P 500") and wraps inside the RTL menu.
const FUTURES_SHORT = {
  ES: 'S&P',
  MES: 'Micro S&P',
  NQ: 'Nasdaq',
  MNQ: 'Micro Nasdaq',
  YM: 'Dow',
  MYM: 'Micro Dow',
  RTY: 'Russell',
  M2K: 'Micro Russell',
  CL: 'Crude',
  MCL: 'Micro Crude',
  NG: 'Nat Gas',
  GC: 'Gold',
  MGC: 'Micro Gold',
  SI: 'Silver',
  ZB: '30Y Bond',
  ZN: '10Y Note',
};

const CFD_MENU_LABEL = {
  XAUUSD: 'XAUUSD · Gold · 100 oz/lot',
  XAGUSD: 'XAGUSD · Silver · 5000 oz/lot',
  NAS100: 'NAS100 · Nasdaq · $1/pt',
  US100: 'US100 · Nasdaq · $1/pt',
  US30: 'US30 · Dow · $1/pt',
  US500: 'US500 · S&P · $1/pt',
  EURUSD: 'EURUSD · Euro',
  GBPUSD: 'GBPUSD · Pound',
  AUDUSD: 'AUDUSD · Aussie',
  NZDUSD: 'NZDUSD · Kiwi',
  USDJPY: 'USDJPY · Yen',
  USDCAD: 'USDCAD · Canada',
  USDCHF: 'USDCHF · Swiss',
};

function instrumentMenuLabel(c) {
  if (c.kind === 'cfd') return CFD_MENU_LABEL[c.symbol] || `${c.symbol} · ${c.note}`;
  const pv = Number.isInteger(c.pointValue) ? String(c.pointValue) : String(c.pointValue);
  return `${c.symbol} · ${FUTURES_SHORT[c.symbol] || c.name} · $${pv}/pt`;
}

/**
 * Instrument picker rows for a futures journal: a Futures section, then
 * CFD / Forex. Header rows have `header` and are not selectable.
 * Labels are short English, marked ltr so they stay one line in the RTL menu.
 */
export function instrumentMenuOptions() {
  const row = (c) => ({ value: c.symbol, label: instrumentMenuLabel(c), dir: 'ltr' });
  return [
    { header: 'חוזים עתידיים' },
    ...FUTURES_CONTRACTS.map(row),
    { header: 'CFD / פורקס' },
    ...CFD_INSTRUMENTS.map(row),
  ];
}

export const STRATEGIES = [
  'Wyckoff',
  'Order Block',
  'AMD',
];

export const TRIGGERS = [
  'Spring',
  'LPSY',
  'SOS',
  'Upthrust',
  'BU/LPS',
];

export const TIMEFRAMES = ['15m', '30m', '1H', '4H'];

export const DIRECTIONS = ['long', 'short'];

export const MARKET_TYPES = ['futures', 'spot'];

export const EMOTIONS_BEFORE = ['confident', 'fearful', 'greedy', 'neutral', 'fomo', 'revenge'];

export const EMOTIONS_AFTER = ['satisfied', 'frustrated', 'regret', 'neutral'];

export const MISTAKES = ['early_exit', 'moved_sl', 'oversized', 'no_plan', 'fomo_entry', 'revenge_trade'];

export const TRADE_TAGS = ['fomo', 'revenge', 'scalp', 'news', 'breakout', 'counter_trend', 'planned', 'impulse'];

export const TAG_LABELS = {
  fomo: 'FOMO',
  revenge: 'Revenge',
  scalp: 'סקאלפ',
  news: 'אחרי חדשות',
  breakout: 'פריצה',
  counter_trend: 'נגד הטרנד',
  planned: 'מתוכננת',
  impulse: 'אימפולסיבית',
};

export const SESSIONS = ['London', 'New York', 'Asia', 'London/NY Overlap'];

export const SESSION_COLORS = {
  London: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', hex: '#3b82f6' },
  'New York': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', hex: '#a855f7' },
  Asia: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', hex: '#eab308' },
  'London/NY Overlap': { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', hex: '#f97316' },
};

export function getSessionClasses(session) {
  const c = SESSION_COLORS[session];
  if (!c) return 'bg-bg-tertiary text-text-muted border border-border-primary';
  return `${c.bg} ${c.text} border ${c.border}`;
}

export const DCA_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'];

export const TRADE_RESULTS = ['win', 'loss', 'breakeven'];

export const TRADE_STATUSES = ['open', 'closed'];

// ---- Plans / Premium -------------------------------------------------------
// Fallback leverage used wherever a trade's leverage is missing/unknown — manual
// entry, CSV import, and exchange sync all share this so the same position never
// yields a different ROE% depending on how it was entered. 1x = no inflation;
// exchange APIs return the real leverage anyway, so this rarely applies.
export const DEFAULT_LEVERAGE = 1;

// Soft limits for the free tier. Premium removes them. Enforced client-side as
// a freemium gate (server-authoritative billing comes with the checkout phase).
export const FREE_LIMITS = {
  journals: 2,
  wallets: 2,
  exchanges: 1,
  aiPerDay: 20,
  // Premium-only: daily chart-image analyses (mirrors the worker's
  // AI_IMAGE_DAILY_LIMIT). Free users get none.
  aiImagesPremium: 10,
  // Prop-firm cash book. Free keeps the list and the monthly net.
  // The chart, the copyable report, and a longer list are Premium.
  businessEntries: 15,
  // Trader notebook. Free keeps the list and text search.
  // A longer list and the tag filter are Premium.
  notebookEntries: 20,
};

// Premium pricing is billed in ILS. The journal stays in USD on purpose:
// the charge is shekels, the trades are dollars. Do not convert one into the other.
export const PREMIUM_PRICING = {
  monthly: { id: 'monthly', price: 29, label: 'חודשי', per: 'חודש', note: '' },
  yearly: { id: 'yearly', price: 290, label: 'שנתי', per: 'שנה', note: 'חודשיים חינם' },
};

// Marketing copy for the upgrade page (free vs premium comparison).
export const PREMIUM_FEATURES = [
  { icon: 'Sparkles', title: 'תשובות AI מהירות', free: 'בסיסי', premium: 'מהיר ועדיף' },
  // Premium AI chat is soft-capped at 200/day (mirrors the worker's
  // AI_PREMIUM_LIMITS.day) — NOT truly unlimited, so say the real number.
  { icon: 'Bot', title: 'TradeAI', free: `${FREE_LIMITS.aiPerDay} ליום`, premium: '200 ליום' },
  { icon: 'Image', title: 'ניתוח גרפים מתמונה', free: '—', premium: `${FREE_LIMITS.aiImagesPremium} ליום` },
  { icon: 'Layers', title: 'מסחר בכמה שווקים', free: 'סוג אחד', premium: 'הכל' },
  { icon: 'BookOpen', title: 'יומני מסחר', free: `עד ${FREE_LIMITS.journals}`, premium: 'ללא הגבלה' },
  { icon: 'Wallet', title: "ארנקים על הבלוקצ'יין", free: `עד ${FREE_LIMITS.wallets}`, premium: 'ללא הגבלה' },
  { icon: 'Link2', title: 'חיבורי בורסה', free: `עד ${FREE_LIMITS.exchanges}`, premium: 'ללא הגבלה' },
  { icon: 'Bell', title: 'התראות עסקאות', free: 'בסיסי', premium: 'מתקדם' },
  { icon: 'BarChart3', title: 'אנליטיקה מתקדמת', free: '—', premium: 'כלול' },
  { icon: 'Briefcase', title: 'הכנסות והוצאות', free: `עד ${FREE_LIMITS.businessEntries}`, premium: 'ללא הגבלה' },
  { icon: 'NotebookPen', title: 'מחברת', free: `עד ${FREE_LIMITS.notebookEntries}`, premium: 'ללא הגבלה' },
  // Premium-gated page that was missing from the table entirely, so the one
  // feature nobody else has was also the one nobody was told about.
  { icon: 'Trophy', title: 'Polymarket — מכ"ם כסף חכם', free: '—', premium: 'כלול' },
];

export const EXCHANGES = [
  // בורסות
  { value: 'binance', label: 'Binance', domain: 'binance.com', type: 'exchange' },
  { value: 'bybit', label: 'Bybit', domain: 'bybit.com', type: 'exchange' },
  { value: 'mexc', label: 'MEXC', domain: 'mexc.com', type: 'exchange' },
  { value: 'okx', label: 'OKX', domain: 'okx.com', type: 'exchange' },
  { value: 'bitget', label: 'Bitget', domain: 'bitget.com', type: 'exchange' },
  { value: 'kucoin', label: 'KuCoin', domain: 'kucoin.com', type: 'exchange' },
  { value: 'gateio', label: 'Gate.io', domain: 'gate.io', type: 'exchange' },
  { value: 'htx', label: 'HTX', domain: 'htx.com', type: 'exchange' },
  { value: 'coinbase', label: 'Coinbase', domain: 'coinbase.com', type: 'exchange' },
  { value: 'kraken', label: 'Kraken', domain: 'kraken.com', type: 'exchange' },
  { value: 'bingx', label: 'BingX', domain: 'bingx.com', type: 'exchange' },
  { value: 'phemex', label: 'Phemex', domain: 'phemex.com', type: 'exchange' },
  { value: 'deribit', label: 'Deribit', domain: 'deribit.com', type: 'exchange' },
  { value: 'hyperliquid', label: 'Hyperliquid', domain: 'hyperliquid.xyz', type: 'exchange' },
  // ברוקרים — one shared list for every journal asset class (crypto and
  // non-crypto). Vantage is a CFD/forex/gold broker, so it stays in this
  // list rather than the crypto exchange group.
  { value: 'vantage', label: 'Vantage', domain: 'vantagemarkets.com', type: 'broker' },
  { value: 'icmarkets', label: 'IC Markets', domain: 'icmarkets.com', type: 'broker' },
  { value: 'pepperstone', label: 'Pepperstone', domain: 'pepperstone.com', type: 'broker' },
  { value: 'exness', label: 'Exness', domain: 'exness.com', type: 'broker' },
  { value: 'xm', label: 'XM', domain: 'xm.com', type: 'broker' },
  { value: 'etoro', label: 'eToro', domain: 'etoro.com', type: 'broker' },
  { value: 'plus500', label: 'Plus500', domain: 'plus500.com', type: 'broker' },
  { value: 'avatrade', label: 'AvaTrade', domain: 'avatrade.com', type: 'broker' },
  { value: 'oanda', label: 'OANDA', domain: 'oanda.com', type: 'broker' },
  { value: 'ig', label: 'IG', domain: 'ig.com', type: 'broker' },
  { value: 'xtb', label: 'XTB', domain: 'xtb.com', type: 'broker' },
  { value: 'fxcm', label: 'FXCM', domain: 'fxcm.com', type: 'broker' },
  { value: 'capitalcom', label: 'Capital.com', domain: 'capital.com', type: 'broker' },
  { value: 'interactivebrokers', label: 'Interactive Brokers', domain: 'interactivebrokers.com', type: 'broker' },
  { value: 'saxo', label: 'Saxo Bank', domain: 'saxobank.com', type: 'broker' },
  { value: 'fpmarkets', label: 'FP Markets', domain: 'fpmarkets.com', type: 'broker' },
  { value: 'tickmill', label: 'Tickmill', domain: 'tickmill.com', type: 'broker' },
  { value: 'admirals', label: 'Admirals', domain: 'admiralmarkets.com', type: 'broker' },
  { value: 'thinkmarkets', label: 'ThinkMarkets', domain: 'thinkmarkets.com', type: 'broker' },
  { value: 'hfm', label: 'HFM', domain: 'hfm.com', type: 'broker' },
  { value: 'fxtm', label: 'FXTM', domain: 'fxtm.com', type: 'broker' },
  { value: 'eightcap', label: 'Eightcap', domain: 'eightcap.com', type: 'broker' },
  { value: 'roboforex', label: 'RoboForex', domain: 'roboforex.com', type: 'broker' },
  { value: 'fbs', label: 'FBS', domain: 'fbs.com', type: 'broker' },
  { value: 'swissquote', label: 'Swissquote', domain: 'swissquote.com', type: 'broker' },
  { value: 'cmcmarkets', label: 'CMC Markets', domain: 'cmcmarkets.com', type: 'broker' },
  { value: 'tradestation', label: 'TradeStation', domain: 'tradestation.com', type: 'broker' },
  { value: 'tdameritrade', label: 'TD Ameritrade', domain: 'tdameritrade.com', type: 'broker' },
  { value: 'charles_schwab', label: 'Charles Schwab', domain: 'schwab.com', type: 'broker' },
  // תיקים ממומנים
  { value: 'apex', label: 'Apex Trader Funding', domain: 'apextraderfunding.com', type: 'prop' },
  { value: 'cryptofundtrader', label: 'Crypto Fund Trader', domain: 'cryptofundtrader.com', type: 'prop' },
  { value: 'propxp', label: 'PropXP', domain: 'propxp.com', type: 'prop' },
  { value: 'ftmo', label: 'FTMO', domain: 'ftmo.com', type: 'prop' },
  { value: 'fundednext', label: 'FundedNext', domain: 'fundednext.com', type: 'prop' },
  { value: 'thefundedtrader', label: 'The Funded Trader', domain: 'thefundedtrader.com', type: 'prop' },
  { value: 'topstep', label: 'Topstep', domain: 'topstep.com', type: 'prop' },
  { value: 'bulenox', label: 'Bulenox', domain: 'bulenox.com', type: 'prop' },
  { value: 'myfundedfx', label: 'MyFundedFX', domain: 'myfundedfx.com', type: 'prop' },
  { value: 'breakoutprop', label: 'Breakout Prop', domain: 'breakoutprop.com', type: 'prop' },
];

// Display name of a known exchange, or null for 'other' / unset / unknown —
// so callers never print the raw value ("אין כרגע שווי חי מ-other").
export const exchangeLabel = (value) => EXCHANGES.find((e) => e.value === value)?.label || null;

// Transparent brand marks, not the 16px Google favicon (Bybit's favicon reads
// as generic bars) and not a JPEG plate. Default files are the dark-UI
// versions. OKX, Bybit, MEXC, Phemex, and Vantage also have a light-theme file.
const LOCAL_EXCHANGE_LOGOS = {
  binance: '/logos/exchanges/binance.svg',
  bybit: '/logos/exchanges/bybit.png',
  mexc: '/logos/exchanges/mexc.svg',
  okx: '/logos/exchanges/okx.svg',
  bitget: '/logos/exchanges/bitget.png',
  kucoin: '/logos/exchanges/kucoin.png',
  gateio: '/logos/exchanges/gate.png',
  htx: '/logos/exchanges/htx.png',
  coinbase: '/logos/exchanges/coinbase.png',
  kraken: '/logos/exchanges/kraken.png',
  bingx: '/logos/exchanges/bingx.png',
  phemex: '/logos/exchanges/phemex.svg',
  deribit: '/logos/exchanges/deribit.svg',
  hyperliquid: '/logos/exchanges/hyperliquid.png',
  // Symbol from the official Vantage header logo. Teal is lifted to white
  // so the mark reads on the black UI; orange stays #e35728.
  vantage: '/logos/exchanges/vantage.svg',
};

const LOCAL_EXCHANGE_LOGOS_ON_LIGHT = {
  okx: '/logos/exchanges/okx-on-light.svg',
  bybit: '/logos/exchanges/bybit-on-light.png',
  mexc: '/logos/exchanges/mexc-on-light.svg',
  phemex: '/logos/exchanges/phemex-on-light.svg',
  // Official two-color mark (teal #034854 + orange #e35728).
  vantage: '/logos/exchanges/vantage-on-light.svg',
};

// Sentinels for "no venue". These must never resolve to a local exchange file
// or a guessed favicon — including Hebrew "אחר" and the default journal id.
const UNSET_EXCHANGE_IDS = new Set([
  'other', 'none', 'unknown', 'unset', 'n/a', 'na', 'null', 'undefined',
  'אחר', 'אחרת', 'ללא',
]);

// "other" / blank / Hebrew "אחר" are not venues. The journal used to be
// created with exchange:'other', and the dashboard then said there was no
// live value from an exchange the user never picked.
export function isUnsetExchange(value) {
  if (value == null) return true;
  const id = String(value).trim().toLowerCase().replace(/\s+/g, '');
  return !id || UNSET_EXCHANGE_IDS.has(id);
}

export function getExchangeLogo(exchangeValue, options) {
  if (exchangeValue == null) return null;
  const id = String(exchangeValue).trim().toLowerCase().replace(/\s+/g, '');
  if (!id || UNSET_EXCHANGE_IDS.has(id)) return null;
  // Exact id only. A blank, "other", or partial name must never fall through
  // to another venue's file (no default Bybit / MEXC / Binance).
  const onLight = options?.theme === 'light';
  if (onLight && Object.prototype.hasOwnProperty.call(LOCAL_EXCHANGE_LOGOS_ON_LIGHT, id)) {
    return LOCAL_EXCHANGE_LOGOS_ON_LIGHT[id];
  }
  if (Object.prototype.hasOwnProperty.call(LOCAL_EXCHANGE_LOGOS, id)) {
    return LOCAL_EXCHANGE_LOGOS[id];
  }
  const ex = EXCHANGES.find((e) => e.value === id);
  if (ex?.domain) return `https://www.google.com/s2/favicons?domain=${ex.domain}&sz=64`;
  // A custom broker name can still try its own domain. Never invent one for
  // the unset sentinels, and never point it at a bundled exchange mark.
  const guess = `${id}.com`;
  if (UNSET_EXCHANGE_IDS.has(guess.replace(/\.com$/, '')) || guess === 'other.com') return null;
  return `https://www.google.com/s2/favicons?domain=${guess}&sz=64`;
}

export const TIME_PERIODS = [
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
  { key: 'year', label: 'שנה' },
  { key: 'all', label: 'הכל' },
];

export const DCA_FREQUENCY_LABELS = {
  daily: 'יומי',
  weekly: 'שבועי',
  biweekly: 'דו-שבועי',
  monthly: 'חודשי',
};

export const DCA_STATUS_LABELS = {
  active: 'פעיל',
  paused: 'מושהה',
  completed: 'הושלם',
};

export const EMOTION_LABELS = {
  confident: 'בטוח',
  fearful: 'חרד',
  greedy: 'חמדן',
  neutral: 'ניטרלי',
  fomo: 'פומו (FOMO)',
  revenge: 'נקמה',
  satisfied: 'מרוצה',
  frustrated: 'מתוסכל',
  regret: 'חרטה',
};

export const MISTAKE_LABELS = {
  early_exit: 'יציאה מוקדמת',
  moved_sl: 'הזזת סטופ לוס',
  oversized: 'פוזיציה גדולה מדי',
  no_plan: 'ללא תוכנית',
  fomo_entry: 'כניסה מפומו',
  revenge_trade: 'עסקת נקמה',
};

// === Sectors for pair selection ===

export const SECTORS = [
  {
    key: 'bitcoin',
    label: 'Bitcoin',
    icon: 'Bitcoin',
    coins: ['BTCUSDT'],
  },
  {
    key: 'alts',
    label: 'Alts',
    icon: 'Layers',
    coins: ['ETHUSDT', 'SOLUSDT', 'AVAXUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT'],
  },
  {
    key: 'meme',
    label: 'Meme',
    icon: 'Dog',
    coins: ['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'WIFUSDT', 'FLOKIUSDT', 'BONKUSDT'],
  },
  {
    key: 'defi',
    label: 'DeFi',
    icon: 'Landmark',
    coins: ['AAVEUSDT', 'UNIUSDT', 'LINKUSDT', 'MKRUSDT'],
  },
];

// === Mentality Zone ===

export const MENTALITY_EMOTIONS = [
  { key: 'inspired', emoji: '✨', label: 'בהשראה' },
  { key: 'grateful', emoji: '🙏', label: 'אסיר תודה' },
  { key: 'excited', emoji: '🔥', label: 'נרגש/ת' },
  { key: 'calm', emoji: '😌', label: 'רגוע/ה' },
  { key: 'happy', emoji: '😊', label: 'שמח/ה' },
  { key: 'apathy', emoji: '😐', label: 'חוסר אכפתיות' },
  { key: 'bored', emoji: '😴', label: 'שעמום' },
  { key: 'tired', emoji: '😫', label: 'עייפות' },
  { key: 'anxious', emoji: '😰', label: 'חרדה' },
  { key: 'frustrated', emoji: '😤', label: 'תסכול' },
];

export const PRE_MARKET_CHECKLIST = [
  { key: 'news', label: 'בדיקת חדשות כלכליות' },
  { key: 'charts', label: 'סקירת גרפים וניתוח' },
  { key: 'meditation', label: 'מדיטציה / נשימות' },
  { key: 'exercise', label: 'ספורט / תנועה' },
  { key: 'review', label: 'בדיקת יומן אתמול' },
  { key: 'planning', label: 'תכנון עסקאות' },
];

export const MOTIVATIONAL_QUOTES = [
  'התוכנית היא לא כלום, התכנון הוא הכל.',
  'הסוחר המצליח הוא זה שיודע לשלוט ברגשות שלו.',
  'סבלנות היא לא היכולת לחכות, אלא היכולת לשמור על גישה חיובית בזמן ההמתנה.',
  'הסיכון מגיע מחוסר ידיעה של מה שאתה עושה.',
  'אל תחפש את העסקה המושלמת. חפש את העסקה שעוקבת אחרי התוכנית.',
  'ההפסדים הם שכר לימוד. הרווחים הם התעודה.',
  'עקביות מנצחת מוטיבציה. כל יום.',
  'הגדר את הסיכון לפני שאתה נכנס לעסקה - תמיד.',
  'המסחר הטוב ביותר הוא לפעמים זה שלא נכנסת אליו.',
  'שלוט בפחד ובחמדנות - וכבר ניצחת את רוב הסוחרים.',
  'תהליך > תוצאה. תמיד.',
  'הפסד קטן הוא ניצחון גדול.',
  'אל תיסחר מנקמה. השוק לא חייב לך כלום.',
  'יומן מסחר הוא המורה הכי טוב שלך.',
  'הצלחה במסחר = ניהול סיכונים + סבלנות + עקביות.',
];

// ── Prop-firm challenge presets ─────────────────────────────────────────────
// Rule shapes (evaluated by utils/propFirm.js):
//   profitTarget    { value, unit: 'pct' | 'usd' } — null = no target (funded)
//   maxDailyLoss    { value, unit, basis: 'initial' | 'start_of_day' } — null = none.
//                   'initial' → % of the account size; 'start_of_day' → % of the
//                   day's opening balance. Either way the day's loss is measured
//                   from the day's opening balance.
//   maxDrawdown     { value, unit, type: 'static' | 'trailing_eod' | 'trailing_intraday',
//                     lockOffset: null | $ } — a trailing floor stops rising once it
//                   reaches accountSize + lockOffset (Topstep: 0, Apex: 100).
//   minTradingDays  number (0 = none)
//   consistencyPct  max share (%) of total profit one day may hold (null = none)
// Rule precedence when building a journal's rules: rules → sizeRules[size] →
// phase.rules (object rules merge field-by-field; null removes the rule).
// `verified: false` marks values we could not pin down with certainty — the UI
// shows "ערכי ברירת מחדל — בדקו מול תנאי החברה". Firms change their terms
// often, so every value stays editable in the journal settings.
export const PROP_FIRM_PRESETS = [
  {
    id: 'ftmo',
    name: 'FTMO',
    market: 'פורקס / CFD',
    verified: true,
    sizes: [10000, 25000, 50000, 100000, 200000],
    defaultSize: 100000,
    rules: {
      profitTarget: { value: 10, unit: 'pct' },
      maxDailyLoss: { value: 5, unit: 'pct', basis: 'initial' },
      maxDrawdown: { value: 10, unit: 'pct', type: 'static', lockOffset: null },
      minTradingDays: 4,
      consistencyPct: null,
    },
    phases: [
      { id: 'phase1', label: 'שלב 1 · Challenge', rules: { profitTarget: { value: 10, unit: 'pct' } } },
      { id: 'phase2', label: 'שלב 2 · Verification', rules: { profitTarget: { value: 5, unit: 'pct' } } },
    ],
  },
  {
    id: 'ftmo_funded',
    name: 'FTMO Funded',
    market: 'פורקס / CFD',
    verified: true,
    sizes: [10000, 25000, 50000, 100000, 200000],
    defaultSize: 100000,
    rules: {
      profitTarget: null,
      maxDailyLoss: { value: 5, unit: 'pct', basis: 'initial' },
      maxDrawdown: { value: 10, unit: 'pct', type: 'static', lockOffset: null },
      minTradingDays: 0,
      consistencyPct: null,
    },
    phases: [{ id: 'funded', label: 'חשבון ממומן', rules: {} }],
  },
  {
    id: 'the5ers',
    name: 'The5ers',
    market: 'פורקס / CFD',
    verified: false,
    sizes: [5000, 10000, 20000, 60000, 100000],
    defaultSize: 100000,
    rules: {
      profitTarget: { value: 8, unit: 'pct' },
      maxDailyLoss: { value: 5, unit: 'pct', basis: 'start_of_day' },
      maxDrawdown: { value: 10, unit: 'pct', type: 'static', lockOffset: null },
      minTradingDays: 3,
      consistencyPct: null,
    },
    phases: [
      { id: 'phase1', label: 'High Stakes · שלב 1', rules: { profitTarget: { value: 8, unit: 'pct' } } },
      { id: 'phase2', label: 'High Stakes · שלב 2', rules: { profitTarget: { value: 5, unit: 'pct' } } },
      { id: 'funded', label: 'חשבון ממומן', rules: { profitTarget: null, minTradingDays: 0 } },
    ],
  },
  {
    id: 'apex',
    name: 'Apex Trader Funding',
    market: 'חוזים עתידיים',
    verified: false,
    sizes: [25000, 50000, 100000, 150000],
    defaultSize: 50000,
    rules: {
      profitTarget: { value: 3000, unit: 'usd' },
      maxDailyLoss: null,
      maxDrawdown: { value: 2500, unit: 'usd', type: 'trailing_intraday', lockOffset: 100 },
      minTradingDays: 1,
      consistencyPct: 30,
    },
    // $-denominated rules scale with the account size.
    sizeRules: {
      25000: { profitTarget: { value: 1500, unit: 'usd' }, maxDrawdown: { value: 1500 } },
      50000: { profitTarget: { value: 3000, unit: 'usd' }, maxDrawdown: { value: 2500 } },
      100000: { profitTarget: { value: 6000, unit: 'usd' }, maxDrawdown: { value: 3000 } },
      150000: { profitTarget: { value: 9000, unit: 'usd' }, maxDrawdown: { value: 5000 } },
    },
    phases: [
      { id: 'eval', label: 'הערכה · Intraday', rules: {} },
      { id: 'eval_eod', label: 'הערכה · EOD', rules: { maxDrawdown: { type: 'trailing_eod' } } },
      { id: 'funded', label: 'PA · חשבון ממומן', rules: { profitTarget: null } },
    ],
  },
  {
    id: 'topstep',
    name: 'Topstep',
    market: 'חוזים עתידיים',
    verified: false,
    sizes: [50000, 100000, 150000],
    defaultSize: 50000,
    rules: {
      profitTarget: { value: 3000, unit: 'usd' },
      maxDailyLoss: { value: 1000, unit: 'usd', basis: 'start_of_day' },
      maxDrawdown: { value: 2000, unit: 'usd', type: 'trailing_eod', lockOffset: 0 },
      minTradingDays: 2,
      consistencyPct: 50,
    },
    sizeRules: {
      50000: { profitTarget: { value: 3000, unit: 'usd' }, maxDailyLoss: { value: 1000 }, maxDrawdown: { value: 2000 } },
      100000: { profitTarget: { value: 6000, unit: 'usd' }, maxDailyLoss: { value: 2000 }, maxDrawdown: { value: 3000 } },
      150000: { profitTarget: { value: 9000, unit: 'usd' }, maxDailyLoss: { value: 3000 }, maxDrawdown: { value: 4500 } },
    },
    phases: [
      { id: 'combine', label: 'Trading Combine', rules: {} },
      { id: 'funded', label: 'Express Funded', rules: { profitTarget: null, minTradingDays: 0, consistencyPct: null } },
    ],
  },
  {
    id: 'cft',
    name: 'Crypto Fund Trader',
    market: 'קריפטו',
    verified: false,
    sizes: [10000, 25000, 50000, 100000, 200000],
    defaultSize: 100000,
    rules: {
      profitTarget: { value: 8, unit: 'pct' },
      maxDailyLoss: { value: 5, unit: 'pct', basis: 'start_of_day' },
      maxDrawdown: { value: 10, unit: 'pct', type: 'static', lockOffset: null },
      minTradingDays: 0,
      consistencyPct: null,
    },
    phases: [
      { id: 'phase1', label: 'שלב 1', rules: { profitTarget: { value: 8, unit: 'pct' } } },
      { id: 'phase2', label: 'שלב 2', rules: { profitTarget: { value: 5, unit: 'pct' } } },
      { id: 'funded', label: 'חשבון ממומן', rules: { profitTarget: null } },
    ],
  },
  {
    id: 'breakout',
    name: 'Breakout',
    market: 'קריפטו',
    verified: false,
    sizes: [5000, 10000, 25000, 50000, 100000],
    defaultSize: 25000,
    rules: {
      profitTarget: { value: 10, unit: 'pct' },
      maxDailyLoss: { value: 4, unit: 'pct', basis: 'start_of_day' },
      maxDrawdown: { value: 6, unit: 'pct', type: 'static', lockOffset: null },
      minTradingDays: 0,
      consistencyPct: null,
    },
    phases: [
      { id: 'one_step', label: 'שלב אחד', rules: {} },
      { id: 'funded', label: 'חשבון ממומן', rules: { profitTarget: null } },
    ],
  },
  {
    id: 'custom',
    name: 'מותאם אישית',
    market: '',
    verified: true,
    sizes: [10000, 25000, 50000, 100000, 200000],
    defaultSize: 100000,
    rules: {
      profitTarget: { value: 10, unit: 'pct' },
      maxDailyLoss: { value: 5, unit: 'pct', basis: 'initial' },
      maxDrawdown: { value: 10, unit: 'pct', type: 'static', lockOffset: null },
      minTradingDays: 0,
      consistencyPct: null,
    },
    phases: [{ id: 'custom', label: 'אתגר', rules: {} }],
  },
];

export const PROP_FIRM_DD_TYPE_LABELS = {
  static: 'סטטי',
  trailing_eod: 'נגרר · סוף יום',
  trailing_intraday: 'נגרר · תוך יומי',
};
