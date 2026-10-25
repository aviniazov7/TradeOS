// The four sections in the top bar. Everything else lives in the account menu.
// Exchange is a tab of the journal; it is a top-level destination because the
// connection screen is where people land after "חבר בורסה".
export const PRIMARY_TABS = [
  { id: 'home', to: '/', label: 'בית' },
  { id: 'journal', to: '/journal', label: 'יומן' },
  { id: 'news', to: '/news', label: 'חדשות' },
  { id: 'exchange', to: '/journal?tab=exchange', label: 'בורסה' },
];

const journalPath = (pathname) => pathname === '/journal'
  || pathname.startsWith('/journal/')
  || pathname === '/terminal'
  || pathname.startsWith('/terminal/');

export function primaryTabId(pathname, search = '') {
  const tab = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab');
  if (pathname === '/news' || pathname.startsWith('/news/')) return 'news';
  if (journalPath(pathname)) return tab === 'exchange' ? 'exchange' : 'journal';
  if (pathname === '/') return 'home';
  return null;
}

// Pages that used to live in the hamburger. The four tabs above are not repeated.
export const MORE_LINKS = [
  { to: '/market', label: 'שוק', match: ['/polymarket', '/whales'] },
  { to: '/portfolio', label: 'החזקות', match: ['/dca', '/wallets'] },
  { to: '/backtest', label: 'בקטסט' },
  { to: '/plans', label: 'תוכניות מסחר' },
  { to: '/mentality', label: 'האזור המנטלי' },
  { to: '/trade-ai', label: 'TradeAI' },
  { to: '/premium', label: 'שדרוג Premium' },
  { to: '/profile', label: 'פרופיל' },
];
