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
- ✅ קליינט Supabase: `src/services/supabase.js` — **עודכן** ל-`tradeos-prod`
  (URL `https://jzlbactamdjyzqjlfunr.supabase.co` + publishable key ציבורי).
  מפתחות מהדור החדש (`sb_publishable_...`). ה-secret key נשאר בדשבורד → GitHub Secrets בעתיד.
- ✅ 2 triggers נוספו: `trades_set_updated_at` (updated_at ב-UPDATE) +
  `on_auth_user_created` (יצירת profiles אוטומטית בהרשמה).
- ❌ אין נתונים, אין Auth מוגדר, אין קוד-אפליקציה שקורא/כותב ל-Supabase.

## ▶️ נקודת המשך (רזום) — הבא בתור
**שלב 2 — שלד נכתב (29.7):** `src/services/supabaseService.js` נוצר — CRUD גנרי
+ realtime (subscribe/add/update/delete/get) + profiles, מעל קליינט Supabase,
מאחורי `USE_SUPABASE` (VITE_USE_SUPABASE, כבוי). **⚠️ לא נבדק מול ה-DB החי** —
לאמת כל query כשמחברים את המחבר לחשבון החדש. ממופה 1:1 רק: trades, backtests,
strategies, signals, dca→dca_plans, watchlist→watchlist_items.
**מיפוי שדות — נבנה ונבדק (31.7):** `src/services/supabaseMap.js` — ממפה את
צורת האפליקציה (camelCase) לעמודות Postgres, עם `meta jsonb` שתופס כל שדה
long-tail (mistakes/mental/tags/chart urls) כך ששום מידע לא אובד. טבלת `trades`
הורחבה ל-16 עמודות חדשות + meta. supabaseService משתמש במיפוי.
**נבדק:** ✅ vitest (4 טסטים round-trip, `npm test`) + ✅ smoke test מול ה-DB האמיתי
(טרייד מלא נכנס/נקרא כולל tps ו-meta, נוקה). triggers/FK/cascade אומתו גם.
**✅ שכבת המיפוי הושלמה במלואה (1.8)** — `makeMapper(colMap, jsonKeys, fixed)`:
- trades/signals/strategies/backtests/dca — עמודות אמיתיות + meta.
- **משפחת ה-journal:** notes/tradingPlans/processes/morning+eveningJournals →
  `journal_entries` עם `kind` מבחין (מוזרק בכתיבה, מסונן בקריאה); journals/
  backtestJournals → טבלת `journals` חדשה עם `is_backtest`. שדות varied → meta.
- watchlist = pass-through.
- **supabaseService:** COLLECTION_FILTER + scopedSelect מסננים לפי kind/is_backtest.
- **17 טסטי vitest עוברים** + smoke tests מול DB לכל קבוצה (כולל אימות שההפרדה
  notes↔plans ו-journals↔backtestJournals עובדת) + advisors נקי.
**✅ שכבת פרופיל+הגדרות הושלמה (1.8):** profiles הורחבה (photo_url/last_active/
onboarding_completed/settings/meta); טבלת `user_settings` חדשה (mirror של
users/{uid}/settings/{docId}). supabaseService: getUserProfile/subscribeToUserProfile/
setUserProfile/touchLastActive/subscribeToUserSetting/setUserSetting + timestamp/
dateToTimestamp — כולם בחתימת firestoreService. 19 טסטי vitest + smoke test מול DB.
**נשאר (ה"מעבר החי"):**
1. **dataProvider facade** — לחבר את ה-hooks+AuthContext (Firebase/Supabase לפי flag).
   (חתימת subscribeToUserCollection צריכה 3rd arg `options` להתאמה — לטפל בעת החיבור.)
2. **מיגרציית 20 המשתמשים** (Firebase Auth → Supabase) + **ETL נתונים** — אירוע מתואם.
3. הדלקת flag → cutover.

**✅ מחבר ה-Supabase (MCP) חובר לחשבון החדש (31.7)** — Claude ניגש ישירות ל-`tradeos-prod`.
- **16 טבלאות** סה"כ: 12 המקוריות + `payments` (policy: own select) + `coupons` +
  `coupon_redemptions` + `admin_notes` (3 האחרונות ללא policy בכוונה — service-role/Worker בלבד).
- **הקשחת אבטחה הוחלה:** `set_updated_at` עם search_path קבוע; `handle_new_user` +
  `rls_auto_enable` — בוטלה חשיפתם ל-RPC. **advisors נקי** (נשארו רק 3 INFO על
  הטבלאות ה-service-role-only, שזה תקין ומכוון).

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
- ✅ **קוד נבנה (31.7):** `src/services/supabaseAuth.js` — שכבת auth מקבילה
  (login/register/google-oauth/logout/reset/onAuthChange/getCurrentUser),
  ממפה את user של Supabase לצורת Firebase (uid + getIdToken). מאחורי flag.
- ✅ **Google provider מופעל (31.7):** OAuth client נוצר ב-Google Cloud (בפרויקט
  הקיים tradeos-91a58, redirect `…/auth/v1/callback`), הופעל ב-Supabase tradeos-prod.
  Client ID (ציבורי): `80529278454-oap5gac47rqkjp9lfs51nc7ohi9k1am6.apps.googleusercontent.com`.
  Email מופעל כברירת מחדל.
- ✅ **URL Configuration הושלם (31.7):** Site URL = `https://tradeos-91a58.web.app`;
  Redirect URLs = הפרוד + `tradeos-91a58--*.web.app/**` (preview) + `localhost:5173/**`.
  **→ הגדרת ה-Auth בצד Supabase הושלמה במלואה** (Email + Google + URLs).
- ⏳ לייצא משתמשי Firebase (email/password: hashes scrypt → import ל-Supabase שתומך
  ב-firebase-scrypt; Google: re-link בכניסה הבאה).
- ⏳ טבלת מיפוי `uid_firebase → uid_supabase` (קריטי לקישור הנתונים).

### שלב 4 — ETL נתונים (חלון תחזוקה קצר)
סקריפט חד-פעמי: קורא את כל Firestore, ממפה uid, כותב ל-Supabase. מוודא ספירות
(20 users / 121 trades / …) תואמות. Firebase נשאר לקריאה כגיבוי.

### שלב 5 — Cutover קוד (feature flag)
- ✅ **facade + חיבור AuthContext (31.7):** `src/services/authProvider.js` בוחר
  Firebase/Supabase לפי `USE_SUPABASE`; AuthContext מייבא ממנו (flag כבוי → זהה
  ל-Firebase, אפס שינוי). `supabaseAuth` הושלם ל-API מלא (idToken/redirect/reauth/
  delete stubs).
- ⏳ **נשאר לפני שאפשר להדליק flag:** להחליף גם את שכבת ה**נתונים/פרופיל** ב-AuthContext
  ובכל ה-hooks (subscribeToUserProfile/getUserProfile/… → Supabase), אחרת flag דלוק
  ישבור טעינת פרופיל. + מיגרציית משתמשים + ETL נתונים.
- אז: להדליק flag → קריאה/כתיבה ל-Supabase, Firebase לקריאה בלבד, בדיקה בפרוד.

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
