import { Flag, Radar, BellRing, X } from 'lucide-react';

const STEPS = [
  { Icon: Flag, title: 'מתייגים מטבע', text: 'רק מטבעות שסומנו לונג או שורט נכנסים לסריקה.' },
  { Icon: Radar, title: 'המנוע סורק', text: 'כל 10 דקות בצד השרת: טריגר ב-30m, אישור מבנה ב-4h וב-1D.' },
  { Icon: BellRing, title: 'מתקבלת התראה', text: 'כשנמצאת נקודת כניסה (LPS / LPSY) היא נכנסת לרשימה. סימון תקין / לא תקין מאמן את המנוע.' },
];

// The pipeline in one compact strip. Shown until dismissed; the header's help
// button brings it back.
export default function ScannerHowItWorks({ onDismiss }) {
  return (
    <section aria-label="איך זה עובד" className="relative rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-3 md:p-4">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h2 className="text-xs font-bold text-text-primary">איך זה עובד</h2>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 -m-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          aria-label="הסתר הסבר"
          title="הסתר"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-2.5 md:gap-4">
        {STEPS.map((step) => (
          <li key={step.title} className="flex items-start gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-accent-primary/12 border border-accent-primary/20 grid place-items-center shrink-0">
              <step.Icon className="w-3.5 h-3.5 text-accent-primary" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text-primary">{step.title}</p>
              <p className="text-[11px] text-text-muted leading-relaxed">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[10.5px] text-text-muted leading-relaxed mt-2.5 pt-2.5 border-t border-border-primary">
        המנוע מסמן נקודת כניסה שתואמת מבנה ויקוף. הוא לא ממליץ לקנות או למכור — ההחלטה, הסטופ והגודל שלך.
      </p>
    </section>
  );
}
