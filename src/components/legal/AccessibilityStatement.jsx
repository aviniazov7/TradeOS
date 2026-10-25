import { m } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Accessibility, ChevronRight, CheckCircle2, AlertTriangle,
  UserCog, Mail, Phone, Scale, Calendar,
} from 'lucide-react';
import { pageVariants, pageTransition } from '../../utils/animations';

// ─── Accessibility statement per the Israeli standard ───────────────────────
// Israeli Equal Rights for Persons with Disabilities Regulations (Service
// Accessibility Adaptations), 5773-2013 + Israeli Standard SI 5568 (adopts
// WCAG 2.0 level AA). Wording is deliberately "we strive / ongoing process"
// rather than a certified-compliance claim — honest and standard for these
// statements, which acknowledge known limitations.

// ⚠️ FILL THESE IN for full legal compliance: the regulation requires a named
// accessibility coordinator with a phone number. Email is set; add name+phone.
const COORDINATOR = {
  name: '',                       // e.g. 'אברהם ניאזוב'
  phone: '',                      // e.g. '050-0000000'
  email: 'tradeos.app@gmail.com',
};
const LAST_UPDATED = '19 ביולי 2026';

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

export default function AccessibilityStatement() {
  const navigate = useNavigate();

  return (
    <m.div
      variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="max-w-3xl mx-auto px-4 py-6 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          aria-label="חזרה"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Accessibility className="w-6 h-6 text-accent-primary" />
          <h1 className="text-lg md:text-xl font-bold text-text-primary">הצהרת נגישות</h1>
        </div>
      </div>

      <p className="text-sm text-text-secondary leading-relaxed">
        ב-TradeOS אנו רואים חשיבות רבה במתן שירות שוויוני לכלל המשתמשים ופועלים
        להנגשת האתר והאפליקציה כך שיהיו נוחים לשימוש עבור אנשים עם מוגבלות. אנו
        משקיעים מאמצים לשפר את נגישות השירות מתוך אמונה בזכותו של כל אדם לקבל
        שירות שוויוני, מכובד ועצמאי.
      </p>

      <Section Icon={Scale} title="התקן והחקיקה">
        <p>
          הנגשת האתר בוצעה בהתאם לדרישות תקנות שוויון זכויות לאנשים עם מוגבלות
          (התאמות נגישות לשירות), התשע״ג-2013, ובהתאם להמלצות התקן הישראלי
          (ת״י 5568) לנגישות תכנים באינטרנט, המבוסס על מסמך ההנחיות הבינלאומי
          <span dir="ltr"> WCAG 2.0 </span> ברמת התאמה AA.
        </p>
      </Section>

      <Section Icon={CheckCircle2} title="התאמות הנגישות שבוצעו" tone="good">
        <ul className="list-disc pr-5 space-y-1">
          <li>ממשק בעברית מלא בכיוון ימין-לשמאל (RTL), עם שפת תוכן מוגדרת לקוראי מסך.</li>
          <li>ניווט מלא באמצעות מקלדת ומיקוד נראה על רכיבים אינטראקטיביים.</li>
          <li>מבנה כותרות היררכי וסמנטי לניווט נוח בקוראי מסך.</li>
          <li>ניגודיות צבעים גבוהה במצב הכהה של האתר לשיפור הקריאוּת.</li>
          <li>תוויות (aria-label) על כפתורים ופקדים מרכזיים.</li>
          <li>עיצוב רספונסיבי המותאם לנייד, לטאבלט ולמחשב, ותומך בהגדלת טקסט וזום.</li>
        </ul>
      </Section>

      <Section Icon={AlertTriangle} title="מגבלות ידועות" tone="warn">
        <p>
          חרף מאמצינו, ייתכן שחלקים מסוימים באתר — ובפרט גרפים אינטראקטיביים,
          תרשימים וטבלאות נתונים מורכבות — אינם נגישים במלואם בשלב זה. הנגשת
          האתר היא תהליך מתמשך, ואנו ממשיכים לשפר ולתקן באופן שוטף. אם נתקלת
          ברכיב שאינו נגיש — נשמח שתפנה אלינו ונטפל בכך בהקדם.
        </p>
      </Section>

      <Section Icon={UserCog} title="רכז הנגישות ופנייה בנושא">
        <p>
          נתקלת בבעיה, יש לך הצעה לשיפור או שאתה זקוק לסיוע בנושא נגישות? נשמח
          לשמוע ולסייע. ניתן לפנות לרכז הנגישות שלנו:
        </p>
        <div className="mt-2 space-y-1.5">
          {COORDINATOR.name && (
            <div className="flex items-center gap-2">
              <UserCog className="w-4 h-4 text-text-muted shrink-0" />
              <span className="text-text-primary">{COORDINATOR.name}</span>
            </div>
          )}
          {COORDINATOR.phone && (
            <a href={`tel:${COORDINATOR.phone.replace(/[^0-9+]/g, '')}`} className="flex items-center gap-2 hover:text-text-primary transition-colors" dir="ltr">
              <Phone className="w-4 h-4 text-text-muted shrink-0" />
              <span>{COORDINATOR.phone}</span>
            </a>
          )}
          <a href={`mailto:${COORDINATOR.email}`} className="flex items-center gap-2 hover:text-text-primary transition-colors" dir="ltr">
            <Mail className="w-4 h-4 text-text-muted shrink-0" />
            <span>{COORDINATOR.email}</span>
          </a>
        </div>
        <p className="mt-2 text-xs text-text-muted">נשתדל להשיב לכל פנייה בנושא נגישות בהקדם האפשרי.</p>
      </Section>

      <div className="flex items-center gap-2 text-xs text-text-muted pt-1">
        <Calendar className="w-3.5 h-3.5" />
        הצהרת הנגישות עודכנה לאחרונה בתאריך: {LAST_UPDATED}
      </div>
    </m.div>
  );
}
