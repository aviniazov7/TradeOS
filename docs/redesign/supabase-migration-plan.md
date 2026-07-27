# תוכנית מיגרציה: Firebase → Supabase

> **סטטוס:** טיוטה לאישור (27.7.2026). מעבר מלא אושר ע"י אבי. זה מסמך-אב —
> כל שלב מתבצע ב-PR נפרד, נבדק, והפיך. **האפליקציה נשארת חיה לאורך כל הדרך.**

## בדיקת מציאות (חשוב לקרוא)
- **נתונים קטנים** — 20 משתמשים, ~121 טריידים, תשלום 1. זה הופך את מיגרציית
  ה**נתונים** לקלה יחסית (אפשר חלון תחזוקה קצר במקום dual-write מורכב).
- **החלק הקשה = Auth.** להעביר 20 משתמשים חיים מ-Firebase Auth ל-Supabase Auth
  בלי שאף אחד יינעל בחוץ. משתמשי Google צריכים re-link; ה-uid משתנה → צריך
  טבלת מיפוי `uid_firebase → uid_supabase`.
- **סיכון עיקרי:** אובדן נתונים או נעילת משתמשים. מיטיגציה: Firebase נשאר
  כגיבוי לקריאה עד שמוודאים 100% ב-Supabase; שום מחיקה ב-Firebase עד אישור סופי.

## מצב נוכחי (מה כבר בנוי)
**חשבון ייעודי חדש נוצר (27.7):** `tradeos.app@gmail.com` → ארגון "tradeos.app's Org"
(נפרד מ-Backtest Crypto האישי, כדי לא להתנגש במגבלת 2 פרויקטים חינמיים).
- ✅ **פרויקט פרוד: `tradeos-prod`, ref `jzlbactamdjyzqjlfunr`**, eu-central-1 (Frankfurt),
  ACTIVE_HEALTHY. URL: `https://jzlbactamdjyzqjlfunr.supabase.co`.
- ✅ **שלב 1 בוצע** — 12 טבלאות + אינדקסים + RLS + 13 policies הוחלו (SQL מ-`supabase-schema.sql`).
  גם "automatic RLS trigger" פעיל (ביטוח לטבלאות עתידיות).
- ⚠️ הפרויקט הישן `tradeos` (mrgxbvsyiujqbvmtccbu, בארגון Backtest Crypto) — **נזנח**, ריק. אפשר למחוק.
- ✅ קליינט Supabase: `src/services/supabase.js` — **צריך לעדכן ל-URL+anon של הפרויקט החדש**.
- ❌ אין נתונים, אין Auth מוגדר, אין קוד-אפליקציה שקורא/כותב ל-Supabase.

**⚠️ הערת עבודה:** מחבר ה-Supabase (MCP) של Claude מחובר לחשבון האישי — **לא רואה** את
`tradeos-prod`. עבודת Supabase נעשית דרך Claude-בכרום (אוטומציית דפדפן) שמחובר לחשבון
החדש, או שאבי יחבר מחדש את המחבר ל-`tradeos.app@gmail.com`.

## מיפוי מודל הנתונים (Firestore → Supabase) — יש פערים
| Firestore | Supabase | סטטוס |
|---|---|---|
| `users/{uid}` (פרופיל) | `profiles` | ✅ |
| `users/{uid}/trades` | `trades` | ✅ |
| `users/{uid}/backtests` | `backtests` | ✅ |
| `users/{uid}/dca` | `dca_plans` | ✅ |
| `users/{uid}/strategies` | `strategies` | ✅ |
| `users/{uid}/signals` | `signals` | ✅ |
| `users/{uid}/watchlist` | `watchlist_items` | ✅ |
| `users/{uid}/morningJournals`+`eveningJournals` | `journal_entries` | 🟡 להתאים |
| `users/{uid}/journals`+`backtestJournals` | — | ❌ חסרה טבלה |
| `users/{uid}/tradingPlans` | — | ❌ חסרה טבלה |
| `users/{uid}/notes` | — | ❌ חסרה טבלה |
| `users/{uid}/processes` | — | ❌ חסרה טבלה |
| `users/{uid}/settings` | `profiles` (JSON) | 🟡 להחליט |
| `payments` (top-level) | — | ❌ חסרה טבלה |
| `leaderboard` (top-level) | — | ❌ (או מחושב) |
| `adminNotes` (top-level) | — | ❌ חסרה טבלה |
| creds בורסה (ב-KV מוצפן) | `exchange_connections` | 🟡 מקור = KV, לא Firestore |
| מנויי Push (ב-KV) | `push_subscriptions` | 🟡 מקור = KV |
| — | `ai_insights`, `discipline_snapshots` | 🟡 לא נשמרים היום ב-Firestore |

## שלבים (כל אחד PR נפרד, הפיך)

### שלב 1 — התאמת סכמה (בטוח, Supabase ריק)
להשלים את הטבלאות החסרות (journals, trading_plans, notes, processes, payments,
admin_notes) + RLS, ולהחליט על settings (JSON ב-profiles). אפס נגיעה בקוד חי.

### שלב 2 — שכבת שירות Supabase (בלי לחבר עדיין)
לכתוב `supabaseService.js` שמראה **בדיוק אותו API** כמו `firestoreService.js`
(subscribeToUserCollection/addToUserCollection/…) מעל Supabase. מאחורי feature
flag כבוי. האפליקציה ממשיכה על Firebase.

### שלב 3 — מיגרציית Auth (הקשה)
- להגדיר ספק Google + email ב-Supabase Auth.
- לייצא משתמשי Firebase (email/password: hashes scrypt → import ל-Supabase שתומך
  ב-firebase-scrypt; Google: re-link בכניסה הבאה).
- טבלת מיפוי `uid_firebase → uid_supabase` (קריטי לקישור הנתונים).

### שלב 4 — ETL נתונים (חלון תחזוקה קצר)
סקריפט חד-פעמי: קורא את כל Firestore, ממפה uid, כותב ל-Supabase. מוודא ספירות
(20 users / 121 trades / …) תואמות. Firebase נשאר לקריאה כגיבוי.

### שלב 5 — Cutover קוד (feature flag)
להדליק את ה-flag → hooks/components קוראים/כותבים ל-Supabase. Firebase לקריאה
בלבד. לבדוק היטב בפרוד עם משתמש אמיתי.

### שלב 6 — Worker + ניקוי
להעביר את אימות ה-Auth ב-Worker ל-Supabase JWT, ואת ה-KV לטבלאות רלוונטיות.
אחרי ~שבוע יציב — לכבות כתיבות ל-Firebase.

## אסטרטגיית Cutover מומלצת (בזכות הנתונים הקטנים)
**חלון תחזוקה קצר** (לא dual-write): מודיעים למשתמשים, מקפיאים כתיבות לכמה
דקות, מריצים ETL, מאמתים ספירות, מחליפים flag. פשוט ובטוח לנפח כזה.

## מאיפה מתחילים
**שלב 1 (התאמת סכמה)** — בטוח לגמרי (Supabase ריק, לא נוגע בחי). אחריו שלב 2
(שכבת שירות מקבילה). רק כששניהם מוכנים ובדוקים ניגשים ל-Auth+נתונים (3-4)
שדורשים זהירות ותיאום איתך.
