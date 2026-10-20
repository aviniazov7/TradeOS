# מה נשאר לעשות — TradeOS

> קובץ המשכיות. נוסע עם ה-repo (בניגוד לזיכרון המקומי של קלוד קוד). מי שפותח
> חלון חדש / עובד ממחשב אחר — **קרא אותי קודם.** עדכן אותי כשמשהו נסגר.

**עדכון אחרון:** 9.10.2026 — כל מה שמופיע ב"שוחרר" נמצא בפרודקשן (גרסת cache v320).

---

## שוחרר השבוע
- **דוח בדיקה (QA) מלא** — אבטחה, באגים, ביצועים, נגישות. כל ממצא וה-PR שתיקן אותו:
  [`docs/qa/TRADEOS_QA_REPORT.md`](qa/TRADEOS_QA_REPORT.md).
- **פרטיות:** יומן מנטלי נעול למנהלים; דיוור שיווקי רק בהסכמה (תיבה בהרשמה + מתג
  בפרופיל, "פרסומת:" בנושא, קישור הסרה); מחיקת חשבון מלאה (כולל הערות מנהל, קישור
  תשלומים, סימוני קופון ומטמון במכשיר).
- **התראת אירוע USD חשוב שעה לפני** — מתג בדף חדשות ← יומן כלכלי, שם האירוע בעברית.
- **עמדת מסחר** (מסך מפוצל של TradingView) ופיצ'רים נוספים — ראו ה-README.
- **ביצועים:** דף ההתחברות 60→89 (Lighthouse), נגישות 100.

## פתוח

> 📋 **הפירוט המלא, צעד אחר צעד:** [`OWNER_CHECKLIST.md`](OWNER_CHECKLIST.md)

| נושא | מה צריך | מי |
|---|---|---|
| **כתובת Hosting** | אחרי מיזוג ל-`main`: לוודא ש-`tradeoslive.web.app` חי, שהכתובת הישנה מפנה 301, וש-Google sign-in עובד. אם CI לא עדכן דומיינים מורשים — הצעדים ב-[`OWNER_CHECKLIST.md`](OWNER_CHECKLIST.md) סעיף 0 | בעלים |
| **CSP — מעבר מדיווח לחסימה** | בעוד שבוע: Cloudflare ← trade-os ← Observability, חיפוש `CSP report`. אין תוצאות → להחליף ב-`firebase.json` את `Content-Security-Policy-Report-Only` ל-`Content-Security-Policy` | בעלים |
| **תנאי שימוש ומדיניות פרטיות** | טקסט משפטי (עורך דין / מחולל). אחר כך: `/terms`, `/privacy` וקישור בהרשמה. הקלט המוכן: [`docs/legal/DATA_INVENTORY.md`](legal/DATA_INVENTORY.md) | בעלים |
| **מיילים אמיתיים למשתמשים** | דומיין משלך מחובר ל-Resend (כרגע מצב בדיקה — שולח רק לבעלים) | בעלים |
| **תשלומים אונליין** | חשבון Grow/Bit; נקודת החיבור היחידה: `src/services/paymentService.js` | בעלים |
| **סנכרון Binance** | דורש IP קבוע | — |
| **בדיקת עמדת המסחר עם מפתחות אמיתיים** | positions / open orders מול בורסה | בעלים |
| **Cloudflare — בעלים שני** | להוסיף את החשבון האישי כ-Super Administrator בחשבון האפליקציה (*Manage account → Members*) ולעדכן את ה-README | בעלים |
| **מיקום Firestore** | לבדוק ב-Console ← Firestore ← Settings (נדרש לעורך הדין) | בעלים |
| **Worker `tradeos-google-auth`** | יושב בחשבון Cloudflare האישי, אף קובץ ברפו לא מפנה אליו — לבדוק בדשבורד אם יש בו תנועה ואז למחוק | בעלים |
| **ספריית הגרפים של TradingView** | הגשת בקשה (ראו `docs/specs/tradingview-charting-library.md`) | בעלים |

## חוקי עבודה קצרים
- ענף → PR ל-`dev` → PR ל-`main`. לא דוחפים ל-`main`. פירוט ב-[`CLAUDE.md`](../CLAUDE.md).
- כללי Firestore נפרסים ידנית מתיקיית הפרויקט:
  `firebase deploy --only firestore:rules --project tradeos-91a58`.
- סודות ל-Worker מוסיפים דרך הדשבורד של חשבון **האפליקציה** ב-Cloudflare — לא
  מ-`wrangler` על המחשב (הוא מחובר לחשבון האישי). ראו README, "Accounts, ownership & credentials".
- בדיקות: `npm test`, `npm run test:rules`, `npm run build`.
