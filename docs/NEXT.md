# מה נשאר לעשות — TradeOS

> קובץ המשכיות פנימי (עברית). סקירת המוצר באנגלית: [`README.md`](../README.md).
> מי שפותח חלון חדש קורא קודם את הקובץ הזה, ואז את [`CLAUDE.md`](../CLAUDE.md).
> לא רושמים כאן כתובות אימייל, שמות חשבונות אישיים, או פקודות להעלאת סודות.

**עדכון אחרון:** נובמבר 2026.

---

## שוחרר

- **דוח בדיקה (QA)** — אבטחה, באגים, ביצועים, נגישות. כל ממצא וה-PR שתיקן אותו:
  [`docs/qa/TRADEOS_QA_REPORT.md`](qa/TRADEOS_QA_REPORT.md).
- **פרטיות:** יומן מנטלי נעול למנהלים; דיוור שיווקי רק בהסכמה; מחיקת חשבון מלאה.
- **התראת אירוע USD חשוב שעה לפני** — מתג בדף חדשות ← יומן כלכלי.
- **ביצועים ונגישות:** דף ההתחברות שופר ב-Lighthouse.

## פתוח

| נושא | מה צריך | מי |
|---|---|---|
| **כתובת Hosting** | אחרי מיזוג ל-`main`: לוודא ש-`https://tradeoslive.web.app` חי ושההתחברות עם Google עובדת, ואז לכבות את אתר ברירת המחדל: `firebase hosting:disable --project tradeos-91a58 --site tradeos-91a58`. לא למחוק את `tradeos-91a58.firebaseapp.com` מהדומיינים המורשים. | בעלים |
| **CSP — מעבר מדיווח לחסימה** | אחרי שבוע של שימוש אמיתי: Observability של ה-Worker, חיפוש `CSP report`. אין הפרות → להחליף ב-`firebase.json` את `Content-Security-Policy-Report-Only` ל-`Content-Security-Policy` | בעלים |
| **תנאי שימוש ומדיניות פרטיות** | טקסט משפטי. אחר כך: `/terms`, `/privacy` וקישור בהרשמה. הקלט המוכן: [`docs/legal/DATA_INVENTORY.md`](legal/DATA_INVENTORY.md) | בעלים |
| **מיילים למשתמשים** | סוד שליחת הדואר מוגדר בדשבורד של חשבון Cloudflare של האפליקציה, או כ-secret של GitHub Actions. לא שומרים את הערך ואת שם התיבה בריפו. | בעלים |
| **תשלומים אונליין** | ספק סליקה; נקודת החיבור היחידה: `src/services/paymentService.js` (`PAYMENTS_ENABLED = false`) | בעלים |
| **סנכרון Binance** | דורש כתובת IP קבועה. עד אז: ייבוא CSV | — |
| **בדיקת עמדת המסחר** | פוזיציות ופקודות פתוחות מול בורסה, בקריאה בלבד | בעלים |
| **Cloudflare — מנהל גיבוי** | להוסיף מנהל שני בחשבון Cloudflare של האפליקציה (*Manage account → Members*). לא לרשום כתובת אישית בריפו. | בעלים |
| **מיקום Firestore** | Console ← Firestore ← Settings. נדרש למסמך המשפטי | בעלים |
| **ספריית הגרפים של TradingView** | הגשת בקשה (`docs/specs/tradingview-charting-library.md`) | בעלים |

## חוקי עבודה קצרים

- ענף → PR ל-`dev` → PR ל-`main`. לא דוחפים ל-`main`. פירוט ב-[`CLAUDE.md`](../CLAUDE.md).
- כללי Firestore נפרסים ידנית משורש הריפו:
  `firebase deploy --only firestore:rules --project tradeos-91a58`.
- סודות ל-Worker מוגדרים בדשבורד של חשבון האפליקציה או ב-CI. ערכים לא נכנסים ל-Git. השמות ב-README, בסעיף Secrets.
- בדיקות: `npm test`, `npm run test:rules`, `npm run build`.
- רשומות ב-[`CHANGELOG.md`](../CHANGELOG.md) נכתבות באנגלית.
