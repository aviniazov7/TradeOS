# TradeOS - מסמך איפיון מלא ומאוחד

**גרסה:** 2.0
**תאריך:** 9 מרץ 2026
**מפתח:** אברהם ניאזוב
**שם הפרויקט:** TradeOS

---

## 1. סקירה כללית

### 1.1 מה זה?
**TradeOS** הוא אתר אינטרנט (Web App) + PWA שמרכז את כל הכלים שסוחר קריפטו מקצועי צריך במקום אחד. המערכת כוללת: יומן מסחר חי, מנוע בק-טסטינג, מעקב DCA, דשבורד סטטיסטיקות מתקדם, מערכת אסטרטגיות, מעקב פסיכולוגי, מערכת הערות, וחיבור ישיר לבורסות.

המערכת בנויה לתפקד כ-**Trading Operating System** מלא לסוחרים מקצועיים שרוצים לחשוב כמו קרן מסחר.

### 1.2 למי זה?
- **שלב ראשון:** כלי אישי (Trader יחיד)
- **בעתיד:** מספר משתמשים, קבוצות מסחר, מנהלי קרנות

### 1.3 פלטפורמות
| שלב | פלטפורמה | פירוט |
|-----|----------|-------|
| שלב 1 | Web | Desktop (Chrome, Safari, Firefox) + Mobile responsive |
| שלב 2 | Mobile | PWA - לא Native app, אתר responsive שעובד כ-PWA |
| שלב 3 | Web3 | חיבור ארנקים, on-chain verification |

---

## 2. סטאק טכנולוגי

| רכיב | טכנולוגיה | סיבה |
|------|-----------|------|
| Frontend | React 18 (Vite) | מהיר, ecosystem עשיר |
| Styling | Tailwind CSS 3 | dark theme מובנה, responsive קל, utility-first |
| גרפים | Recharts | React-native, קל לשימוש, מתאים לנתוני מסחר |
| Auth | Firebase Auth (Google) | פשוט, מאובטח, חינמי |
| Database | Cloud Firestore | realtime, NoSQL, חינמי עד 50K reads/day |
| Hosting | Firebase Hosting | deploy אוטומטי, SSL, CDN |
| Storage | Firebase Storage | תמונות מסך של גרפים |
| Exchange APIs | Bybit v5 + MEXC v3 | REST APIs, read-only |
| Proxy | Firebase Cloud Functions / Cloudflare Worker | CORS workaround |
| Routing | React Router v6 | SPA navigation |
| State | React Context + Hooks | פשוט, בלי overhead מיותר |
| Icons | Lucide React | קל, מודרני |
| Dates | date-fns 3 | קל, modular |
| Toasts | react-hot-toast | התראות UI |

---

## 3. ארכיטקטורה

```
┌─────────────────────────────────────────────────────┐
│                    React SPA (Vite)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │Dashboard │ │ Journal  │ │ Backtest │ │  DCA   │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │
│       │             │            │            │      │
│  ┌────┴─────────────┴────────────┴────────────┴────┐ │
│  │              Custom Hooks Layer                  │ │
│  │  useAuth │ useTrades │ useBacktests │ useDCA    │ │
│  └────┬─────────────┬────────────┬────────────┬────┘ │
│       │             │            │            │      │
│  ┌────┴─────────────┴────────────┴────────────┴────┐ │
│  │              Services Layer                      │ │
│  │  firebase.js │ bybitApi.js │ mexcApi.js         │ │
│  └─────────────────────┬───────────────────────────┘ │
└────────────────────────┼─────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Firebase │   │ Bybit    │   │  MEXC    │
   │ Firestore│   │ API v5   │   │  API v3  │
   │ + Auth   │   │(read-only│   │(read-only│
   │ + Storage│   └──────────┘   └──────────┘
   └──────────┘

CORS Flow:
Browser → Firebase Function (proxy) → Exchange API
```

---

## 4. מבנה הפרויקט

```
trade-os/
├── public/
│   ├── favicon.ico
│   └── manifest.json              # PWA manifest
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx        # ניווט צדדי (desktop) / bottom nav (mobile)
│   │   │   ├── Header.jsx         # כותרת + פרופיל משתמש + search
│   │   │   └── Layout.jsx         # wrapper - sidebar + header + content
│   │   ├── dashboard/
│   │   │   ├── Dashboard.jsx      # דף ראשי
│   │   │   ├── StatCard.jsx       # קארד סטטיסטיקה (P&L, Win Rate, etc.)
│   │   │   ├── PnLChart.jsx       # גרף Equity Curve
│   │   │   ├── WinRateChart.jsx   # גרף Win Rate לפי אסטרטגיה
│   │   │   ├── HeatmapChart.jsx   # Heatmap יומי
│   │   │   └── RecentTrades.jsx   # טבלת עסקאות אחרונות
│   │   ├── journal/
│   │   │   ├── TradeJournal.jsx   # דף יומן ראשי - רשימה + סינון
│   │   │   ├── TradeForm.jsx      # Modal טופס הוספת/עריכת עסקה
│   │   │   ├── TradeCard.jsx      # כרטיס עסקה בודד
│   │   │   ├── TradeTable.jsx     # תצוגת טבלה (desktop)
│   │   │   └── TradeFilters.jsx   # סינון: מטבע, אסטרטגיה, תאריך, win/loss
│   │   ├── backtest/
│   │   │   ├── BacktestTracker.jsx # דף בק-טסטינג ראשי
│   │   │   ├── BacktestForm.jsx   # טופס בק-טסט חדש
│   │   │   ├── BacktestStats.jsx  # סטטיסטיקות לפי אסטרטגיה
│   │   │   └── StrategyCompare.jsx # השוואת אסטרטגיות
│   │   ├── dca/
│   │   │   ├── DCATracker.jsx     # דף DCA ראשי
│   │   │   ├── DCAForm.jsx        # הוספת/עריכת תוכנית DCA
│   │   │   ├── DCACard.jsx        # כרטיס DCA בודד
│   │   │   └── DCASummary.jsx     # סיכום כולל + מחירים חיים
│   │   ├── strategies/
│   │   │   ├── StrategyManager.jsx # ניהול אסטרטגיות
│   │   │   └── StrategyForm.jsx   # יצירת/עריכת אסטרטגיה
│   │   ├── notes/
│   │   │   ├── NotesPage.jsx      # דף הערות ראשי
│   │   │   ├── DailyNote.jsx      # הערה יומית
│   │   │   └── Summary.jsx        # סיכום שבועי/חודשי/שוק
│   │   ├── analytics/
│   │   │   ├── AdvancedStats.jsx  # ניתוח ביצועים מתקדם
│   │   │   └── PsychologyTracker.jsx # מעקב פסיכולוגי
│   │   ├── exchange/
│   │   │   ├── ExchangeSettings.jsx # הגדרות API keys
│   │   │   └── ImportTrades.jsx   # ייבוא עסקאות מבורסה
│   │   ├── auth/
│   │   │   ├── LoginPage.jsx      # דף כניסה
│   │   │   └── ProtectedRoute.jsx # guard לדפים מוגנים
│   │   └── shared/
│   │       ├── Modal.jsx          # modal כללי
│   │       ├── ConfirmDialog.jsx  # אישור מחיקה
│   │       ├── EmptyState.jsx     # מצב ריק
│   │       ├── LoadingSpinner.jsx # טעינה
│   │       └── Toast.jsx          # התראות
│   ├── hooks/
│   │   ├── useAuth.js             # Firebase auth state + login/logout
│   │   ├── useTrades.js           # CRUD trades + חישובים
│   │   ├── useBacktests.js        # CRUD backtests + סטטיסטיקות
│   │   ├── useDCA.js              # CRUD DCA plans + חישוב avg price
│   │   ├── useStrategies.js       # CRUD strategies
│   │   ├── useNotes.js            # CRUD notes + summaries
│   │   ├── useExchange.js         # API calls לבורסות
│   │   └── useStats.js            # חישובי דשבורד (P&L, Win Rate, etc.)
│   ├── services/
│   │   ├── firebase.js            # Firebase app init + Firestore refs
│   │   ├── bybitApi.js            # Bybit v5 API wrapper
│   │   └── mexcApi.js             # MEXC v3 API wrapper
│   ├── utils/
│   │   ├── calculations.js        # P&L, R:R, Win Rate, Expectancy, Sharpe
│   │   ├── formatters.js          # מספרים ($1,234.56), תאריכים, אחוזים
│   │   └── constants.js           # אסטרטגיות, מטבעות, timeframes
│   ├── contexts/
│   │   └── AuthContext.jsx        # Auth provider
│   ├── App.jsx                    # Router + providers
│   ├── main.jsx                   # entry point
│   └── index.css                  # Tailwind imports + custom CSS
├── functions/                     # Firebase Cloud Functions (proxy)
│   ├── index.js
│   └── package.json
├── .env                           # Firebase config (לא ב-Git!)
├── .env.example                   # דוגמה ל-env
├── .gitignore
├── firestore.rules                # Firestore security rules
├── firebase.json                  # Firebase config
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
├── package.json
└── README.md
```

---

## 5. Firebase Schema (Firestore)

### 5.1 Collection: `users/{userId}`
```javascript
{
  displayName: "אברהם ניאזוב",
  email: "aviniazov7@icloud.com",
  photoURL: "https://...",
  createdAt: Timestamp,
  settings: {
    defaultLeverage: 10,
    defaultRiskPercent: 1,
    baseCurrency: "USDT",
    strategies: [
      "SOS (Sign of Strength)", "SOW (Sign of Weakness)", "Trendline Break",
      "היצע וביקוש", "Wyckoff", "AMD", "Order Block", "Heikin Ashi"
    ],
    favoriteCoins: ["BTC", "ETH", "SOL", "AVAX", "BNB", "DOGE"]
  },
  exchangeKeys: {
    bybit: {
      apiKey: "encrypted_key",
      apiSecret: "encrypted_secret",
      testnet: false
    },
    mexc: {
      apiKey: "encrypted_key",
      apiSecret: "encrypted_secret"
    }
  }
}
```

### 5.2 Subcollection: `users/{userId}/trades/{tradeId}`
```javascript
{
  // מידע בסיסי
  pair: "BTCUSDT",                    // זוג מסחר
  direction: "long",                   // "long" | "short"
  marketType: "futures",               // "futures" | "spot"
  source: "manual",                    // "manual" | "bybit" | "mexc"
  externalId: null,                    // ID מהבורסה (אם יובא)

  // מחירים
  entryPrice: 65000.50,
  exitPrice: 67500.00,
  stopLoss: 63500.00,
  takeProfit: 70000.00,

  // כמויות
  quantity: 0.1,                       // כמות מטבע
  leverage: 10,
  positionSize: 65005.00,             // entryPrice * quantity
  margin: 6500.50,                     // positionSize / leverage

  // תאריכים
  entryDate: Timestamp,
  exitDate: Timestamp,
  duration: 3600000,                   // milliseconds

  // תוצאות (מחושב אוטומטית)
  pnl: 249.95,                         // רווח/הפסד ב-USDT
  pnlPercent: 3.846,                   // % רווח/הפסד
  rrRatio: 1.92,                       // Risk:Reward בפועל
  result: "win",                       // "win" | "loss" | "breakeven"
  status: "closed",                    // "open" | "closed"

  // פרטים נוספים
  strategy: "SOS (Sign of Strength)",
  timeframe: "4H",                     // "1m"|"5m"|"15m"|"1H"|"4H"|"1D"|"1W"
  entryReason: "BOS ב-4H עם OB חזק",  // סיבה לכניסה
  tags: ["trend-following", "breakout"],
  notes: "נכנסתי אחרי BOS ב-4H עם...",
  screenshots: ["url1", "url2"],       // Firebase Storage URLs

  // פסיכולוגיה
  emotionBefore: "confident",          // "confident"|"fearful"|"greedy"|"neutral"|"fomo"|"revenge"
  emotionAfter: "satisfied",           // "satisfied"|"frustrated"|"regret"|"neutral"
  mistakes: [],                        // ["early_exit", "moved_sl", "oversized", "no_plan"]

  // עמלות
  fees: 13.00,                         // עמלות כוללות
  netPnl: 236.95,                      // pnl - fees

  // מטא
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 5.3 Subcollection: `users/{userId}/backtests/{backtestId}`
```javascript
{
  // מידע בסיסי
  strategy: "Trendline Break",
  pair: "ETHUSDT",
  timeframe: "1H",
  direction: "long",

  // מחירים
  entryPrice: 3200.00,
  exitPrice: 3350.00,
  stopLoss: 3150.00,
  takeProfit: 3400.00,

  // תוצאה
  result: "win",                       // "win" | "loss" | "breakeven"
  rrRatio: 3.0,                        // Risk:Reward בפועל
  rrPlanned: 4.0,                      // R:R שתכננתי

  // תאריכים
  entryDate: Timestamp,               // תאריך כניסה בגרף
  exitDate: Timestamp,                // תאריך יציאה בגרף

  // הערות
  notes: "CHoCH ברור, OB חזק, נכנסתי בריטסט",
  screenshots: ["url1"],

  // מטא
  backtestDate: Timestamp,             // מתי עשיתי את הבק-טסט
  createdAt: Timestamp
}
```

### 5.4 Subcollection: `users/{userId}/dca/{dcaId}`
```javascript
{
  coin: "BTC",
  status: "active",                    // "active" | "paused" | "completed"

  // סיכום (מתעדכן בכל entry)
  totalInvested: 5000.00,             // סה"כ דולרים שהושקעו
  totalCoins: 0.0512,                  // סה"כ מטבעות שנקנו
  avgPrice: 97656.25,                  // מחיר ממוצע

  // תוכנית
  frequency: "weekly",                 // "daily"|"weekly"|"biweekly"|"monthly"
  amountPerEntry: 100.00,             // סכום לכל רכישה
  targetPrice: null,                   // מחיר יעד (אופציונלי)

  // רשימת רכישות
  entries: [
    {
      date: Timestamp,
      amount: 100.00,                  // דולרים
      price: 95000.00,                 // מחיר בזמן הרכישה
      coins: 0.00105,                  // כמות שנקנתה
      source: "manual",                // "manual" | "bybit" | "mexc"
      notes: ""
    }
  ],

  // מטא
  startDate: Timestamp,
  notes: "DCA שבועי על BTC",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 5.5 Subcollection: `users/{userId}/strategies/{strategyId}`
```javascript
{
  name: "SOS (Sign of Strength)",
  rules: "כניסה אחרי BOS + OB ב-4H...",    // חוקי האסטרטגיה
  market: "futures",                          // "futures" | "spot" | "both"
  timeframes: ["1H", "4H"],                  // טיימפריימים מתאימים
  riskPerTrade: 1,                            // אחוז סיכון לטרייד
  rrTarget: 3,                                // R:R יעד
  isActive: true,
  createdAt: Timestamp
}
```

### 5.6 Subcollection: `users/{userId}/notes/{noteId}`
```javascript
{
  type: "daily",                       // "daily" | "weekly" | "monthly" | "market"
  date: Timestamp,
  content: "היום היה יום טוב...",
  marketSummary: "BTC bullish...",
  mood: "focused",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 5.7 Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /trades/{tradeId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      match /backtests/{backtestId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      match /dca/{dcaId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      match /strategies/{strategyId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      match /notes/{noteId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## 6. מודולים ודפים מפורטים

### 6.1 Login Page (`/login`)
- עיצוב: לוגו TradeOS + כפתור "Sign in with Google"
- רקע כהה עם אלמנטים גרפיים
- אחרי Login מוצלח → redirect ל-Dashboard
- אם כבר מחובר → redirect אוטומטי ל-Dashboard

### 6.2 Dashboard (`/`)
**הדף הראשי - סיכום של הכל במקום אחד.**

**שורה עליונה - StatCards (6 קארדים):**

| קארד | ערך | אייקון |
|------|-----|--------|
| Total P&L | סה"כ רווח/הפסד ($) | TrendingUp/Down |
| Win Rate | אחוז הצלחה (%) | Target |
| Total Trades | מספר עסקאות | Activity |
| Best Strategy | האסטרטגיה הכי רווחית | Award |
| Daily P&L | רווח/הפסד יומי ($) | Calendar |
| Open Trades | טריידים פתוחים כרגע | Clock |

**גרפים:**
- **Equity Curve** (Recharts AreaChart) - P&L מצטבר לאורך זמן, סינון: 7D / 30D / 90D / YTD / ALL
- **Win Rate by Strategy** (Recharts BarChart) - השוואת Win Rate בין אסטרטגיות
- **R:R Chart** - גרף R:R לאורך זמן
- **Winrate Chart** - גרף Winrate לאורך זמן
- **Heatmap יומי** - ביצועים לפי יום בשבוע/שעה
- **Drawdown Chart** - גרף Drawdown לאורך זמן
- **התפלגות לפי אסטרטגיה** (PieChart)

**טבלאות:**
- **עסקאות אחרונות** - 5 עסקאות אחרונות עם pair, direction, P&L, date
- **DCA Summary** - סיכום תוכניות פעילות: coin, avg price, total invested, current P&L

**Filters:** תקופה (7D / 30D / 90D / YTD / ALL)

### 6.3 Trade Journal (`/journal`)
**יומן המסחר המלא.**

**Header:** כפתור "+ הוספת עסקה" + ייבוא מבורסה

**Filters Bar:**
- מטבע (dropdown multi-select)
- אסטרטגיה (dropdown multi-select)
- כיוון (Long / Short / All)
- סוג שוק (Futures / Spot / All)
- תוצאה (Win / Loss / BE / All)
- סטטוס (פתוח / סגור / All)
- תאריך (from - to)
- חיפוש חופשי (בהערות)

**תצוגה:**
- **Desktop:** טבלה עם עמודות: Date, Pair, Direction, Type, Entry, Exit, P&L, P&L%, R:R, Strategy, Status, Actions
- **Mobile:** כרטיסים (TradeCard) עם swipe actions

**TradeForm (Modal) - שדות:**
```
┌─────────────────────────────────────────┐
│ הוספת עסקה חדשה                    [X] │
├─────────────────────────────────────────┤
│ Pair:        [BTCUSDT     ▼]           │
│ Direction:   [Long] [Short]             │
│ Market:      [Futures] [Spot]           │
│ Strategy:    [SOS            ▼]         │
│ Timeframe:   [4H             ▼]         │
│                                         │
│ Entry Price: [________]                 │
│ Exit Price:  [________]                 │
│ Stop Loss:   [________]                 │
│ Take Profit: [________]                 │
│                                         │
│ Quantity:    [________]                 │
│ Leverage:    [10x         ▼]           │
│ Fees:        [________]                 │
│                                         │
│ Entry Date:  [📅 ________]             │
│ Exit Date:   [📅 ________]             │
│                                         │
│ Entry Reason:[________________________] │
│ Tags:        [+ Add tag]               │
│ Screenshots: [📎 Upload]               │
│ Notes:       [________________________] │
│                                         │
│ ─── פסיכולוגיה ───                      │
│ Emotion Before: [Confident ▼]          │
│ Emotion After:  [________  ▼]          │
│ Mistakes:       [☐ Early Exit] [☐ ...]  │
│                                         │
│ ─── חישוב אוטומטי ───                  │
│ P&L:      +$249.95 (+3.85%)            │
│ R:R:      1:1.92                        │
│ Net P&L:  +$236.95 (after fees)        │
│                                         │
│        [Cancel]  [Save Trade]           │
└─────────────────────────────────────────┘
```

**חישובים אוטומטיים (`utils/calculations.js`):**
```javascript
// P&L for Long
pnl = (exitPrice - entryPrice) * quantity

// P&L for Short
pnl = (entryPrice - exitPrice) * quantity

// P&L Percent
pnlPercent = (pnl / (entryPrice * quantity)) * 100

// Risk:Reward
risk = Math.abs(entryPrice - stopLoss)
reward = Math.abs(exitPrice - entryPrice)
rrRatio = reward / risk

// Net P&L
netPnl = pnl - fees

// Result
result = pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven"

// --- סטטיסטיקות מצטברות ---

// Win Rate
winRate = (wins / totalTrades) * 100

// Profit Factor
profitFactor = totalGross Profit / totalGrossLoss

// Expectancy
expectancy = (winRate * avgWinRR) - ((1 - winRate) * avgLossRR)

// Drawdown (Max)
// מחושב על ה-Equity Curve - ההפרש הגדול ביותר בין שיא לשפל

// Sharpe Ratio
sharpe = (avgReturn - riskFreeRate) / stdDevReturns

// Average R:R
avgRR = sum(allRR) / totalTrades

// Win/Loss Streaks
// ספירה רצופה של wins/losses
```

### 6.4 Backtest Tracker (`/backtest`)
**מעקב בק-טסטים לפי אסטרטגיה.**

**Header:** כפתור "+ בק-טסט חדש"

**תצוגה עליונה - Strategy Cards:**
כרטיס לכל אסטרטגיה עם:
- שם האסטרטגיה
- מספר בק-טסטים
- Win Rate
- Average R:R
- Expectancy
- מיני-גרף של תוצאות אחרונות

**BacktestForm - שדות:**
- כמו TradeForm אבל: בלי leverage ו-fees
- יש שדה "Planned R:R" (מה תכננתי) vs "Actual R:R" (מה קרה)
- יש שדה "Backtest Date" (מתי עשיתי את הבק-טסט)

**אפשרויות נוספות:**
- יצירת סדרת טריידים (batch)
- סימולציה
- חישוב אוטומטי
- השוואה בין אסטרטגיות

**Strategy Compare - טבלת השוואה:**

| Strategy | Tests | Win Rate | Avg R:R | Expectancy | Best Pair |
|----------|-------|----------|---------|------------|-----------|

**Equity Curve:** גרף הון מצטבר לכל אסטרטגיה

### 6.5 DCA Tracker (`/dca`)
**מעקב תוכניות Dollar Cost Averaging.**

**Header:** כפתור "+ תוכנית DCA חדשה"

**DCA Cards - כרטיס לכל מטבע:**
- שם המטבע + לוגו
- סה"כ מושקע ($)
- כמות מטבעות
- מחיר ממוצע
- מחיר נוכחי (live מ-API)
- P&L נוכחי ($ + %)
- ROI
- גרף מיני של היסטוריית רכישות
- סטטוס: Active / Paused / Completed
- חלוקה לפי מטבע (PieChart)

**DCAForm:**
```
┌─────────────────────────────────────────┐
│ תוכנית DCA חדשה                   [X]  │
├─────────────────────────────────────────┤
│ Coin:        [BTC          ▼]          │
│ Frequency:   [Weekly       ▼]          │
│ Amount:      [$100_________]           │
│ Target Price: [________] (אופציונלי)   │
│ Notes:       [________________________] │
│                                         │
│        [Cancel]  [Create Plan]          │
└─────────────────────────────────────────┘
```

**הוספת Entry ל-DCA קיים:**
```
┌─────────────────────────────────────────┐
│ רכישה חדשה - BTC                  [X]  │
├─────────────────────────────────────────┤
│ Date:        [📅 ________]             │
│ Amount ($):  [100__________]           │
│ Price:       [97500________]           │
│ Source:      [Manual] [Bybit] [MEXC]   │
│                                         │
│ ─── חישוב ───                           │
│ Coins bought: 0.001026 BTC             │
│ New avg price: $97,125.00              │
│                                         │
│        [Cancel]  [Add Entry]            │
└─────────────────────────────────────────┘
```

### 6.6 Strategy Manager (`/strategies`)
**ניהול אסטרטגיות מסחר.**

**אפשר להגדיר לכל אסטרטגיה:**
- Strategy name
- חוקי כניסה/יציאה
- שוק (Futures / Spot)
- טיימפריימים
- Risk per trade (%)
- R:R target

כל טרייד משויך לאסטרטגיה, והמערכת מראה:
- איזו אסטרטגיה רווחית
- איזו מפסידה
- סטטיסטיקות מפורטות לכל אסטרטגיה

**אסטרטגיות מובנות מראש (TradeOS):**
1. **SOS (Sign of Strength)** - Flight strategy
2. **SOW (Sign of Weakness)** - Reverse flight
3. **Trendline Break** - Wing break
4. **היצע וביקוש** - Supply & Demand
5. **Wyckoff** - Accumulation/Distribution
6. **AMD** - Accumulation-Manipulation-Distribution
7. **Order Block** - OB entry
8. **Heikin Ashi** - HA strategy
9. **Custom** - אסטרטגיה מותאמת אישית

### 6.7 Advanced Analytics (`/analytics`)
**ניתוח ביצועים מתקדם.**

**סטטיסטיקות:**
- Win streak / Lose streak
- Average hold time
- Best pair / Worst pair
- Session performance (Asia / London / NY)
- Monthly P&L breakdown
- Profit Factor per strategy

**פסיכולוגיה:**
- רגש לפני טרייד (tracking)
- רגש אחרי טרייד (tracking)
- טעויות נפוצות (pattern recognition)
- קורלציה בין רגש לתוצאה

### 6.8 Notes (`/notes`)
**מערכת הערות וסיכומים.**
- הערות יומיות
- סיכום שבועי
- סיכום חודשי
- סיכום שוק (market overview)

### 6.9 Exchange Settings (`/settings/exchange`)
**חיבור API לבורסות.**

**Bybit:**
- שדות: API Key, API Secret
- כפתור "Test Connection"
- סטטוס: Connected / Disconnected
- הערה: "Use read-only API keys only!"

**MEXC:** אותו הדבר

**Import Trades:**
- בחירת בורסה
- בחירת תקופה (Last 7 days, 30 days, 90 days, Custom)
- כפתור "Import"
- Preview של עסקאות שנמצאו לפני ייבוא
- סימון כפילויות (עסקאות שכבר קיימות)

---

## 7. Exchange API Integration

### 7.1 Bybit v5 API
```
Base URL: https://api.bybit.com
Auth: HMAC-SHA256 signature

Endpoints:
GET /v5/position/closed-pnl     # עסקאות סגורות (Futures)
GET /v5/order/history           # היסטוריית הזמנות
GET /v5/account/wallet-balance  # יתרה

Headers:
X-BAPI-API-KEY: {apiKey}
X-BAPI-TIMESTAMP: {timestamp}
X-BAPI-SIGN: {signature}
X-BAPI-RECV-WINDOW: 5000
```

### 7.2 MEXC v3 API
```
Base URL: https://api.mexc.com
Auth: HMAC-SHA256 signature

Endpoints:
GET /api/v3/myTrades            # עסקאות (Spot)
GET /api/v3/allOrders           # כל ההזמנות
GET /api/v3/account             # מידע חשבון

Query params:
timestamp={timestamp}&signature={signature}
Header: X-MEXC-APIKEY: {apiKey}
```

### 7.3 CORS Proxy
```
Browser → Firebase Cloud Function (proxy) → Exchange API
```
אפשרות נוספת: Cloudflare Worker כ-proxy.

---

## 8. עיצוב (Design System)

### 8.1 צבעים
```css
/* Background */
--bg-primary: #0a0a0f;        /* רקע ראשי - שחור עמוק */
--bg-secondary: #12121a;      /* כרטיסים, sidebar */
--bg-tertiary: #1a1a2e;       /* inputs, hover states */

/* Borders */
--border-primary: #1e1e2e;
--border-hover: #2a2a3e;

/* Text */
--text-primary: #f0f0f0;
--text-secondary: #a0a0b0;
--text-muted: #606070;

/* Accent (Light Blue) */
--accent-primary: #38bdf8;     /* sky-400 */
--accent-hover: #0ea5e9;       /* sky-500 */
--accent-muted: #0284c7;       /* sky-600 */

/* Status */
--color-profit: #22c55e;       /* green-500 - רווח */
--color-loss: #ef4444;         /* red-500 - הפסד */
--color-breakeven: #f59e0b;    /* amber-500 - BE */
--color-long: #22c55e;         /* green for long */
--color-short: #ef4444;        /* red for short */
```

**תמה:** Dark theme כברירת מחדל. שחור + כחול בהיר. חד ונקי.

### 8.2 טיפוגרפיה
```css
font-family: 'Inter', sans-serif;

/* Sizes */
--text-xs: 0.75rem;    /* 12px - labels */
--text-sm: 0.875rem;   /* 14px - secondary text */
--text-base: 1rem;     /* 16px - body */
--text-lg: 1.125rem;   /* 18px - subheadings */
--text-xl: 1.25rem;    /* 20px - card titles */
--text-2xl: 1.5rem;    /* 24px - page titles */
--text-3xl: 1.875rem;  /* 30px - big numbers */
```

### 8.3 Components
```css
/* Cards */
border-radius: 12px (rounded-xl);
background: var(--bg-secondary);
border: 1px solid var(--border-primary);
padding: 24px;

/* Buttons - Primary */
background: var(--accent-primary);
color: #000;
border-radius: 8px;
padding: 8px 16px;
font-weight: 600;

/* Buttons - Secondary */
background: transparent;
border: 1px solid var(--border-primary);
color: var(--text-primary);

/* Inputs */
background: var(--bg-tertiary);
border: 1px solid var(--border-primary);
border-radius: 8px;
color: var(--text-primary);
padding: 8px 12px;
focus: border-color: var(--accent-primary);

/* Modal */
background: var(--bg-secondary);
border-radius: 16px;
backdrop: rgba(0, 0, 0, 0.7);
max-width: 600px;
```

### 8.4 Responsive Breakpoints
```css
/* Mobile first */
sm: 640px    /* Small tablets */
md: 768px    /* Tablets */
lg: 1024px   /* Desktop */
xl: 1280px   /* Large desktop */
```

### 8.5 Layout
```
Desktop (lg+):
┌──────┬──────────────────────────────┐
│      │ Header                       │
│ Side │──────────────────────────────│
│ bar  │                              │
│      │ Content                      │
│      │                              │
│      │                              │
└──────┴──────────────────────────────┘

Mobile (<lg):
┌──────────────────────────────────────┐
│ Header                               │
│──────────────────────────────────────│
│                                      │
│ Content                              │
│                                      │
│──────────────────────────────────────│
│ 🏠  📊  📝  💰  ⚙️   Bottom Nav    │
└──────────────────────────────────────┘
```

---

## 9. Navigation

### Desktop (Sidebar):
```
┌─────────────────┐
│ 🔷 TradeOS    │
│                 │
│ 📊 Dashboard    │
│ 📝 Trade Journal│
│ 🔬 Backtesting  │
│ 💰 DCA Tracker  │
│ 🎯 Strategies   │
│ 📈 Analytics    │
│ 📓 Notes        │
│                 │
│ ─────────────── │
│ ⚙️  Settings    │
│ 🔗 Exchange     │
│ 🚪 Logout       │
│                 │
│ ─────────────── │
│ 📊 Quick Stats  │
│ Win Rate: 62%   │
│ Today P&L: +$45 │
└─────────────────┘
```

### Mobile (Bottom Nav):
```
[ 📊 Home ] [ 📝 Journal ] [ ➕ ] [ 🔬 Backtest ] [ 💰 DCA ]
```
הכפתור "+" באמצע פותח TradeForm ישירות.

---

## 10. מטבעות מובנים

```javascript
const COINS = [
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "SOL", name: "Solana" },
  { symbol: "AVAX", name: "Avalanche" },
  { symbol: "BNB", name: "BNB" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "ADA", name: "Cardano" },
  { symbol: "XRP", name: "Ripple" },
  // + אפשרות הוספת מטבעות custom
];
```

---

## 11. שלבי פיתוח

### Phase 1 - בסיס (MVP)
**יעד: אתר עובד עם Login ויומן מסחר**
1. Init Vite + React + Tailwind + React Router
2. Firebase project setup (Auth + Firestore)
3. Layout component (Sidebar + Header + responsive)
4. LoginPage + ProtectedRoute + AuthContext
5. TradeJournal + TradeForm + TradeCard + TradeTable
6. חישובי P&L אוטומטיים
7. Dashboard בסיסי עם StatCards
8. Deploy ל-Firebase Hosting

### Phase 2 - הרחבה
**יעד: כל הפיצ'רים העיקריים עובדים**
9. BacktestTracker + BacktestForm + BacktestStats
10. DCATracker + DCAForm + DCASummary
11. Recharts גרפים (Equity Curve, Win Rate, Strategy Compare, Heatmap)
12. TradeFilters מתקדם
13. Strategy Manager
14. תמונות מסך (Firebase Storage)
15. Export to CSV/Excel

### Phase 3 - חיבור בורסות + אנליטיקס
**יעד: ייבוא אוטומטי + ניתוח מתקדם**
16. Firebase Cloud Function כ-proxy
17. Bybit API integration
18. MEXC API integration
19. ייבוא עסקאות + זיהוי כפילויות
20. מחירים חיים ל-DCA
21. Advanced Analytics page
22. Psychology Tracker
23. Notes system

### Phase 4 - Polish + PWA
24. PWA support (offline, install)
25. Dark/Light theme toggle
26. Notifications (trade reminders)
27. Performance optimization
28. Testing

### Phase 5 - Web3 (עתידי)
29. חיבור ארנק (MetaMask, WalletConnect)
30. אימות טריידים on-chain
31. שמירת טריידים בבלוקצ'יין
32. NFT של סטטיסטיקות
33. שיתוף ביצועים + Leaderboard

### Phase 6 - Multi-user (עתידי)
34. מערכת הרשאות (רגיל / PRO / קרן / קבוצה)
35. מספר משתמשים
36. קבוצות מסחר
37. AI ניתוח טריידים + זיהוי טעויות + המלצות
38. סושיאל: שיתוף טרייד, דירוג

---

## 12. Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "firebase": "^10.7.0",
    "recharts": "^2.10.0",
    "lucide-react": "^0.294.0",
    "date-fns": "^3.0.0",
    "react-hot-toast": "^2.4.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

---

## 13. Environment Variables

```bash
# .env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=tradeos-91a58.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 14. ישויות מרכזיות (Data Model Summary)

| ישות | תיאור | Collection |
|------|--------|-----------|
| User | פרופיל משתמש + הגדרות | `users/{userId}` |
| Trade | עסקה בפועל | `users/{userId}/trades/{tradeId}` |
| Backtest | בק-טסט | `users/{userId}/backtests/{backtestId}` |
| DCA | תוכנית DCA | `users/{userId}/dca/{dcaId}` |
| Strategy | אסטרטגיית מסחר | `users/{userId}/strategies/{strategyId}` |
| Note | הערה/סיכום | `users/{userId}/notes/{noteId}` |

---

*מסמך איפיון זה מהווה את ה-Source of Truth לפרויקט TradeOS. כל שינוי במפרט צריך לעדכן את המסמך הזה.*

**מפתח:** אברהם ניאזוב | **גרסה:** 2.0 | **עודכן:** 9 מרץ 2026
