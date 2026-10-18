import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';
import { Rocket, CheckCircle2, ChevronLeft, X, BookOpen, Link2, Wallet, Sunrise, FlaskConical } from 'lucide-react';
import Card from '../shared/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useDemoMode } from '../../hooks/useDemoMode';
import { getConnectedExchanges } from '../../services/exchangeService';
import { reopenOnboarding } from '../../utils/onboardingGate';
import { gettingStartedModel } from '../../utils/gettingStarted';

// First-steps checklist for brand-new accounts. Every item is DERIVED from
// data the dashboard already loads (plus one exchange-status call) — no new
// Firestore flags, so staging writes can't pollute production profiles and
// the card self-heals: it disappears once everything is done (or the user
// has clearly outgrown it) and can be dismissed locally.

// Past this many trades the user obviously knows the way around — never show.
const VETERAN_TRADES = 5;

export default function GettingStartedCard({ trades, journals, morningCount }) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const demo = useDemoMode();
  // Per-uid dismissal (matches the tradeos_theme_${uid} convention) — a shared
  // key would let one account's dismissal hide the card for a genuinely new
  // user signing up on the same browser.
  const dismissKey = `tradeos_gettingStartedDismissed_${user?.uid || 'anon'}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === 'true');
  // null = status unknown (check in flight). The card does NOT render until
  // this resolves — rendering optimistically made it flash at 2/4 and unmount
  // half a second later for users whose exchange completes the checklist.
  const [exchangeConnected, setExchangeConnected] = useState(null);

  const veteran = trades.length >= VETERAN_TRADES;

  useEffect(() => {
    if (dismissed || veteran) return; // don't spend a worker call when hidden
    let cancelled = false;
    getConnectedExchanges()
      .then((list) => { if (!cancelled) setExchangeConnected(list.length > 0); })
      // Error/offline → resolve as not-connected so the card still appears;
      // worst case the exchange step points somewhere the user already was.
      .catch(() => { if (!cancelled) setExchangeConnected(false); });
    return () => { cancelled = true; };
  }, [dismissed, veteran]);

  if (dismissed || veteran || exchangeConnected === null) return null;

  const copy = {
    exchange: {
      icon: Link2,
      label: 'חבר בורסה',
      desc: 'העסקאות והיתרה נכנסות לבד',
      go: () => navigate('/exchange'),
      primary: true,
    },
    trade: {
      icon: BookOpen,
      label: 'הוסף את העסקה הראשונה',
      desc: 'אחרי החיבור, או ידנית',
      go: () => navigate('/journal?new=1'),
    },
    balance: {
      icon: Wallet,
      label: 'הגדר יתרת פתיחה',
      desc: 'בהגדרות היומן — כך האחוזים והדראודאון מדויקים',
      go: () => navigate('/journal?settings=1'),
    },
    mind: {
      icon: Sunrise,
      label: 'מלא יומן בוקר ראשון',
      desc: 'המעקב המנטלי משלים את תמונת הביצועים',
      go: () => navigate('/mentality'),
    },
  };
  const steps = gettingStartedModel({
    tradeCount: trades.length,
    exchangeConnected,
    hasOpeningBalance: journals.some((j) => (j.initialBalance || 0) > 0),
    morningCount,
  }).map((s) => ({ ...s, ...copy[s.key] }));

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const dismiss = () => {
    localStorage.setItem(dismissKey, 'true');
    setDismissed(true);
  };

  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent-primary/12 flex items-center justify-center shrink-0">
              <Rocket className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary leading-tight">צעדים ראשונים</h2>
              <p className="text-[11px] text-text-muted">{doneCount}/{steps.length} הושלמו — עוד קצת והדשבורד מתעורר</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            title="הסתר"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mb-3">
          <m.div
            className="h-full bg-accent-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(doneCount / steps.length) * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {steps.map((s) => (
            <button
              key={s.key}
              onClick={s.done ? undefined : s.go}
              disabled={s.done}
              className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-right transition-colors ${
                s.done
                  ? 'border-profit/20 bg-profit/5 opacity-70'
                  : s.primary
                    ? 'border-accent-primary bg-accent-primary/10 hover:bg-accent-primary/15 cursor-pointer'
                    : 'border-border-primary bg-bg-tertiary/40 hover:border-accent-primary/40 hover:bg-accent-primary/5 cursor-pointer'
              }`}
            >
              {s.done ? (
                <CheckCircle2 className="w-5 h-5 text-profit shrink-0" />
              ) : (
                <s.icon className="w-5 h-5 text-accent-primary shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                <span className={`block text-xs font-semibold ${s.done ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                  {s.label}
                  {s.primary && !s.done && <span className="ms-1.5 text-[10px] font-bold text-accent-primary">הצעד הראשון</span>}
                </span>
                <span className="block text-[10px] text-text-muted truncate">{s.desc}</span>
              </span>
              {!s.done && <ChevronLeft className="w-4 h-4 text-text-muted shrink-0" />}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {profile?.onboardingCompleted === false && (
            <button type="button" onClick={() => reopenOnboarding()}
              className="text-xs font-semibold text-accent-primary hover:underline cursor-pointer">
              המשך את ההדרכה
            </button>
          )}
          {!demo.active && !exchangeConnected && trades.length === 0 && (
            <button type="button" onClick={demo.enter}
              className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer">
              <FlaskConical className="w-3.5 h-3.5" /> סייר עם נתוני דמו
            </button>
          )}
        </div>
      </Card>
    </m.div>
  );
}
