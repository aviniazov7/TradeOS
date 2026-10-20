# רשימת משימות לבעלים — TradeOS

> מה נשאר לך לעשות (לא קוד). לכל סעיף: מתי, איפה, ומה בדיוק ללחוץ.
> עודכן: 20.10.2026. כשמשהו נסגר — סמן V, ובקש מ-Claude לעדכן את `docs/NEXT.md` וה-README אם צריך.

---

## 0. אחרי המיזוג ל-main — הכתובת החדשה  ☐

**מה זה:** האתר החי הוא [https://tradeoslive.web.app](https://tradeoslive.web.app). המארח הישן `tradeos-91a58.web.app` מפנה אליו (301, שומר נתיב ופרמטרים). זה קורה רק במיזוג ל-`main`, לא במיזוג ל-`dev`.

**מה לוודא אחרי שהדיפלוי ל-main ירוק:**
1. `https://tradeoslive.web.app` נפתח, וההתחברות עם Google עובדת (כולל ב-PWA).
2. `https://tradeos-91a58.web.app/login?x=1` מגיע ל-`https://tradeoslive.web.app/login?x=1` (301).
3. אם בלוג של GitHub Actions כתוב `AUTHORIZED_DOMAINS=pending`: [Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/tradeos-91a58/authentication/settings) ← להוסיף `tradeoslive.web.app` ו-`tradeoslive.firebaseapp.com`.
4. ההתחברות עם Google רצה על `authDomain` `tradeoslive.web.app` (`https://tradeoslive.web.app/__/auth/handler`). המסך של Google מציג את tradeoslive. Hosting מגיש את `/__/auth/*` בעצמו; ה-rewrite של האפליקציה לא תופס את הנתיב הזה.

קישורי איפוס סיסמה ואימות אימייל נמשכים אוטומטית אל `tradeoslive.web.app` (`authDomain`). אין כתובת continue קבועה בקוד.

---

## 1. בעוד שבוע (בערך 16.10.2026) — בדיקת דיווחי CSP  ☐

**מה זה:** ההגנה על האתר (CSP) כרגע רק *מדווחת* ולא חוסמת. אם שבוע של שימוש אמיתי עבר בלי הפרות — מעבירים אותה לחסימה.

**איך בודקים:**
1. היכנס ל-[Cloudflare](https://dash.cloudflare.com) עם חשבון **האפליקציה** (`tradeos.app@gmail.com`).
2. **Workers & Pages ← trade-os ← Observability** (או Logs).
3. חפש: `CSP report`, טווח זמן: 7 ימים.

**מה עושים בתוצאה:**
- **אין תוצאות** → מעבירים לחסימה. כתוב ל-Claude: "תעביר את ה-CSP לחסימה".
  (טכנית: ב-`firebase.json` מחליפים את הערך של הכותרת `Content-Security-Policy` במדיניות המלאה שבכותרת `Content-Security-Policy-Report-Only`, מוחקים את ה-Report-Only, ומעדכנים את הבדיקה ב-`src/utils/hostingHeaders.test.js`.)
- **יש תוצאות** → כל שורה מראה `directive` (איזה סוג חסימה), `blocked` (איזה אתר נחסם) ו-`page` (באיזה דף). שלח אותן ל-Claude והוא יוסיף את הכתובת לרשימה המותרת, או יתקן את הקוד.

---

## 2. בעלים שני ב-Cloudflare  ☐

**למה:** ה-Workers של TradeOS יושבים בחשבון **האפליקציה**. אם החשבון הזה ננעל — אין גישה. ב-Firebase כבר יש שני בעלים (אושר 9.10).

**איך:**
1. היכנס ל-Cloudflare עם חשבון האפליקציה.
2. **Manage account ← Members ← Invite**.
3. כתובת: `aviniazov7@icloud.com`, תפקיד: **Super Administrator**.
4. פתח את ההזמנה במייל של החשבון האישי ואשר.
5. ב-README, בסעיף "Accounts, ownership & credentials", מעדכנים את השורה "Cloudflare … to be confirmed".

**בנוסף:** הפעל אימות דו-שלבי (2FA) בשני חשבונות ה-Google ובשני חשבונות Cloudflare.

---

## 3. מיקום ה-Firestore (לעורך הדין)  ☐

**למה:** עורך הדין ישאל באיזה אזור נשמר המידע (העברת מידע לחו"ל).

**איך:** [Firebase Console](https://console.firebase.google.com/project/tradeos-91a58/firestore) ← **Firestore Database** ← לשונית **Settings** (או ליד הכותרת "Data") ← רשום את ה-Location (למשל `eur3`, `nam5`).
כתוב את התשובה ל-Claude כדי שיוסיף אותה ל-`docs/legal/DATA_INVENTORY.md`.

---

## 4. האם אפשר למחוק את `tradeos-google-auth`  ☐

**מה זה:** Worker בחשבון Cloudflare **האישי** (`aviniazov7@icloud.com`). אף קובץ בפרויקט לא מפנה אליו — כנראה שארית.

**איך בודקים:**
1. Cloudflare, חשבון **אישי** ← **Workers & Pages ← tradeos-google-auth ← Metrics**.
2. טווח: 30 ימים. **0 בקשות** → בטוח למחוק (Settings ← Danger zone ← Delete).
3. יש בקשות → אל תמחק, ובדוק מי קורא לו.

---

## 5. תנאי שימוש ומדיניות פרטיות  ☐

**למה:** חובה (חוק הגנת הפרטיות, Google OAuth וחברות סליקה דורשים קישור). כרגע אין.

**איך:**
1. תן לעורך דין או למחולל מסמכים (למשל iubenda) את `docs/legal/DATA_INVENTORY.md` — שם כתוב בדיוק מה האפליקציה אוספת, ובסעיף 9 יש שאלות מוכנות לעורך הדין.
2. כשיש לך את הטקסטים, תדביק אותם ל-Claude. הוא יוסיף את הדפים `/terms` ו-`/privacy`, קישור בטופס ההרשמה ותיבת "קראתי ואני מסכים".

**מה חשוב שהטקסט יכלול:** שהאפליקציה כלי תיעוד ולא ייעוץ השקעות; אחריות על הפסדים; מפתחות API של בורסות (בקריאה בלבד, באחריות המשתמש); ביטול והחזרים (יש כבר דף מדיניות החזרים); שימוש אסור.

---

## 6. דומיין ושליחת מיילים אמיתיים  ☐

**המצב:** שירות המיילים (Resend) במצב בדיקה — הוא שולח **רק לבעלים**. כלומר גם **קבלות Premium ומיילי קופון** לא מגיעים לאף משתמש אחר, והקמפיין השיווקי לא יוצא.

**איך מתקנים:**
1. קנה דומיין (בערך 10$ לשנה).
2. [Resend](https://resend.com/domains) ← **Domains ← Add Domain** ← הוסף את רשומות ה-DNS שהם נותנים אצל חברת הדומיין ← המתן לאימות.
3. ב-GitHub: **Settings ← Secrets and variables ← Actions** — הגדר `MAIL_FROM_ADDRESS` (למשל `hello@הדומיין`) ו-`MAIL_FROM_NAME` (`TradeOS`). הפריסה הבאה תעדכן את ה-Worker.
4. בפאנל הניהול: בדוק עם **"בדיקה אליי"**. אחרי זה גם קמפיינים יצאו — אבל **רק למי שאישר דיוור** (מתג בפרופיל / תיבה בהרשמה).

(מפתח `UNSUBSCRIBE_SECRET` כבר הוגדר ב-Cloudflare.)

---

## 7. תשלומים אונליין  ☐

**המצב:** אין סליקה. Premium ניתן ידנית או בקופון. (`PAYMENTS_ENABLED = false`)

**איך:** פתח חשבון Grow (Meshulam) או Bit לעסקים. כשיש לך מפתחות, Claude מחבר: נקודת חיבור יחידה ב-`src/services/paymentService.js`, נקודת שרת ל-checkout ו-webhook, ומדליק את הדגל. המדריך כתוב בראש הקובץ.

---

## אופציונלי

- **בדיקת עמדת המסחר עם מפתחות אמיתיים** (פוזיציות ופקודות פתוחות מול בורסה). דורש מפתח בקריאה בלבד.
- **ספריית הגרפים הרשמית של TradingView** — מאפשרת לשמור ציורים ואינדיקטורים בתוך האפליקציה. דורשת הגשת בקשה: `docs/specs/tradingview-charting-library.md`.
- **סנכרון Binance** — דורש כתובת IP קבועה (כרגע CSV בלבד).
- **ערוץ התצוגה המקדימה `never`** ב-Firebase Hosting — לא נוצר על ידי Claude; אם אינו בשימוש אפשר למחוק (`firebase hosting:channel:delete never`).

---

## כללי עבודה חשובים (תזכורת)

- **כללי Firestore** נפרסים ידנית, **מתוך תיקיית הפרויקט**:
  `cd ~/Projects/TradeOS && firebase deploy --only firestore:rules --project tradeos-91a58`
- **סודות של Worker** מוסיפים דרך הדשבורד של Cloudflare של **חשבון האפליקציה** (Workers & Pages ← trade-os ← Settings ← Variables and Secrets) — **לא** מ-`wrangler` במחשב, שמחובר לחשבון האישי.
- **לא דוחפים ישר ל-`main`.** ענף ← PR ל-`dev` ← PR ל-`main`. הפירוט ב-`CLAUDE.md`.
- אם אתה פותח שיחה חדשה עם Claude: תבקש ממנו לקרוא קודם `docs/NEXT.md`, `CLAUDE.md` ו-`README.md`.

---

## מה כבר נעשה (להקשר)

דוח הבדיקה כולו תוקן ושוחרר (`docs/qa/TRADEOS_QA_REPORT.md`) · כללי Firestore נעולים ופורסמו · יומן מנטלי חסוי למנהלים · דיוור שיווקי רק בהסכמה עם קישור הסרה · מחיקת חשבון מלאה · התראת אירוע USD שעה לפני (מתג בחדשות) · CSP במצב דיווח עם איסוף דיווחים · README באנגלית · שני בעלים ב-Firebase · מפתח `UNSUBSCRIBE_SECRET` מוגדר.
