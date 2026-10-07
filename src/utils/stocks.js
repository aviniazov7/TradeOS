// Stocks support: the popular-ticker list for search, logo sources, and the
// US market session (pre / open / after-hours / closed) in New York time.

// Shown before the user types, and searched locally first (instant).
export const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'PLTR', name: 'Palantir' },
  { symbol: 'COIN', name: 'Coinbase' },
  { symbol: 'MSTR', name: 'MicroStrategy' },
  { symbol: 'AVGO', name: 'Broadcom' },
  { symbol: 'SMCI', name: 'Super Micro Computer' },
  { symbol: 'TEVA', name: 'Teva Pharmaceutical' },
  { symbol: 'CHKP', name: 'Check Point' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
  { symbol: 'QQQ', name: 'Nasdaq-100 ETF' },
];

// Tickers for the price ticker when the user trades stocks.
export const TICKER_STOCKS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'];

// A stock trade's symbol. Stock journals store the plain ticker (AAPL), but be
// tolerant of a crypto-style suffix on older/hand-typed rows.
export const stockSymbol = (pair) => String(pair || '').toUpperCase().replace(/USDT$/, '').trim();

// Logo sources, best first. Both serve free PNGs by ticker with no key; a 404
// moves to the next, and after the last the component draws a letter badge.
export function stockLogoUrls(symbol) {
  const s = stockSymbol(symbol);
  if (!s) return [];
  const base = s.replace(/\.[A-Z]+$/, ''); // TEVA.TA → TEVA for the US-listed logo
  return [
    `https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`,
    `https://assets.parqet.com/logos/symbol/${encodeURIComponent(s)}?format=png`,
    ...(base !== s ? [`https://financialmodelingprep.com/image-stock/${encodeURIComponent(base)}.png`] : []),
  ];
}

// US equities session in New York time. Holidays are not modelled — on a
// market holiday this says "open" until the quote feed's own state wins.
export function usMarketSession(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = get('weekday');
  const mins = (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10);
  if (day === 'Sat' || day === 'Sun') return 'CLOSED';
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return 'PRE';
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return 'REGULAR';
  if (mins >= 16 * 60 && mins < 20 * 60) return 'POST';
  return 'CLOSED';
}

export const SESSION_LABELS = {
  REGULAR: { label: 'השוק פתוח', tone: 'profit' },
  PRE: { label: 'טרום מסחר', tone: 'breakeven' },
  POST: { label: 'אחרי שעות המסחר', tone: 'breakeven' },
  CLOSED: { label: 'השוק סגור', tone: 'muted' },
};
