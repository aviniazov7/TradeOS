// Per-exchange connection config (display name, accent, API page, setup
// steps, canSync). Shared by the exchange settings page and the trades-tab
// proposal banner (ExchangeProposals) — kept in its own module so the banner
// doesn't pull the whole settings page into the journal chunk.

// How the connect dialog should collect credentials. Binance has no working
// trade sync, so it never shows an API-key form.
export function connectMode(exchange) {
  if (exchange?.authType === 'address') return 'address';
  if (exchange?.canSync === false) return 'csv';
  return 'keys';
}

// Shown above the key fields (and above the CSV action). Read-only and no IP
// restriction apply to every API key; MEXC's 90-day lifetime is called out
// on its own row.
export function connectionGuideNotes(exchange) {
  if (!exchange) return [];
  if (exchange.authType === 'address') {
    return ['הדבק כתובת ארנק ציבורית בלבד — לעולם לא מפתח פרטי או Seed.'];
  }
  if (exchange.canSync === false) {
    return [
      'Binance לא מסנכרן עסקאות דרך API.',
      'מייבאים קובץ CSV מהיסטוריית החוזים — בלי מפתח.',
    ];
  }
  const notes = [
    'צור מפתח Read-Only בלבד — בלי הרשאות מסחר או משיכה.',
    'בלי הגבלת IP. TradeOS מתחבר מכתובות משתנות.',
  ];
  if (exchange.keyLifetimeDays) {
    notes.push(`מפתח של ${exchange.name} בלי IP פג אחרי ${exchange.keyLifetimeDays} יום.`);
  }
  return notes;
}

/**
 * One sentence for marketing surfaces (login panel, onboarding). Positive
 * on both paths: auto-sync where it works, a file import for Binance.
 * Binance must not be described as if trades pull in by themselves.
 */
export function exchangeSyncBlurb(exchanges = EXCHANGES) {
  const list = exchanges || [];
  const name = (id, fallback) => list.find((e) => e?.id === id)?.name || fallback;
  return `סנכרון אוטומטי מ-${name('mexc', 'MEXC')} ו-${name('bybit', 'Bybit')} · ייבוא קובץ מ-${name('binance', 'Binance')}`;
}

function hexRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return { r: 56, g: 189, b: 248 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Hover glow for an exchange card. `accent` in EXCHANGES is the only brand
 * color; the beam and the cursor bubble both read these variables.
 * Spot alpha matches the old cyan bubble (0.10) so it stays faint.
 */
export function exchangeGlowStyle(exchange) {
  const accent = exchange?.accent || '#38bdf8';
  const { r, g, b } = hexRgb(accent);
  return {
    '--beam-from': accent,
    '--beam-to': `rgba(${r}, ${g}, ${b}, 0.6)`,
    '--spot': `rgba(${r}, ${g}, ${b}, 0.10)`,
  };
}

export const EXCHANGES = [
  {
    id: 'bybit',   name: 'Bybit',   tagline: 'Derivatives Exchange',
    accent: '#F7A600', glow: 'rgba(247,166,0,0.35)',
    apiUrl: 'https://www.bybit.com/app/user/api-management', canSync: true,
    steps: [
      { text: 'Account → API Management → Create New Key', n: '1' },
      { text: 'בחר "System-generated API Keys"', n: '2' },
      { text: 'שם: "TradeOS"', n: '3' },
      { text: 'Permissions → Read-Only בלבד ✓', n: '4', ok: true },
      { text: 'אל תסמן Trade / Withdraw / Transfer', n: '!', warn: true },
      { text: 'Submit → 2FA → העתק מפתחות', n: '5' },
    ],
  },
  {
    id: 'mexc',    name: 'MEXC',    tagline: 'Global Crypto Exchange',
    accent: '#1972F5', glow: 'rgba(25,114,245,0.35)',
    apiUrl: 'https://www.mexc.com/user/openapi', canSync: true,
    // A MEXC key without a linked IP (TradeOS connects from changing
    // Cloudflare IPs, so no IP can be linked) expires after 90 days.
    keyLifetimeDays: 90,
    renewHint: 'My API Key → Action → Renew',
    steps: [
      { text: 'Profile → API Management → Create API Key', n: '1' },
      { text: 'שם: "TradeOS"', n: '2' },
      { text: 'Futures → Account: View Account Details ✓', n: '3', ok: true },
      { text: 'Futures → Trade: View Order Details ✓', n: '4', ok: true },
      { text: 'אל תסמן Order Placing / Withdraw / Trade', n: '!', warn: true },
      { text: 'Create → 2FA → העתק מפתחות', n: '5' },
    ],
  },
  {
    id: 'okx',     name: 'OKX',     tagline: 'Advanced Trading Platform',
    accent: '#F5F5F5', glow: 'rgba(245,245,245,0.28)',
    apiUrl: 'https://www.okx.com/account/my-api', canSync: true,
    steps: [
      { text: 'Profile → API → Create API', n: '1' },
      { text: 'שם: "TradeOS" → קבע Passphrase', n: '2' },
      { text: 'Permissions → Read ✓ בלבד', n: '3', ok: true },
      { text: 'אל תסמן Trade / Withdraw', n: '!', warn: true },
      { text: 'Confirm → 2FA → העתק Key + Secret + Passphrase', n: '4' },
    ],
    extraField: { key: 'passphrase', label: 'Passphrase', placeholder: 'OKX Passphrase', required: true },
  },
  {
    id: 'bitget',  name: 'Bitget',  tagline: 'Copy Trading & Futures',
    accent: '#00F0FF', glow: 'rgba(0,240,255,0.35)',
    apiUrl: 'https://www.bitget.com/account/newapi', canSync: true,
    steps: [
      { text: 'Account → API Management → Create API', n: '1' },
      { text: 'שם: "TradeOS" → קבע Passphrase', n: '2' },
      { text: 'Permissions → Read Only ✓', n: '3', ok: true },
      { text: 'אל תסמן Trade / Withdrawal', n: '!', warn: true },
      { text: 'Confirm → 2FA → העתק Key + Secret + Passphrase', n: '4' },
    ],
    extraField: { key: 'passphrase', label: 'Passphrase', placeholder: 'Bitget Passphrase', required: true },
  },
  {
    // Perp DEX: everything is public on-chain data, so the "credential" is the
    // wallet address — no API key/secret exists or is stored (see
    // exchangeService.js). `authType: 'address'` switches the connect dialog.
    id: 'hyperliquid', name: 'Hyperliquid', tagline: 'Perp DEX · On-chain',
    accent: '#97FCE4', glow: 'rgba(151,252,228,0.35)',
    apiUrl: 'https://app.hyperliquid.xyz/portfolio', canSync: true,
    authType: 'address',
    steps: [
      { text: 'פתח את Hyperliquid → Portfolio', n: '1' },
      { text: 'העתק את כתובת הארנק הראשי (0x…) מהפינה העליונה', n: '2' },
      { text: 'לא צריך מפתח API ולא חתימה — הנתונים ציבוריים', n: '3', ok: true },
      { text: 'אל תזין מפתח פרטי או Seed Phrase לעולם', n: '!', warn: true },
      { text: 'ארנק משנה / Agent Wallet? השתמש בכתובת החשבון הראשי', n: '4' },
    ],
    addressField: { label: 'כתובת ארנק', placeholder: '0x…' },
  },
  {
    id: 'binance', name: 'Binance', tagline: "World's Largest Exchange",
    accent: '#F0B90B', glow: 'rgba(240,185,11,0.35)',
    apiUrl: 'https://www.binance.com/en/my/orders/futures/history', canSync: false,
    steps: [
      { text: 'Binance → Futures → Order History', n: '1' },
      { text: 'Export → הורד את קובץ ה-CSV', n: '2' },
      { text: 'ייבא את הקובץ כאן — העסקאות נכנסות ליומן', n: '3', ok: true },
      { text: 'אין סנכרון API. מפתח קריאה לא מושך עסקאות', n: '!', warn: true },
    ],
  },
];
