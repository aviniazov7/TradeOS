<div align="center">

<img src="https://readme-typing-svg.demolab.com/?lines=TradeOS+%E2%80%94+Trading+Operating+System;Journal+%E2%80%A2+Analytics+%E2%80%A2+Backtest+%E2%80%A2+Web+Push+Alerts&font=Fira+Code&size=22&duration=2800&pause=900&color=F7A600&center=true&vCenter=true&width=720&height=50" alt="TradeOS" />

<br/>

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000&style=for-the-badge)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=fff&style=for-the-badge)
![Firebase](https://img.shields.io/badge/Firebase-12-FFA000?logo=firebase&logoColor=000&style=for-the-badge)
![Cloudflare](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=fff&style=for-the-badge)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=fff&style=for-the-badge)

</div>

# TradeOS — Trading Operating System

<div dir="rtl">

פלטפורמה מקיפה לניהול מסחר בקריפטו (פיוצ'רס) — יומן מסחר, אנליטיקס מתקדם, אזור מנטליות, חיבור בורסות, התראות Web Push מתוך האפליקציה, ועוד. הכל בעברית ובממשק RTL מודרני.

</div>

**Live:** [tradeos-91a58.web.app](https://tradeos-91a58.web.app)

> 👉 ממשיכים מפה / עובדים ממחשב אחר? קראו קודם את **[docs/NEXT.md](docs/NEXT.md)** — מה נשאר לעשות.

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

## Notifications (Web Push)

All notifications are delivered in-app via Web Push (VAPID), keyed by the user's uid — no external bot or third-party chat app required. Everything is configured from the app's notification settings.

### Automated Notifications
Configured per-user from the notification settings (a scheduled-push section + a "send test" button). The cron delivers them via Web Push:

| Feature | Description |
|---|---|
| Trade Events | Position opened / TP hit / SL hit (manual trades and exchange sync) |
| Journal Reminder | Daily reminder at a configurable time (default 21:00) |
| Daily Summary | End-of-day P&L, trade count, Win Rate (auto-pushed from the app) |
| Economic Calendar | Alert 1 hour before High Impact USD events (CPI, FOMC, NFP) |

The cron matches a scheduled time to a **10-minute tick window**, so any chosen time fires (not only multiples of 10).

### Worker Architecture
- **Runtime:** Cloudflare Workers (serverless, edge)
- **Delivery:** Web Push (VAPID, encrypted payloads) to every registered device
- **Storage:** Workers KV (push subscriptions, alerts, schedules, stats — all uid-keyed)
- **Market Data:** Binance Spot + Futures API
- **Calendar:** ForexFactory API
- **Cron:** Every 10 minutes (price alerts, reminders, summaries, calendar events)
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
| Cloudflare Workers | Serverless runtime (Web Push notifications + Exchange sync proxy) |
| Workers KV | Key-value storage for push subscriptions, alerts, schedules |
| Web Push (VAPID) | Encrypted push delivery to registered devices |
| Binance API | Spot + Futures market data |
| MEXC / Bybit / OKX / Bitget API | Exchange trade sync (read-only, HMAC signed) |

---

## Architecture

```mermaid
flowchart TD
    user["👤 User<br/>Browser · iOS PWA"] --> app

    %% Web app
    app["⚛️ React + Vite SPA<br/>Tailwind · Framer Motion · RTL"] --> auth & svc & worker

    %% Firebase
    auth["🔐 Firebase Auth<br/>Google OAuth · Email Link"] --> store
    svc["🧩 Service Layer<br/>firestoreService · authService · exchangeService"] --> store & worker
    store[("🔥 Firestore<br/>trades · journals · plans<br/>backtests · mentality · notes")]
    hosting["🌐 Firebase Hosting<br/>SPA · SW · cache headers"] -.serves.-> app

    %% Worker
    worker["☁️ Cloudflare Worker<br/>(edge runtime)"] --> sync & push & cron

    %% Exchange pipeline
    sync["🔄 Exchange Sync Proxy<br/>HMAC-SHA256 signing"] --> exchanges
    exchanges["💱 Bybit · MEXC · OKX · Bitget<br/>(read-only API keys)"]

    %% Web Push pipeline
    push["🔔 Web Push<br/>VAPID · encrypted payloads"] --> kv & market
    kv[("📦 Workers KV<br/>subscriptions · alerts · schedules · stats")]
    market["📊 Binance Spot+Futures<br/>ForexFactory"]

    %% Scheduled
    cron{{"⏰ Cron · * * * * *"}} --> alerts & summary & calendar
    alerts["💥 Price alerts"] --> push
    summary["📈 Daily P&L summary"] --> push
    calendar["🗓️ Economic calendar<br/>(High-Impact USD)"] --> push

    classDef firebase fill:#FFA000,stroke:#E65100,color:#000,stroke-width:2px
    classDef cloudflare fill:#F38020,stroke:#A04200,color:#000,stroke-width:2px
    classDef react fill:#61DAFB,stroke:#0A6E89,color:#000,stroke-width:2px
    classDef external fill:#2A2A2A,stroke:#666,color:#FFF
    classDef cron fill:#8B5CF6,stroke:#5B21B6,color:#FFF,stroke-width:2px

    class auth,store,hosting firebase
    class worker,sync,push,kv cloudflare
    class app,svc react
    class exchanges,market external
    class cron,alerts,summary,calendar cron
```

All Firebase SDK calls are isolated in a **service layer** (`src/services/`). Hooks and components never import directly from `firebase/*` — they use service functions instead.

```mermaid
flowchart LR
    A["Components<br/>Contexts · Hooks"] --> B["Service Layer<br/>firestoreService · authService · exchangeService"]
    B --> C["Firebase SDK"] & D["Cloudflare Worker"]

    classDef boundary fill:#1f2937,stroke:#F7A600,color:#fff,stroke-width:2px
    class B boundary
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
│   │   ├── profile/         # User profile, notification settings
│   │   ├── shared/          # Reusable UI components
│   │   └── strategies/      # Custom strategy management
│   ├── contexts/            # React contexts (Auth, Journal, Backtest)
│   ├── hooks/               # Custom hooks (trades, stats, DCA, alerts, etc.)
│   ├── services/            # Firebase, Firestore, push, exchange APIs
│   └── utils/               # Calculations, formatters, constants
├── worker/
│   └── index.js             # Cloudflare Worker (Web Push + exchange sync proxy)
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

# Set the Web Push VAPID key as a secret
npx wrangler secret put VAPID_JWK

# Deploy
npx wrangler deploy
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

## Deployment & Release Workflow

### How to ship any change

```bash
git pull origin main          # get the latest
# ...make your changes...
npm run deploy                # build + worker + hosting + Firestore rules
```

`npm run deploy` runs: `vite build` → `wrangler deploy` (Cloudflare Worker) →
`firebase deploy --only hosting,firestore:rules`. Firestore security rules are
published automatically, so rule changes never get left behind.

### Version bump — automatic on every release

Two values are bumped together so users reliably receive the update:

| File | Constant | Why |
|---|---|---|
| `src/utils/constants.js` | `APP_VERSION` | Shown in the sidebar; reported per-user to the admin panel |
| `public/sw.js` | `CACHE_NAME` (`tradeos-vN`) | Forces the service worker to register a new version |

**You don't bump these manually.** The deploy workflow auto-bumps `APP_VERSION`
(patch) and `CACHE_NAME` on every push to `main` (`scripts/bump-version.mjs`,
which also syncs the og-image `?v=` cache-buster in `index.html`). The version
line was reset to **2.0.0** for the release; bump manually only if the
auto-bump script breaks.

### Silent update (how users get updates)

There is **no update banner or button** — updates are silent, applied on the
user's next open:

1. You deploy a new version (new `CACHE_NAME`).
2. The browser fetches the new `sw.js`; it `skipWaiting()`s on install and
   `clients.claim()`s on activate, so it takes control and caches the new
   shell immediately.
3. The page is **never reloaded mid-session** — the fresh assets are served
   the next time the app is opened/reloaded (`src/services/swUpdate.js` only
   registers + checks for updates on focus; it never force-reloads).
4. Result: users on old versions update automatically, with zero interaction,
   on their next open. The old opt-in banner (`UpdatePrompt.jsx`) was removed.

### Rollback (bad deploy safety net)

A bad release can be reverted in seconds without a redeploy:
[Firebase Hosting → Release history](https://console.firebase.google.com/project/tradeos-91a58/hosting)
→ pick the last good version → **Rollback**. End users cannot downgrade
themselves; version control is centralized with the project owner.

### Admin panel

Route `/admin` (sidebar link "ניהול") is gated on the user's Firestore
profile having `role: "admin"`. To grant the first admin (chicken-and-egg,
since rules require `role` to read other users), set the `role` field to
`admin` on your own document under `users/{uid}` in the
[Firestore console](https://console.firebase.google.com/project/tradeos-91a58/firestore)
once.

It is a full operations console, not read-only:
- **Customer analytics** — revenue/MRR over time, DAU/WAU/MAU + cohort
  retention, onboarding funnel, AI usage & estimated cost, Firestore document
  counts (with a link to the Firebase console for exact quotas).
- **User drill-down** — per-user detail: counts, push-device status, connected
  exchanges (ids only), reported app version, private admin note.
- **Controls** — grant/revoke Premium, permanent user deletion (server-side,
  including the Auth account), single/bulk push, coupon management, an audit
  log (including who deleted their account and when).

These actions run through admin-gated Worker endpoints backed by a Firebase
service account; the Firestore rules keep admins read-only on other users'
data client-side.

### AI agent checklist (do this for every code change)

See `CLAUDE.md` for the authoritative rules. In short:

1. **Never push to `main`.** Branch off `dev` (`feature/*` / `fix/*`), open a
   PR to `dev`. Commit with the owner's git identity
   (`Avraham Niazov <aviniazov7@icloud.com>`), no third-party trailers.
2. Make the change. Keep Firebase access inside `src/services/`.
3. **Do not bump versions manually** — CI auto-bumps on the `main` release.
4. `npm run build` must pass. Don't add new lint errors in files you change
   (the repo has ~160 pre-existing ones that aren't deploy blockers).
5. Push the branch → merge the PR to `dev`. **GitHub Actions deploys
   automatically** (Hosting preview channel + the Worker) — no manual
   `npm run deploy`. Promotion to `main` (production) is the owner's call.
6. Firestore rules are the one thing CI can't deploy — run
   `firebase deploy --only firestore:rules` manually when `firestore.rules`
   changes.

---

## License

Private project. All rights reserved.
