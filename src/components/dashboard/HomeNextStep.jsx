import { createElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, PenLine, FlaskConical, LineChart, Target, Activity, ShieldCheck } from 'lucide-react';
import Card from '../shared/Card';
import ExchangeLogo from '../shared/ExchangeLogo';
import { TERMINAL_EXCHANGES, EXCHANGE_LABELS } from '../../utils/terminal';

// What a new account is here for. Shown in place of an empty chart and a row
// of dashes, so the next action is the page — not a footnote under it.
const OUTCOMES = [
  { Icon: LineChart, title: 'רווח והפסד', text: 'נקי, לפי שבוע, חודש או הכל' },
  { Icon: Target, title: 'אחוז הצלחה', text: 'יחד עם פקטור רווח ורצף' },
  { Icon: Activity, title: 'פוזיציות פתוחות', text: 'רווח לא ממומש, בלי לפתוח את הבורסה' },
];

const PREVIEW = [
  { label: 'רווח/הפסד', hint: 'יופיע אחרי עסקה סגורה' },
  { label: 'אחוז הצלחה', hint: 'בלי עסקאות איזון' },
  { label: 'עסקאות אחרונות', hint: 'מהיומן' },
  { label: 'פוזיציות פתוחות', hint: 'חי מהבורסה' },
];

function PrimaryButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 px-5 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-primary text-sm font-bold cursor-pointer"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 px-5 inline-flex items-center justify-center gap-2 rounded-xl border border-border-primary bg-bg-tertiary text-sm font-bold text-text-primary hover:border-accent-primary/40 cursor-pointer"
    >
      {children}
    </button>
  );
}

function PreviewGrid() {
  return (
    <div className="grid grid-cols-2 gap-2" aria-hidden>
      {PREVIEW.map((item) => (
        <div key={item.label} className="rounded-xl bg-bg-tertiary/80 border border-border-primary px-3 py-2.5 min-w-0">
          <div className="text-[11px] text-text-secondary">{item.label}</div>
          <div className="num-mono text-lg font-bold text-text-muted leading-tight mt-0.5">—</div>
          <div className="text-[10px] text-text-muted mt-0.5 truncate">{item.hint}</div>
        </div>
      ))}
    </div>
  );
}

function ExchangeMarks() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {TERMINAL_EXCHANGES.map((id) => (
        <span key={id} className="inline-flex items-center gap-1.5 h-8 ps-1 pe-2.5 rounded-full bg-bg-tertiary border border-border-primary">
          <ExchangeLogo exchange={id} size="w-6 h-6" />
          <span className="text-xs font-semibold text-text-secondary">{EXCHANGE_LABELS[id] || id}</span>
        </span>
      ))}
    </div>
  );
}

// stage: 'fresh' | 'awaiting'
export default function HomeNextStep({ stage = 'fresh', showDemo = false, onDemo, showResume = false, onResume }) {
  const navigate = useNavigate();
  const connect = () => navigate('/journal?tab=exchange');
  const logTrade = () => navigate('/journal?new=1');
  const fresh = stage !== 'awaiting';

  return (
    <Card data-testid="home-next-step" className="relative overflow-hidden rounded-2xl p-4 md:p-6 mb-4">
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(70% 120% at 100% 0%, rgba(37,99,235,0.18) 0%, transparent 58%)' }} />
      <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-5 lg:gap-8">
        <div className="lg:col-span-3 min-w-0 flex flex-col">
          {fresh ? (
            <p className="text-xs font-bold text-accent-hover">הצעד הבא</p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-profit">
              <span className="w-1.5 h-1.5 rounded-full bg-profit" style={{ boxShadow: '0 0 8px var(--color-profit)' }} />
              הבורסה מחוברת
            </p>
          )}
          <h2 className="text-[1.65rem] md:text-[2rem] font-extrabold text-text-primary leading-tight mt-2">
            {fresh ? 'חבר בורסה — והבית מתמלא לבד' : 'הצעד הבא: העסקה הראשונה'}
          </h2>
          <p className="text-sm md:text-[15px] text-text-secondary leading-relaxed mt-2.5 max-w-xl">
            {fresh
              ? 'רווח והפסד, אחוז הצלחה, עסקאות אחרונות ופוזיציות פתוחות מופיעים כאן ברגע שיש חיבור. המפתח לקריאה בלבד, נשמר מוצפן, בלי הרשאה למסחר או למשיכה.'
              : 'החיבור פעיל. עסקאות סגורות ופוזיציות פתוחות ייכנסו לכאן אוטומטית, או שאפשר לרשום עסקה ידנית עכשיו.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
            {fresh ? (
              <>
                <PrimaryButton onClick={connect}><Link2 className="w-4 h-4" /> חבר בורסה</PrimaryButton>
                <SecondaryButton onClick={logTrade}><PenLine className="w-4 h-4" /> רשום עסקה ידנית</SecondaryButton>
              </>
            ) : (
              <>
                <PrimaryButton onClick={logTrade}><PenLine className="w-4 h-4" /> רשום עסקה</PrimaryButton>
                <SecondaryButton onClick={() => navigate('/journal?tab=exchange')}>לסנכרון בבורסה</SecondaryButton>
              </>
            )}
          </div>

          {fresh && (
            <div className="mt-4">
              <ExchangeMarks />
              <p className="text-[11px] text-text-muted mt-2">Binance נתמך בייבוא CSV מהיומן.</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {fresh && (
              <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                <ShieldCheck className="w-3.5 h-3.5" /> קריאה בלבד
              </span>
            )}
            {showDemo && onDemo && (
              <button type="button" onClick={onDemo} className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer">
                <FlaskConical className="w-3.5 h-3.5" /> סייר עם נתוני דמו
              </button>
            )}
            {showResume && onResume && (
              <button type="button" onClick={onResume} className="text-xs font-semibold text-accent-primary hover:underline cursor-pointer">
                המשך את ההדרכה
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 min-w-0 flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {OUTCOMES.map(({ Icon, title, text }) => (
              <li key={title} className="flex items-center gap-3 rounded-xl border border-border-primary bg-bg-tertiary/50 px-3 py-2.5">
                <span className="w-9 h-9 rounded-lg bg-accent-primary/12 text-accent-primary grid place-items-center shrink-0">
                  {createElement(Icon, { className: 'w-4 h-4' })}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-text-primary">{title}</span>
                  <span className="block text-xs text-text-secondary">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <PreviewGrid />
        </div>
      </div>
    </Card>
  );
}

// One line above the overview when the journal already has trades but no sync.
export function HomeConnectNudge() {
  const navigate = useNavigate();
  return (
    <Card data-testid="home-connect-nudge" className="rounded-2xl p-3.5 md:px-4 md:py-3.5 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="w-10 h-10 rounded-xl bg-accent-primary/12 border border-accent-primary/20 grid place-items-center shrink-0">
          <Link2 className="w-5 h-5 text-accent-primary" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-text-primary">חבר בורסה כדי שהעסקאות ייכנסו לבד</p>
          <p className="text-xs text-text-secondary mt-0.5">היומן כבר מציג ביצועים. חיבור לקריאה בלבד יוסיף יתרה ופוזיציות פתוחות.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate('/journal?tab=exchange')}
        className="h-10 px-4 rounded-xl bg-accent-primary text-sm font-bold shrink-0 cursor-pointer"
      >
        חבר בורסה
      </button>
    </Card>
  );
}
