import {
  LayoutDashboard, BookOpen, NotebookPen, Brain, FlaskConical,
  Coins, Wallet, ClipboardList, Activity, Bot, Newspaper, Crown, User,
  Briefcase, Trophy, Fish, LineChart, Receipt, CandlestickChart, Landmark,
} from 'lucide-react';

// All navigable pages — shown as the default list, and matched by label/keywords.
const PAGES = [
  { label: 'דשבורד', path: '/', icon: LayoutDashboard, kw: 'בית home dashboard ראשי' },
  { label: 'יומן מסחר', path: '/journal', icon: BookOpen, kw: 'עסקאות trades journal שדות שדות מותאמים שדות נוספים לעסקה שדה משלך custom fields' },
  { label: 'מחברת', path: '/notebook', icon: NotebookPen, kw: 'מחברת הערות לקח רעיון שבוע notebook notes' },
  { label: 'בורסה', path: '/journal?tab=exchange', icon: CandlestickChart, kw: 'terminal טרמינל עמדת מסחר trading desk פוזיציות פקודות פתוחות positions orders בורסה live exchange חיבור api מפתח בורסות' },
  { label: 'האזור המנטלי', path: '/mentality', icon: Brain, kw: 'מנטל פסיכולוגיה mentality mindset' },
  { label: 'בקטסט', path: '/backtest', icon: FlaskConical, kw: 'backtest' },
  { label: 'החזקות', path: '/portfolio', icon: Briefcase, kw: 'portfolio תיק החזקות השקעות holdings' },
  { label: 'מעקב DCA', path: '/portfolio?tab=dca', icon: Coins, kw: 'dca תיק החזקות' },
  { label: 'ארנקים', path: '/portfolio?tab=wallets', icon: Wallet, kw: 'wallets ארנק יתרה תיק החזקות' },
  { label: 'דוח מס', path: '/tax', icon: Receipt, kw: 'tax מס רווחי הון רואה חשבון דוח שנתי שקלים' },
  { label: 'תוכניות מסחר', path: '/plans', icon: ClipboardList, kw: 'plans תוכנית' },
  { label: 'הכנסות והוצאות', path: '/business', icon: Landmark, kw: 'הכנסות הוצאות ניהול עסק פרופ אתגר דמי איפוס מנוי תשלום משיכה ledger business' },
  { label: 'סקירת שוק', path: '/market', icon: Activity, kw: 'market שוק' },
  { label: 'ניתוח מטבע', path: '/market?tab=analysis', icon: LineChart, kw: 'analysis ניתוח מטבע שוק' },
  { label: 'מעקב לווייתנים', path: '/market?tab=whales', icon: Fish, kw: 'whales לווייתנים שוק' },
  { label: 'Polymarket', path: '/market?tab=polymarket', icon: Trophy, kw: 'polymarket פולימרקט הימורים שוק' },
  { label: 'TradeAI', path: '/trade-ai', icon: Bot, kw: 'ai בינה מלאכותית' },
  { label: 'חדשות', path: '/news', icon: Newspaper, kw: 'news' },
  { label: 'שדרוג Premium', path: '/premium', icon: Crown, kw: 'premium פרימיום שדרוג' },
  { label: 'פרופיל', path: '/profile', icon: User, kw: 'profile הגדרות settings חשבון' },
];

// Pages whose label or keywords contain the query. Empty query is every page.
export function globalSearchPages(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return PAGES;
  return PAGES.filter((page) => `${page.label} ${page.kw}`.toLowerCase().includes(q));
}

export function globalSearchPagePaths(query) {
  return globalSearchPages(query).map((page) => page.path);
}
