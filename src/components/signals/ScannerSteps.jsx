import { useState } from 'react';
import { Flag, Radar, BellRing, ChevronDown, Info } from 'lucide-react';

// The page used to be two disconnected sections — tag coins here, read setups
// there — with no statement of how one produces the other. They are one
// pipeline, so the numbering is not decoration: step 2 cannot happen without
// step 1, and step 3 is what step 2 produces.
const STEPS = [
  {
    n: 1,
    Icon: Flag,
    title: 'תייג מטבע',
    short: 'לונג או שורט',
    detail: 'המנוע לא סורק את כל השוק — הוא סורק רק מה שאתה מסמן. חפש מטבע, ותייג אותו בכיוון שאתה מנתח. בלי תיוג כיוון הוא לא נכנס לסריקה בכלל.',
  },
  {
    n: 2,
    Icon: Radar,
    title: 'המנוע סורק',
    short: 'כל 10 דקות, 3 טיימפריימים',
    detail: 'הסריקה רצה בצד השרת, גם כשהאפליקציה סגורה. היא מחפשת מבנה ויקוף: אזור צבירה או הפצה, ואז את נקודת הכניסה — LPS בלונג, LPSY בשורט.',
  },
  {
    n: 3,
    Icon: BellRing,
    title: 'מקבל התראה',
    short: 'כשנקודת הכניסה נשברת',
    detail: 'כשהתנאי מתקיים נשלחת התראה והסטאף מופיע למטה. אחרי שהוא נסגר — סמן 👍 או 👎. זה מה שמלמד את המנוע, וזה נשמר במאגר האימון בתחתית הדף.',
  },
];

/**
 * How the engine actually works, stated once at the top instead of implied by
 * two section headers. Collapsed by default — it is a reference, not something
 * to read on every visit.
 */
export default function ScannerSteps() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mb-6 rounded-2xl border border-border-primary bg-bg-secondary/50 overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border-primary">
        {STEPS.map((s) => (
          <div key={s.n} className="flex items-start gap-2.5 p-3.5 min-w-0">
            <span className="shrink-0 w-6 h-6 rounded-lg bg-accent-primary/12 border border-accent-primary/25 flex items-center justify-center text-[11px] font-bold text-accent-primary tabular-nums">
              {s.n}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <s.Icon className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                <h3 className="text-xs font-bold text-text-primary truncate">{s.title}</h3>
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">{s.short}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-accent-primary hover:text-accent-hover border-t border-border-primary transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <Info className="w-3 h-3" />
        {open ? 'סגור' : 'איך משתמשים בזה'}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border-primary p-4 space-y-3 bg-bg-secondary">
          {STEPS.map((s) => (
            <div key={s.n} className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-md bg-accent-primary/12 flex items-center justify-center text-[10px] font-bold text-accent-primary tabular-nums">
                {s.n}
              </span>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-text-primary">{s.title} — {s.short}</h4>
                <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">{s.detail}</p>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-text-muted leading-relaxed border-t border-border-primary pt-3">
            המנוע מסמן נקודת כניסה שתואמת מבנה ויקוף — הוא לא אומר לקנות או למכור, ולא מבטיח שהתנועה
            תימשך. ההחלטה, הסטופ והגודל הם שלך.
          </p>
        </div>
      )}
    </section>
  );
}
