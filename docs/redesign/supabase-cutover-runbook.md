# Runbook: המעבר החי ל-Supabase (Cutover)

> להרצה **מבוקרת, פעם אחת, יחד עם אבי**, בחלון תחזוקה קצר (~10–20 דק').
> כל השלבים הבאים בטוחים כי הכל כבר בנוי ובדוק; זה רק ה"לחיצת כפתור".

## לפני שמתחילים — מה צריך ביד
1. **Firebase service-account JSON** (מ-Firebase console → Project settings →
   Service accounts → Generate new private key).
2. **Supabase service-role key** (מ-tradeos-prod → Settings → API Keys →
   `service_role` / `secret`). **סוד — לא לצ'אט, לא ל-git.**
3. גישה להגדיר את משתני הסביבה של ה-Worker + Firebase Hosting.

## השלבים

### 1. הודעת תחזוקה (אופציונלי, לנפח כזה כמעט לא צריך)
אפשר להודיע למשתמשים שתהיה הפסקה קצרה.

### 2. Dry-run (ללא כתיבה — בודק שהכל נקרא נכון)
```bash
export GOOGLE_APPLICATION_CREDENTIALS=./firebase-sa.json
export SUPABASE_URL=https://jzlbactamdjyzqjlfunr.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=***       # secret
node scripts/migrate-to-supabase.mjs --dry-run
```
בודקים שה-Summary מראה ~20 users + ספירות טריידים סבירות.

### 3. הרצת המעבר (כתיבה)
```bash
node scripts/migrate-to-supabase.mjs
```
- יוצר משתמשי Supabase לפי אימייל (מיפוי firebaseUid→supabaseUid).
- משתמשי Google → נכנסים עם Google (אותו אימייל). משתמשי סיסמה → מקבלים מייל
  איפוס סיסמה (Firebase scrypt לא נייד 1:1; לנפח קטן זו הדרך הפשוטה והבטוחה).
- מעביר את כל הנתונים דרך ה-mapper הבדוק.

### 4. אימות
ב-Supabase → Table Editor: לוודא שספירות ה-trades/journal_entries/profiles
תואמות ל-Firestore. אפשר גם:
```sql
select (select count(*) from profiles), (select count(*) from trades);
```

### 5. הדלקת ה-flag (Cutover)
מגדירים `VITE_USE_SUPABASE=true` (GitHub Secret / env של ה-Hosting build)
ומפרסמים ל-dev channel קודם → בדיקה עם משתמש אמיתי → ואז ל-main.
**מרגע זה האפליקציה קוראת/כותבת ל-Supabase.** Firebase נשאר לקריאה כגיבוי.

### 6. אחרי ~שבוע יציב
- לכבות כתיבות ל-Firebase, להסיר את שכבת ה-Firestore.
- Phase 6: להעביר את ה-Worker (אימות JWT + KV) ל-Supabase.

## Rollback (אם משהו לא טוב)
פשוט מחזירים `VITE_USE_SUPABASE=false` ומפרסמים — חוזרים ל-Firebase מיידית
(הנתונים שם עדיין שלמים). זו בדיוק הסיבה שלא מוחקים כלום מ-Firebase עד שבוע
של יציבות.

## ידועים לטיפול בעת ה-cutover
- `arrayUnion` (PendingLimitOrders — tpReached) — sentinel של Firestore; ל-Supabase
  צריך array_append. נקודתי, לטפל לפני/מיד אחרי הדלקת ה-flag.
- מחיקת חשבון תחת Supabase — דרך cascade על auth.users (server-side), לא דרך
  ה-client. לוודא לפני שמאפשרים מחיקה תחת ה-flag.
- ordering ב-subscribeToUserCollection מתעלם מ-options (האפליקציה ממיינת client-side).
