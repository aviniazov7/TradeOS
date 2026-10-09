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
- **Binance** — guide only (IP whitelist limitation)
- Visual preview of trades before import, with "update" badge for existing ones

### Dashboard & Analytics
- P&L chart, win rate breakdown, equity curve
- Trade heatmap, streak analysis, **day-of-week** performance
- **Session analysis** using Israel timezone (Asia/Jerusalem) — Asian/London/NY/Overlap
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
- Auto-detected trading sessions
- Backtest-specific analytics

### Portfolio (`/portfolio`)
- **DCA tab** — dollar-cost averaging position tracker, per-coin analytics with average entry price
- **Wallets tab** — read-only on-chain wallet balances (EVM, Solana, Bitcoin)

### Market Data
- Real-time prices: market cap, BTC dominance, 24h volume
- Fear & Greed Index with history
- Altcoin Season Index (90-day)
- Top gainers/losers, trending coins, interactive heatmap
- Coin analysis, whale tracking and Polymarket (Premium) as tabs of the Market page
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
│   │   ├── analytics/       # Equity curve, session, day-of-week, duration charts
│   │   ├── auth/            # Login page
│   │   ├── backtest/        # Backtesting tracker & analytics
│   │   ├── dashboard/       # Dashboard, stat cards, charts, performance tables
│   │   ├── dca/             # DCA position tracker & analytics
│   │   ├── exchange/        # Exchange API settings & sync UI
│   │   ├── journal/         # Trade journal, calendar, form, filters
│   │   ├── layout/          # Header, sidebar, mobile nav
│   │   ├── market/          # Market overview
│   │   ├── mentality/       # Morning/evening journals, mental stats
│   │   ├── news/            # News feed + economic calendar
│   │   ├── onboarding/      # First-time user wizard
│   │   ├── plans/           # Trading plans & analysis cards
│   │   ├── profile/         # User profile, notification settings
│   │   ├── portfolio/       # Portfolio page (DCA + wallets tabs)
│   │   └── shared/          # Reusable UI components
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

## Accounts, ownership & credentials

> **תקציר:** הקוד אצל החשבון האישי ב-GitHub; Firebase ו-Cloudflare הם שירותים נפרדים, וה-Workers של TradeOS יושבים בחשבון Cloudflare **של האפליקציה**, לא בחשבון האישי. את הפקודות `wrangler` שרצות מהמחשב לא להריץ בלי לבדוק איזה חשבון מחובר (ראו למטה).

| Service | Account | What lives there |
|---|---|---|
| GitHub | `aviniazov7` (personal), private repo `aviniazov7/TradeOS` | code, CI, CI secrets |
| Firebase / Google Cloud | project `tradeos-91a58` (number `80529278454`); the local `firebase` CLI is logged in as `aviniazov18@gmail.com` | Auth, Firestore, Hosting, Cloud Function `googleSignIn` (`europe-west1`) |
| Cloudflare — **app account** | the account shown as `Tradeos.app@gmail…` (workers.dev subdomain `tradeos`) | Workers `trade-os` (all HTTP), `tradeos-alerts` (cron, every 10 min), `trade-os-staging` (unused), KV namespace `ALERTS_KV` |
| Cloudflare — personal | `aviniazov7@icloud.com` | **not** TradeOS: other workers (`safety-groq-proxy`, `workout-bot`, `pump-detector`) and `tradeos-google-auth`, which nothing in this repo references |
| Resend, Groq, Moralis | API keys are stored as Worker secrets (see below) | email sending, AI chat, wallet lookups |

**Ownership policy (target):** every production asset has two Owners — the app account and the personal account — so losing one login (2FA, recovery) never locks the project out.
- Firebase: *Project settings → Users and permissions* — both accounts with the **Owner** role.
- Cloudflare: the personal account added as a member of the app account (*Manage account → Members*) with a Super Administrator role, so one login reaches both.
- Status of both: **to be confirmed** by the owner; update this line when done.

### Where credentials live

- **Exchange API keys** are never stored in Firestore or in the browser. They are sent once to the Worker (`POST /exchange/credentials/store`) and kept in KV as `pushexch:{uid}:{exchange}`, encrypted with AES-GCM using the Worker secret `CREDS_ENCRYPTION_KEY`. Firestore (`users/{uid}/settings/exchanges`) holds only a `connected` marker. The Worker only calls **read** endpoints of the exchanges (trades, balances, open orders) — it never places orders or withdraws — and the app tells users to create **read-only** keys. A scan on 2026-10-09 found 0 of 24 users with plaintext keys (`.github/workflows/scan-exchange-keys.yml` re-runs it, read-only).
- **Worker secrets** (names only — values are never in the repo): `CREDS_ENCRYPTION_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `MORALIS_API_KEY`, `VAPID_JWK`, `UNSUBSCRIBE_SECRET`, `MAIL_TO_ADMIN_OVERRIDE`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`. CI re-applies the ones it knows from GitHub secrets on every deploy; the others (`CREDS_ENCRYPTION_KEY`, `UNSUBSCRIBE_SECRET`, …) were set once in the dashboard and survive deploys.
- **GitHub Actions secrets**: `CLOUDFLARE_API_TOKEN` (an API token for the **app** Cloudflare account; the account id is set in `deploy.yml`), `FIREBASE_SERVICE_ACCOUNT`, plus the Worker secret values listed above.

### Running `wrangler` / `firebase` locally — read this first

- This machine's `wrangler` is logged in to the **personal** Cloudflare account, which does **not** contain the TradeOS Workers. `wrangler secret put …` from here would target the wrong account. Set a secret in the dashboard instead (*Workers & Pages → trade-os → Settings → Variables and Secrets*), or use the app account's API token with `CLOUDFLARE_ACCOUNT_ID`.
- Deploys go through GitHub Actions (see `CLAUDE.md`); Firestore rules are the only manual deploy (`firebase deploy --only firestore:rules --project tradeos-91a58`).

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

> ⚠️ Log in to the **app's** Cloudflare account (see *Accounts, ownership & credentials* above) — not the personal one.

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
