# מה נשאר לעשות — TradeOS

> קובץ המשכיות. נוסע עם ה-repo (בניגוד לזיכרון המקומי של קלוד קוד). מי שפותח
> חלון חדש / עובד ממחשב אחר — **קרא אותי קודם.** עדכן אותי כשמשהו נסגר.

**עדכון אחרון:** 26.7.2026 — שחרור שני לפרודקשן (PR #304).

---

## סטטוס נוכחי
שני שחרורים גדולים עלו לפרודקשן:
- **PR #295** (25.7): צבע כחול, כרטיס עסקה + נקודה לבנה, סוכן AI בבית, כרטיס
  ביצועים, תיקון מכסת KV, P&L נטו, אדמין קומפקטי + מכסות Cloudflare, נגישות,
  ניקוי ~1,000 שורות, מדריך גרסאות.
- **PR #304** (26.7, main = `d24b410`): תיקון עמלה כפולה Bybit (#297), refactor
  #216 (#298), 5 כרטיסי אדמין קומפקטיים (#300), כרטיס מודלים ומכסות AI (#301),
  ניתוח AI בטאב בקטסט + הסרת גרף TradingView (#302), כפתור נגישות ניטרלי (#303).

APP_VERSION נשאר **2.0.0** (לפי [docs/VERSIONING.md](VERSIONING.md) — שחרור
רגיל לא דורש bump).

---

## מה נשאר לעשות (התחל מכאן)

### 1. ✅ AI (TradeAI) — נפתר (27.7.2026)
אובחן דרך כלי `/admin/ai-test` שנבנה: (א) `gemini-2.5-flash` החזיר 404
"no longer available to new users" → הוחלף ל-`gemini-2.0-flash`. (ב) גם 2.0
מחזיר 429 "quota exceeded — check billing" (מכסת חינם אפסית). הבעלים בחר
להישאר **בחינם** → `GEMINI_ENABLED=false`, הכל רץ על **Groq** (עובד, חינמי).
**להחזרת Gemini בעתיד:** להפעיל billing על פרויקט Google ואז `GEMINI_ENABLED=true`.

### 2. ✅ עמלות Bybit — תוקן (26.7.2026)
היה באג: `closedPnl` של Bybit כבר **נטו** (אחרי עמלות), אבל האפליקציה
מתייחסת ל-`pnlFromExchange` כברוטו ומורידה עמלות שוב → הורדה כפולה
(עסקה של +$10.02 נטו הוצגה כ-+$6.45). אומת מול חשבון אמיתי (LDOUSDT).
**תיקון:** ה-Worker ממיר את הנטו לברוטו (`closedPnl + fees`) כדי לשמור על
החוזה הכלל-אפליקטיבי `netPnl = pnl - fees`. עסקאות קיימות מתוקנות אוטומטית
במשיכה מחדש (re-sync). PR שממתין למיזוג ל-dev.
**להמשך:** למשוך מחדש עסקאות Bybit ישנות כדי לתקן את התצוגה שלהן.

### 3. 🚧 מיגרציה מלאה ל-Supabase — התחילה (27.7.2026)
אבי אישר מעבר מלא. תוכנית-אב מדורגת: **[docs/redesign/supabase-migration-plan.md](supabase-migration-plan.md)**.
מצב: Supabase `tradeos` פעיל, 12 טבלאות+RLS ריקות. Auth = החלק הקשה (20 משתמשים
חיים). מתחילים משלב 1 (התאמת סכמה, בטוח) → שלב 2 (שכבת שירות) → ואז Auth+נתונים
בזהירות ובתיאום. **לא לגעת ב-Firebase החי עד אימות מלא ב-Supabase.**

### 4. 📦 נדחים (לא דחוף, post-release)
- ~~מיגרציה מלאה ל-Supabase~~ → ראה סעיף 3 (בתהליך).
  ראה [docs/redesign/00-master-plan.md](redesign/00-master-plan.md).
- ~~#216 dedup refactor~~ — ✅ **הושלם ונסגר** (PR #298): formatters/hooks/
  AICoachPanel אוחדו, אכיפת שכבת שירותים (אפס firebase/* מחוץ ל-services).
- ממצאי אודיט נוספים: בידוד מצב liquidation ב-MarketOverview, הפחתת כתיבות
  KV של ה-AI, blob של `usettings:ALL` בקנה מידה.

---

## תזכורת כללי עבודה (ראה גם CLAUDE.md)
- **מרג' רק ל-dev.** קידום ל-main = רק באישור מפורש של אבי.
- Author: `Avraham Niazov <aviniazov7@icloud.com>` — **בלי** third-party trailers.
- rules של Firestore נפרסים **ידנית**: `firebase deploy --only firestore:rules`.
- מעבר ממחשב אחר: `git clone` → `git checkout dev` → `npm install`.
