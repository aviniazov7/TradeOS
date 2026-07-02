import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ChevronRight, Clock, RotateCcw, Ban, Gift,
  Calculator, MessageCircle, Scale,
} from 'lucide-react';
import { PREMIUM_PRICING } from '../../utils/constants';
import { pageVariants, pageTransition } from '../../utils/animations';

// Cancellation & refund policy for TradeOS Premium. The concrete rules
// (14-day window, pro-rata deduction, monthly-rate charge on yearly refunds)
// follow the Israeli Consumer Protection Law for distance transactions.
// Prices are pulled from PREMIUM_PRICING so the page never drifts from the
// actual checkout prices.

const MONTHLY = PREMIUM_PRICING.monthly.price;
const YEARLY = PREMIUM_PRICING.yearly.price;

function Section({ Icon, title, children, tone = 'default' }) {
  const toneBorder = tone === 'good' ? 'border-profit/30' : tone === 'warn' ? 'border-amber-500/30' : 'border-border-primary';
  return (
    <div className={`bg-bg-secondary border ${toneBorder} rounded-2xl p-4 md:p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4.5 h-4.5 text-accent-primary shrink-0" />
        <h2 className="text-sm md:text-base font-bold text-text-primary">{title}</h2>
      </div>
      <div className="text-sm text-text-secondary leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

export default function RefundPolicyPage() {
  const navigate = useNavigate();

  // Worked examples — computed from the live prices so the numbers stay honest.
  const examples = [
    {
      case: `מנוי חודשי (₪${MONTHLY}) — ביטול אחרי יומיים`,
      rule: 'בתוך 14 יום — החזר בניכוי שימוש יחסי',
      refund: `₪${(MONTHLY - (MONTHLY / 30) * 2).toFixed(0)}`,
    },
    {
      case: `מנוי חודשי (₪${MONTHLY}) — ביטול אחרי 20 יום`,
      rule: 'אחרי 14 יום — אין החזר; הפרימיום נשאר עד סוף החודש ששולם',
      refund: '₪0',
    },
    {
      case: `מנוי שנתי (₪${YEARLY}) — ביטול אחרי שבוע`,
      rule: 'בתוך 14 יום — החזר בניכוי שימוש יחסי',
      refund: `₪${(YEARLY - (YEARLY / 365) * 7).toFixed(0)}`,
    },
    {
      case: `מנוי שנתי (₪${YEARLY}) — ביטול אחרי 3 חודשים`,
      rule: `אחרי 14 יום — החזר יחסי: החודשים שנוצלו מחויבים לפי התעריף החודשי (₪${MONTHLY})`,
      refund: `₪${YEARLY - 3 * MONTHLY}`,
    },
  ];

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="min-h-[calc(100vh-4rem)] px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-4">

        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary cursor-pointer">
          <ChevronRight className="w-4 h-4" /> חזרה
        </button>

        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-accent-primary/15 flex items-center justify-center mb-2">
            <Scale className="w-6 h-6 text-accent-primary" />
          </div>
          <h1 className="text-xl font-bold text-text-primary">מדיניות ביטולים והחזרים</h1>
          <p className="text-sm text-text-secondary mt-1">TradeOS Premium · עודכן לאחרונה: יולי 2026</p>
        </div>

        <Section Icon={ShieldCheck} title="כללי">
          <p>
            מנוי TradeOS Premium נמכר בשני מסלולים: <b className="text-text-primary">חודשי (₪{MONTHLY})</b> ו
            <b className="text-text-primary">שנתי (₪{YEARLY})</b>. התשלום הוא <b className="text-text-primary">חד-פעמי מראש</b> לתקופת
            המנוי — <b className="text-text-primary">אין חיוב חוזר אוטומטי</b> ואין הוראת קבע. בתום התקופה המנוי פשוט
            מסתיים, אלא אם בחרת לחדש.
          </p>
          <p>
            כל עוד סליקת אשראי באתר אינה פעילה, התשלום מתואם אישית (העברה בנקאית / ביט / אמצעי אחר שסוכם),
            ולכן גם החזר כספי מתבצע באותו אמצעי שבו שולם.
          </p>
        </Section>

        <Section Icon={MessageCircle} title="איך מבטלים">
          <p>
            שולחים בקשת ביטול דרך כפתור <b className="text-text-primary">"צור קשר"</b> באפליקציה (בעמוד הפרופיל) או
            בכל ערוץ שבו תואם התשלום. הביטול נכנס לתוקף <b className="text-text-primary">תוך 3 ימי עסקים</b> ממועד
            הבקשה, וההחזר (אם מגיע) מועבר <b className="text-text-primary">תוך 14 ימי עסקים</b> באותו אמצעי תשלום.
          </p>
        </Section>

        <Section Icon={Clock} title="ביטול בתוך 14 יום מהרכישה" tone="good">
          <p>
            בהתאם לחוק הגנת הצרכן (עסקת מכר מרחוק), בכל ביטול בתוך <b className="text-text-primary">14 יום</b> ממועד
            הרכישה תקבל החזר כספי, בניכוי <b className="text-text-primary">החלק היחסי של התקופה שכבר נוצלה</b> בלבד.
          </p>
          <ul className="list-disc pr-5 space-y-1">
            <li>מנוי חודשי: החזר = ₪{MONTHLY} פחות (₪{MONTHLY} ÷ 30 × מספר הימים שחלפו).</li>
            <li>מנוי שנתי: החזר = ₪{YEARLY} פחות (₪{YEARLY} ÷ 365 × מספר הימים שחלפו).</li>
            <li>לפנים משורת הדין — <b className="text-text-primary">לא נגבים דמי ביטול</b> (החוק מתיר עד 5% או ₪100, הנמוך מביניהם).</li>
          </ul>
        </Section>

        <Section Icon={RotateCcw} title="ביטול אחרי 14 יום" tone="warn">
          <ul className="list-disc pr-5 space-y-1">
            <li>
              <b className="text-text-primary">מנוי חודשי:</b> אין החזר על החודש הנוכחי — הפרימיום נשאר פעיל עד סוף
              התקופה ששולמה, ופשוט לא מתחדש.
            </li>
            <li>
              <b className="text-text-primary">מנוי שנתי:</b> ניתן לבטל בכל עת ולקבל החזר יחסי על התקופה שלא נוצלה.
              החודשים שכן נוצלו (כולל חודש שהתחיל) מחויבים לפי <b className="text-text-primary">התעריף החודשי המלא (₪{MONTHLY})</b>,
              והיתרה מוחזרת. אם סכום החיוב לפי התעריף החודשי עולה על מה ששולם — לא יגבה תשלום נוסף, אך לא יינתן החזר.
            </li>
            <li>עם ביצוע ההחזר, גישת הפרימיום מוסרת מהחשבון.</li>
          </ul>
        </Section>

        <Section Icon={Calculator} title="דוגמאות מחושבות">
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="text-text-muted border-b border-border-primary">
                  <th className="text-right py-2 pl-2 font-semibold">מקרה</th>
                  <th className="text-right py-2 pl-2 font-semibold">הכלל</th>
                  <th className="text-left py-2 font-semibold whitespace-nowrap">החזר</th>
                </tr>
              </thead>
              <tbody>
                {examples.map((ex) => (
                  <tr key={ex.case} className="border-b border-border-primary/50 last:border-0 align-top">
                    <td className="py-2 pl-2 text-text-primary">{ex.case}</td>
                    <td className="py-2 pl-2 text-text-secondary">{ex.rule}</td>
                    <td className="py-2 text-left font-bold text-profit whitespace-nowrap" dir="ltr">{ex.refund}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section Icon={Gift} title="קופונים, מתנות ותקופות ניסיון">
          <p>
            פרימיום שהתקבל <b className="text-text-primary">ללא תשלום</b> — קוד קופון, מתנה או הטבה — אינו מקנה החזר
            כספי, וניתן להפסיקו בכל עת. קופון שמומש אינו ניתן להעברה או להמרה לכסף.
          </p>
        </Section>

        <Section Icon={Ban} title="הבהרות">
          <ul className="list-disc pr-5 space-y-1">
            <li>המדיניות כפופה לחוק הגנת הצרכן, התשמ"א-1981 ולתקנותיו; בכל סתירה — הוראות החוק גוברות.</li>
            <li>TradeOS הוא כלי ניהול ותיעוד למסחר ואינו ייעוץ השקעות; אחריות ההחלטות היא על המשתמש בלבד.</li>
            <li>על כל תשלום נמסרת קבלה כדין.</li>
          </ul>
        </Section>

        <div className="text-center text-[11px] text-text-muted pt-1 pb-4">
          יש שאלה על המדיניות? פנה אלינו דרך "צור קשר" בעמוד הפרופיל ונשמח לעזור.
        </div>
      </div>
    </motion.div>
  );
}
