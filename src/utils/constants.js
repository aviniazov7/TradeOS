// App version — bumped on each release. Shown in the sidebar so it's
// easy to confirm which version a device is actually running.
export const APP_VERSION = '1.0.190';

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

// ─── CME Futures Contracts (epic #32) ─────────────────────────────
// pointValue is the dollar value of ONE full index/price point per contract —
// it drives dollar P&L: (exit − entry) × pointValue × contracts. tickSize is
// the minimum price increment (one tick = tickSize × pointValue dollars).
// Source: CME contract specs. Keep in sync with docs/specs/futures-contracts.md.
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

/** Contract spec lookup by symbol (case-insensitive). Returns null when unknown. */
export function getContractSpec(symbol) {
  if (!symbol) return null;
  const s = String(symbol).toUpperCase();
  return FUTURES_CONTRACTS.find((c) => c.symbol === s) || null;
}

export const STRATEGIES = [
  'Wyckoff',
  'Order Block',
  'AMD',
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
// Soft limits for the free tier. Premium removes them. Enforced client-side as
// a freemium gate (server-authoritative billing comes with the checkout phase).
export const FREE_LIMITS = {
  journals: 2,
  wallets: 2,
  exchanges: 1,
  aiPerDay: 20,
};

// Premium pricing (ILS). Yearly gives ~2 months free — tweak freely.
export const PREMIUM_PRICING = {
  monthly: { id: 'monthly', price: 29, label: 'חודשי', per: 'חודש', note: '' },
  yearly: { id: 'yearly', price: 290, label: 'שנתי', per: 'שנה', note: 'חודשיים חינם' },
};

// Marketing copy for the upgrade page (free vs premium comparison).
export const PREMIUM_FEATURES = [
  { icon: 'Sparkles', title: 'תשובות AI מהירות', free: 'בסיסי', premium: 'מהיר ועדיף' },
  { icon: 'Bot', title: 'TradeAI ללא הגבלה', free: `${FREE_LIMITS.aiPerDay} ליום`, premium: 'ללא הגבלה' },
  { icon: 'BookOpen', title: 'יומני מסחר', free: `עד ${FREE_LIMITS.journals}`, premium: 'ללא הגבלה' },
  { icon: 'Wallet', title: 'ארנקים על-שרשרת', free: `עד ${FREE_LIMITS.wallets}`, premium: 'ללא הגבלה' },
  { icon: 'Link2', title: 'חיבורי בורסה', free: `עד ${FREE_LIMITS.exchanges}`, premium: 'ללא הגבלה' },
  { icon: 'Bell', title: 'התראות עסקאות', free: 'בסיסי', premium: 'מתקדם' },
  { icon: 'BarChart3', title: 'ניתוחים מתקדמים', free: '—', premium: 'כלול' },
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
  // ברוקרים
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

export function getExchangeLogo(exchangeValue) {
  if (!exchangeValue) return null;
  const ex = EXCHANGES.find((e) => e.value === exchangeValue);
  if (ex?.domain) return `https://www.google.com/s2/favicons?domain=${ex.domain}&sz=32`;
  // Custom exchange — guess domain
  const guess = exchangeValue.toLowerCase().replace(/\s/g, '') + '.com';
  return `https://www.google.com/s2/favicons?domain=${guess}&sz=32`;
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

export const JOURNEY_STAGES = [
  {
    id: 'beginning',
    title: 'התחלה',
    duration: '2-3 שבועות',
    description: 'כאן מתחיל המסע שלך בעולם המסחר. למד מושגי יסוד, מונחים מקצועיים ותבנה את הבסיס.',
    challenges: ['עומס מידע', 'התלהבות ללא כיוון'],
    tips: ['למד את הבסיס לפני שאתה סוחר', 'התחל עם חשבון דמו', 'בנה את יסודות הידע בצורה מתודית'],
  },
  {
    id: 'beginners_luck',
    title: 'מזל המתחילים',
    duration: '1-2 שבועות',
    description: 'תקופה שבה הכל נראה קל. רווחים מגיעים והביטחון עולה - אבל זה לא מבוסס על אסטרטגיה.',
    challenges: ['ביטחון יתר', 'הגדלת פוזיציות מהר מדי'],
    tips: ['אל תבלבל בין מזל למיומנות', 'שמור על גודל פוזיציה קבוע', 'תעד כל עסקה ביומן'],
  },
  {
    id: 'losses',
    title: 'הפסדים',
    duration: '2-4 שבועות',
    description: 'השלב הקשה ביותר. ההפסדים מתחילים להיערם, הביטחון נשחק והספקות מתחילים.',
    challenges: ['הפסדים רצופים', 'ספקות עצמיים', 'עסקאות נקמה'],
    tips: ['זה חלק טבעי מהתהליך', 'הקטן את גודל הפוזיציות', 'התמקד בלמידה, לא ברווח'],
  },
  {
    id: 'risk_management',
    title: 'ניהול סיכונים',
    duration: '3-4 שבועות',
    description: 'הבנה שניהול סיכונים הוא המפתח. לומד לשים SL, להגביל הפסדים ולשמור על ההון.',
    challenges: ['קושי לקבל הפסדים קטנים', 'הזזת SL'],
    tips: ['הגדר סיכון מקסימלי לעסקה (1-2%)', 'לעולם אל תזיז את ה-SL בכיוון ההפסד', 'R:R מינימלי של 1:2'],
  },
  {
    id: 'trading_plan',
    title: 'תכנית מסחר',
    duration: '2-3 שבועות',
    description: 'בניית תכנית מסחר מסודרת עם כללי כניסה ויציאה ברורים.',
    challenges: ['קושי לעקוב אחרי התכנית', 'פיתוי לסטות'],
    tips: ['כתוב תכנית מסחר מפורטת', 'בדוק אותה על נתוני עבר (בקטסט)', 'עקוב אחריה ללא חריגות'],
  },
  {
    id: 'consistency',
    title: 'עקביות',
    duration: '4-8 שבועות',
    description: 'השלב שבו מתחילים לראות תוצאות עקביות. המסחר הופך משגרה לתהליך מובנה.',
    challenges: ['שגרה ושעמום', 'פיתוי להגדיל סיכון'],
    tips: ['שמור על השגרה גם כשמשעמם', 'אל תשנה את האסטרטגיה כל שבוע', 'סמוך על התהליך'],
  },
  {
    id: 'trading_psychology',
    title: 'פסיכולוגיית מסחר',
    duration: 'מתמשך',
    description: 'ההבנה שהמנטליות היא הגורם המכריע. שליטה ברגשות, ביטחון מבוסס ניסיון, וגמישות מחשבתית.',
    challenges: ['רגשות חוזרים', 'אירועי קיצון בשוק'],
    tips: ['המשך לכתוב ביומן מנטלי', 'זהה דפוסים רגשיים חוזרים', 'פתח שגרת פרה-מרקט'],
  },
];
