import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, ChevronDown, Percent, Scale, Brain, Wallet, Trophy, ShieldAlert } from 'lucide-react';

// Short explainers for the concepts the rest of the page assumes you know.
// Deliberately concrete: every card ends with what it means for YOUR decision.
const CARDS = [
  {
    icon: Scale,
    title: 'מה זה בכלל שוק חיזוי?',
    body: 'שוק שבו קונים ומוכרים "מניות" של תוצאה. מניה משלמת $1 אם התוצאה קרתה, ו-$0 אם לא. לכן המחיר עצמו הוא ההסתברות שהשוק מתמחר: מניה ב-40¢ = השוק אומר 40% סיכוי.',
    takeaway: 'אתה לא מהמר על יחס — אתה קונה הסתברות במחיר. השאלה היחידה: המחיר גבוה או נמוך מהאמת שלך?',
  },
  {
    icon: Percent,
    title: 'המתמטיקה של האמת',
    body: 'קנייה ב-40¢ מחזירה $1 אם צדקת — פי 2.5 על הכסף. כדי לצאת באפס לאורך זמן אתה צריך לצדוק ב-40% מהמקרים. מעל זה = רווח, מתחת = הפסד, גם אם "הרגשת בטוח".',
    takeaway: 'המחיר הוא סף-ההצלחה שלך. אל תשאל "האם זה יקרה" אלא "האם זה יקרה יותר מ-40% מהפעמים".',
  },
  {
    icon: Trophy,
    title: 'למה רווח גולמי משקר',
    body: 'ארנק שהרוויח $450K יכול להיות גאון או בר-מזל שהימר פעם אחת בגדול. ארנק עם 180 שווקים סגורים ו-68% הצלחה שהרוויח אותו סכום — זה כישרון.',
    takeaway: 'לכן הדירוג כאן לפי יעילות (רווח לכל $ מחזור), לא לפי רווח גולמי. מזל לא חוזר על עצמו.',
  },
  {
    icon: Wallet,
    title: 'נזילות וספרד — למה זה מכריע',
    body: 'בשוק דליל יש פער גדול בין מחיר הקנייה למכירה, והכניסה עצמה מזיזה את המחיר נגדך. אתה עלול "לצדוק" ועדיין להפסיד רק מהעלות של להיכנס ולצאת.',
    takeaway: 'רצפת נזילות באסטרטגיה היא לא קישוט — היא ההגנה על התשואה. בשוק דליל, פקודת לימיט בלבד.',
  },
  {
    icon: Brain,
    title: 'הפסיכולוגיה',
    body: 'שווקי חיזוי מדביקים אותך לחדשות — כל כותרת מרגישה כמו סיבה לפעול. הסכנה האמיתית היא לא הפסד בודד, אלא רצף החלטות רגשיות אחרי הפסד.',
    takeaway: 'האסטרטגיה קיימת כדי להחליט מראש. אם עסקה לא עוברת את הכללים שלך — היא לא עסקה, גם אם היא מפתה.',
  },
  {
    icon: ShieldAlert,
    title: 'ניהול תקציב',
    body: 'התוצאה בינארית: 100% מהסכום או 0. גם הימור עם 80% סיכוי נכשל 1 מ-5 פעמים — ורצף של שלושה כישלונות כאלה הוא לגמרי נורמלי סטטיסטית.',
    takeaway: 'קבע אחוז קבוע וקטן לכל פוזיציה, לפני שאתה מסתכל על השוק. גודל הפוזיציה הוא ההחלטה שמחזיקה אותך בחיים.',
  },
];

function Card({ c, isOpen, onToggle }) {
  const { icon: Icon } = c;
  return (
    <div className={`rounded-xl border transition-colors ${isOpen ? 'border-accent-primary/40 bg-accent-primary/[0.05]' : 'border-border-primary bg-bg-secondary'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-right cursor-pointer">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isOpen ? 'bg-accent-primary/15 text-accent-primary' : 'bg-bg-tertiary text-text-muted'}`}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="text-xs font-bold text-text-primary flex-1 truncate">{c.title}</span>
        <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2">
              <p className="text-xs text-text-secondary leading-relaxed">{c.body}</p>
              <p className="text-[11px] text-accent-primary leading-relaxed border-r-2 border-accent-primary/40 pe-2 ps-2">
                <span className="font-bold">בשורה התחתונה: </span>{c.takeaway}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Academy strip — collapsed by default so it never competes with the data.
export default function AcademyCards() {
  const [openIdx, setOpenIdx] = useState(null);
  const [show, setShow] = useState(false);

  return (
    <section className="mt-5">
      <button onClick={() => setShow((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-bg-secondary/60 border border-border-primary text-right cursor-pointer hover:border-accent-primary/30 transition-colors">
        <GraduationCap className="w-4 h-4 text-accent-primary shrink-0" />
        <span className="text-sm font-bold text-text-primary">איך קוראים את הלוח הזה</span>
        <span className="text-[11px] text-text-muted hidden sm:inline">— 6 מושגים שכל מה שכאן נשען עליהם</span>
        <ChevronDown className={`w-4 h-4 text-text-muted ms-auto shrink-0 transition-transform ${show ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {show && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {CARDS.map((c, i) => (
                <Card key={c.title} c={c} isOpen={openIdx === i} onToggle={() => setOpenIdx((cur) => (cur === i ? null : i))} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
