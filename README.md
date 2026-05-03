# TradeOS — Trading Operating System

<div dir="rtl">

פלטפורמה מקיפה לניהול מסחר בקריפטו (פיוצ'רס) — יומן מסחר, אנליטיקס מתקדם, אזור מנטליות, חיבור בורסות, בוט טלגרם אינטראקטיבי, ועוד. הכל בעברית ובממשק RTL מודרני.

</div>

**Live:** [tradeos-91a58.web.app](https://tradeos-91a58.web.app)
**Bot:** [@TradeOSAlerts_bot](https://t.me/TradeOSAlerts_bot)

---

## Features

### Trading Journal
- Log futures trades with entry/exit prices, leverage, fees, and notes
- Automatic P&L, ROI%, R:R, and net PnL calculations
- Filter by pair, strategy, result, tag — **filters persist across page reloads**
- Multiple journals per exchange/strategy
- Monthly calendar with color-coded daily P&L
- CSV import (Bybit / MEXC / OKX / Bitget format) + CSV export with correct % calculation
- **Duplicate trade detection** — warns if a similar trade already exists
- **Undo delete** — 5-second undo window with batched toast notifications

### Exchange Sync
- **Direct API sync** from Bybit, MEXC, OKX, Bitget — no manual CSV needed
- Accurate **entry & exit timestamps** (MEXC: dual-API chronological matching)
- Syncs fees, leverage, direction, P&L from exchange
- **Upsert logic** — re-sync updates existing trades instead of creating duplicates
- Passphrase support for OKX and Bitget
- **MT5** — CSV import with step-by-step guide
- **Binance** — guide only (IP whitelist limitation)
- Visual preview of trades before import, with "update" badge for existing ones

### Dashboard & Analytics
- P&L chart, win rate breakdown, equity curve
- Trade heatmap, streak analysis, **day-of-week** performance
- **Session analysis** using Israel timezone (Asia/Jerusalem) — Asian/London/NY/Overlap
- Correlation heatmap between pairs
- Monthly performance table, strategy comparison
- Sharpe Ratio, Sortino Ratio, Profit Factor, Calmar Ratio, Max Drawdown, Recovery Factor
- Live crypto price ticker, Fear & Greed gauge
- **Offline detection banner** — alerts user when internet is lost

### Mentality Zone
- Morning & evening psychological journals
- Emotion tracking, readiness assessment
- Psychological journey timeline
- Mental stats with streaks and patterns

### Backtesting
- Separate journals for strategy backtesting
- Side-by-side strategy comparison
- Auto-detected trading sessions
- Backtest-specific analytics

### DCA Tracker
- Dollar-cost averaging position tracker
- Per-coin analytics with average entry price
- Portfolio summary

### Market Data
- Real-time prices: market cap, BTC dominance, 24h volume
- Fear & Greed Index with history
- Altcoin Season Index (90-day)
- Top gainers/losers, trending coins, interactive heatmap
- Crypto news feed + economic calendar

### Plans & Analysis
- Trading plans with entry/exit rules and TradingView chart links
- Analysis cards with coin filter (substring search) and category filter
- Custom strategy management per context

### Additional
- Personal trading notes
- Global search across trades, plans, backtests
- Dark/Light mode with persistent preference
- Mobile responsive with bottom navigation and pull-to-refresh
- Onboarding wizard for new users

---

## Telegram Bot

Interactive Telegram bot with real-time market data and automated notifications.

### Market Data (with visual charts)
| Command | Description |
|---|---|
| `/prices` | Watchlist prices (green/red, sorted by change) |
| `/funding` | Funding Rate — horizontal bar chart |
| `/oi` | Open Interest — horizontal bar chart |
| `/ls` | Long/Short Ratio — stacked bar chart |
| `/fear` | Fear & Greed Index with visual gauge |
| `/price BTC` | Quick price check for any coin |

### Personal Watchlist
- 20 supported coins (BTC, ETH, SOL, XRP, BNB, ADA, DOGE, AVAX, DOT, LINK, MATIC, SUI, NEAR, APT, ARB, OP, ATOM, FTM, PEPE, TRUMP)
- Add/remove coins via interactive menu
- Prices, funding, OI, and L/S ratio all use your personal watchlist

### Automated Notifications
| Feature | Description |
|---|---|
| Price Alerts | Set target prices, monitored 24/7 every minute |
| Journal Reminder | Daily reminder at configurable time (default 21:00) |
| Daily Summary | End-of-day P&L, trade count, Win Rate (auto-pushed from app) |
| Economic Calendar | Alert 1 hour before High Impact USD events (CPI, FOMC, NFP) |

All notifications are toggleable via the bot settings menu (`/settings`).

### Bot Architecture
- **Runtime:** Cloudflare Workers (serverless, edge)
- **Storage:** Workers KV (user data, settings, alerts, stats)
- **Charts:** QuickChart.io (server-side chart rendering)
- **Market Data:** Binance Spot + Futures API
- **Calendar:** ForexFactory API
- **Cron:** Every minute (price alerts, reminders, summaries, calendar events)
- **Auth:** Deep link registration — bot is silent for unregistered users
- **Exchange Sync:** HMAC-SHA256 signing proxy — API secrets never leave the server

---

## Tech Stack

### Web App
| Technology | Version | Usage |
|---|---|---|
| React | 19 | UI framework |
| Vite | 7 | Build tool |
| Tailwind CSS | 4 | Styling |
| Firebase Auth | 12 | Authentication (Google) |
| Cloud Firestore | 12 | Database |
| Firebase Hosting | — | Deployment |
| Recharts | 3.8 | Charts & graphs |
| Framer Motion | 12 | Animations |
| Lucide React | — | Icons |
| React Hot Toast | — | Notifications |
| date-fns | — | Date handling |

### Cloudflare Worker
| Technology | Usage |
|---|---|
| Cloudflare Workers | Serverless runtime (Telegram bot + Exchange sync proxy) |
| Workers KV | Key-value storage for user data, alerts, watchlists |
| QuickChart.io | Chart image generation |
| Binance API | Spot + Futures market data |
| Telegram Bot API | Webhooks + inline keyboards |
| MEXC / Bybit / OKX / Bitget API | Exchange trade sync (read-only, HMAC signed) |

---

## Architecture

```
┌─────────────────┐      ┌──────────────┐      ┌──────────────────────────┐
│   React App     │      │   Firebase   │      │   Cloudflare Worker      │
│   (Vite)        │─────▶│   Firestore  │      │                          │
│                 │      │   Auth       │      │  Telegram Bot            │
│   Firebase      │      │   Hosting    │      │  Exchange Sync Proxy     │
│   Hosting       │      └──────────────┘      │  ┌────────────────────┐  │
└────────┬────────┘                            │  │    Workers KV      │  │
         │                                     │  └────────────────────┘  │
         │  POST /exchange/sync                │                          │
         │  POST /daily-stats                  │  Cron: * * * * *         │
         └────────────────────────────────────▶│                          │
                                               │  Binance / MEXC / Bybit  │
                                               │  OKX / Bitget APIs       │
                                               │  QuickChart.io           │
                                               │  Telegram API            │
                                               └──────────────────────────┘
```

All Firebase SDK calls are isolated in a **service layer** (`src/services/`). Hooks and components never import directly from `firebase/*` — they use service functions instead.

```
Components / Contexts / Hooks
        ↓
   Service Layer (firestoreService.js, authService.js, exchangeService.js)
        ↓
   Firebase SDK / Cloudflare Worker
```

---

## Project Structure

```
TradeOS/
├── src/
│   ├── components/
│   │   ├── analytics/       # Advanced stats, equity curve, heatmap, streaks
│   │   ├── auth/            # Login page
│   │   ├── backtest/        # Backtesting tracker & analytics
│   │   ├── dashboard/       # Dashboard, stat cards, charts, performance tables
│   │   ├── dca/             # DCA position tracker & analytics
│   │   ├── exchange/        # Exchange API settings & sync UI
│   │   ├── journal/         # Trade journal, calendar, form, filters
│   │   ├── layout/          # Header, sidebar, mobile nav
│   │   ├── leaderboard/     # User rankings
│   │   ├── market/          # Market overview
│   │   ├── mentality/       # Morning/evening journals, mental stats
│   │   ├── news/            # News feed + economic calendar
│   │   ├── notes/           # Trading notes
│   │   ├── onboarding/      # First-time user wizard
│   │   ├── plans/           # Trading plans & analysis cards
│   │   ├── profile/         # User profile, Telegram connection
│   │   ├── shared/          # Reusable UI components
│   │   └── strategies/      # Custom strategy management
│   ├── contexts/            # React contexts (Auth, Journal, Backtest)
│   ├── hooks/               # Custom hooks (trades, stats, DCA, alerts, etc.)
│   ├── services/            # Firebase, Firestore, Telegram, exchange APIs
│   └── utils/               # Calculations, formatters, constants
├── worker/
│   └── index.js             # Cloudflare Worker (Telegram bot + exchange sync proxy)
├── public/                  # Static assets & icons
└── package.json
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- Firebase project (Auth + Firestore enabled)
- Cloudflare account (for Worker)

### Web App

```bash
# Install dependencies
npm install

# Create .env with Firebase config
cp .env.example .env

# Start dev server
npm run dev

# Build & deploy
npm run deploy
```

### Environment Variables

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_WORKER_URL=https://your-worker.workers.dev
```

### Cloudflare Worker

```bash
# Login to Cloudflare
npx wrangler login

# Set bot token as secret
npx wrangler secret put BOT_TOKEN

# Deploy
npx wrangler deploy

# Set Telegram webhook
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-worker.workers.dev/webhook"
```

---

## Supported Exchanges

| Exchange | API Sync | CSV Import | Notes |
|---|---|---|---|
| MEXC | ✅ | ✅ | Dual-API exit time matching |
| Bybit | ✅ | ✅ | Closed PnL endpoint |
| OKX | ✅ | ✅ | Requires Passphrase |
| Bitget | ✅ | ✅ | Requires Passphrase |
| Binance | ❌ | ✅ | IP whitelist limitation |
| MetaTrader 5 | ❌ | ✅ | CSV export from History Center |

API keys are **read-only** and signed server-side via the Cloudflare Worker — secrets never reach the browser.

---

## Deployment

```bash
# Full deploy (build + worker + hosting)
npm run deploy
```

---

## License

Private project. All rights reserved.
