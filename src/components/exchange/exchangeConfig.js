// Per-exchange connection config (display name, accent, API page, setup
// steps, canSync). Shared by the exchange settings page and the trades-tab
// proposal banner (ExchangeProposals) — kept in its own module so the banner
// doesn't pull the whole settings page into the journal chunk.

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
    accent: '#2B78FF', glow: 'rgba(43,120,255,0.35)',
    apiUrl: 'https://www.mexc.com/user/openapi', canSync: true,
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
    accent: '#0AC18E', glow: 'rgba(10,193,142,0.35)',
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
    accent: '#00C580', glow: 'rgba(0,197,128,0.35)',
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
    id: 'binance', name: 'Binance', tagline: "World's Largest Exchange",
    accent: '#F0B90B', glow: 'rgba(240,185,11,0.35)',
    apiUrl: 'https://www.binance.com/en/my/settings/api-management', canSync: false,
    steps: [
      { text: 'Profile → API Management → Create API', n: '1' },
      { text: 'בחר "System Generated" → שם: "TradeOS"', n: '2' },
      { text: 'Restrictions → Enable Reading בלבד ✓', n: '3', ok: true },
      { text: 'אל תסמן Spot Trading / Futures / Withdrawals', n: '!', warn: true },
      { text: 'שמור API Key + Secret Key', n: '4' },
    ],
  },
];
