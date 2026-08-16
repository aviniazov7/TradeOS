import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, ChevronDown, Percent, Scale, Brain, Wallet, Trophy, ShieldAlert } from 'lucide-react';
import Modal from '../shared/Modal';

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

// Academy, in a modal: six explainers for the concepts the board assumes you
// know. One card open at a time so the modal never becomes a wall of text.
export default function AcademyModal({ isOpen, onClose }) {
  const [openIdx, setOpenIdx] = useState(0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="איך קוראים את הלוח הזה" maxWidth="max-w-lg"
      title={(
        <span className="inline-flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-accent-primary" />
          <span className="font-bold text-text-primary">איך קוראים את הלוח הזה</span>
        </span>
      )}>
      <div className="space-y-2">
        <p className="text-[11px] text-text-muted leading-relaxed">
          שישה מושגים שכל מה שבעמוד נשען עליהם. כל אחד נגמר במה שזה אומר להחלטה שלך.
        </p>
        {CARDS.map((c, i) => (
          <Card key={c.title} c={c} isOpen={openIdx === i} onToggle={() => setOpenIdx((cur) => (cur === i ? null : i))} />
        ))}
      </div>
    </Modal>
  );
}
