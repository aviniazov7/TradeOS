import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';
import {
  Crown, Check, Bot, BookOpen, Wallet, Link2, Bell, BarChart3, Sparkles, Ticket, Loader2, Image, Layers, Trophy,
  ShieldCheck, CalendarClock, Minus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { PREMIUM_FEATURES, PREMIUM_PRICING } from '../../utils/constants';
import { pageVariants, pageTransition } from '../../utils/animations';
import { redeemCoupon } from '../../services/couponService';
import { planExpiresMs } from '../../utils/premium';
import PageHeader from '../shared/PageHeader';

const ICONS = { Bot, BookOpen, Wallet, Link2, Bell, BarChart3, Sparkles, Image, Layers, Trophy };

// The four things that make the upgrade worth it, shown next to the price.
const HIGHLIGHTS = [
  'סוכן AI עד 200 שאלות ביום',
  'ניתוח גרפים מקצועי מצילום מסך',
  'יומנים, ארנקים וחיבורי בורסה ללא הגבלה',
  'אנליטיקה מתקדמת ו-Polymarket',
];

const yearlySavePct = Math.round((1 - PREMIUM_PRICING.yearly.price / (PREMIUM_PRICING.monthly.price * 12)) * 100);

// A comparison cell: "כלול" becomes a check, "—" a muted dash, anything else
// the text itself.
function Cell({ value, premium }) {
  if (value === 'כלול') return <Check className={`w-4 h-4 mx-auto ${premium ? 'text-accent-hover' : 'text-text-secondary'}`} strokeWidth={3} />;
  if (value === '—') return <Minus className="w-4 h-4 mx-auto text-text-muted/60" />;
  return <span className={`text-[13px] ${premium ? 'font-bold text-text-primary' : 'text-text-muted'}`}>{value}</span>;
}

// Human-friendly "time remaining" string for a Premium plan with an expiry.
// Returns null when the plan is lifetime (no expiry) or invalid.
function timeLeftLabel(planExpires) {
  const exp = planExpiresMs(planExpires);
  if (!exp) return null;
  const ms = exp - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 30) {
    const months = Math.floor(days / 30);
    const extraDays = days - months * 30;
    return extraDays > 0 ? `${months} חודשים ו-${extraDays} ימים` : `${months} חודשים`;
  }
  if (days >= 1) return `${days} ימים`;
  if (hours >= 1) return `${hours} שעות`;
  return `${minutes} דקות`;
}

export default function PremiumPage() {
  const { isPremium, profile } = useAuth();
  const navigate = useNavigate();
  const expiresAtMs = planExpiresMs(profile?.planExpires);
  const expiresAt = expiresAtMs
    ? new Date(expiresAtMs).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;
  const timeLeft = timeLeftLabel(profile?.planExpires);
  // Lifetime plan = premium with no expiry date (admins included).
  const isLifetime = isPremium && !expiresAtMs;
  const [couponCode, setCouponCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [cycle, setCycle] = useState('yearly');
  const plan = PREMIUM_PRICING[cycle];

  const handleRedeem = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setRedeeming(true);
    try {
      const r = await redeemCoupon(code);
      toast.success(`קיבלת ${r.days} ימי Premium 🎉`);
      setCouponCode('');
      // The live profile subscription in AuthContext will flip the UI; the
      // toast lands first so the user gets immediate confirmation.
    } catch (e) {
      toast.error(e.message || 'מימוש הקופון נכשל');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="max-w-4xl mx-auto">
      <PageHeader
        icon={Crown}
        title="TradeOS Premium"
        subtitle={isPremium ? 'המנוי שלך פעיל — כל הכלים פתוחים' : 'כל הכלים, בלי מגבלות'}
      />

      <div className="space-y-4">
        {isPremium ? (
          // Active plan status + renew
          <div className="rounded-2xl border border-accent-primary/30 bg-bg-secondary p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-5">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <span className="w-12 h-12 shrink-0 rounded-2xl grid place-items-center" style={{ background: 'var(--accent-gradient)' }}>
                <Crown className="w-6 h-6" style={{ color: '#ffffff' }} />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-bold text-text-primary">המנוי שלך פעיל</p>
                {timeLeft ? (
                  <p className="flex items-center gap-1.5 text-sm text-text-secondary mt-0.5">
                    <CalendarClock className="w-4 h-4 text-accent-hover shrink-0" />
                    נשארו <b className="text-text-primary">{timeLeft}</b> · עד {expiresAt}
                  </p>
                ) : (
                  <p className="text-sm text-text-secondary mt-0.5">גישה ללא הגבלת זמן. תודה על התמיכה!</p>
                )}
              </div>
            </div>
            {timeLeft && (
              <button
                onClick={() => navigate('/premium/checkout')}
                className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer"
              >
                <Crown className="w-4 h-4" /> הארכת המנוי
              </button>
            )}
          </div>
        ) : (
          // Price + what you get
          <div className="relative overflow-hidden rounded-2xl border border-accent-primary/30 bg-bg-secondary">
            <div aria-hidden className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(60% 90% at 0% 0%, rgba(0,123,167,0.16) 0%, transparent 65%)' }} />
            <div className="relative grid md:grid-cols-[1.1fr_1fr]">
              <div className="p-5 md:p-7">
                <h2 className="text-xl md:text-2xl font-extrabold text-text-primary leading-snug">
                  המסחר שלך, <span className="text-gradient">ברמה אחרת</span>
                </h2>
                <p className="text-sm text-text-secondary mt-2">כל מה שבחינם, ועוד הכלים שעוזרים לך להפסיק להפסיד על אותן טעויות.</p>
                <ul className="mt-5 space-y-3">
                  {HIGHLIGHTS.map((h) => (
                    <li key={h} className="flex items-center gap-3 text-sm text-text-primary">
                      <span className="w-5 h-5 shrink-0 grid place-items-center rounded-full bg-accent-primary/15">
                        <Check className="w-3 h-3 text-accent-hover" strokeWidth={3} />
                      </span>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-5 md:p-7 border-t md:border-t-0 md:border-r border-border-primary bg-bg-primary/40 flex flex-col">
                <div role="radiogroup" aria-label="מסלול חיוב" className="grid grid-cols-2 p-1 rounded-xl bg-bg-tertiary border border-border-primary">
                  {Object.values(PREMIUM_PRICING).map((p) => (
                    <button key={p.id} role="radio" aria-checked={cycle === p.id} onClick={() => setCycle(p.id)}
                      className={`h-9 rounded-lg text-sm font-bold transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 ${cycle === p.id ? 'bg-bg-secondary text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>
                      {p.label}
                      {p.id === 'yearly' && <span dir="ltr" className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-profit/15 text-profit">-{yearlySavePct}%</span>}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="num-mono text-4xl font-extrabold text-text-primary" dir="ltr">₪{plan.price}</span>
                  <span className="text-sm text-text-muted">/ {plan.per}</span>
                </div>
                <p className="text-xs text-text-muted mt-1 min-h-[1rem]">
                  {cycle === 'yearly' ? <>שווה ל-<bdi dir="ltr">₪{Math.round(plan.price / 12)}</bdi> לחודש · חודשיים חינם</> : 'חיוב חודשי, אפשר לבטל בכל עת'}
                </p>
                <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                  המחיר מחויב בשקלים (₪). רווח והפסד ביומן נשארים בדולרים.
                </p>

                <button
                  onClick={() => navigate(`/premium/checkout?cycle=${cycle}`)}
                  className="mt-5 w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer"
                >
                  <Crown className="w-4 h-4" /> שדרוג ל-Premium
                </button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-text-muted">
                  <ShieldCheck className="w-3.5 h-3.5 text-profit" /> ביטול בכל עת · ללא התחייבות
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Free vs Premium */}
        <div className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] sm:grid-cols-[minmax(0,1fr)_7rem_8rem] items-center px-4 md:px-5 py-3 border-b border-border-primary text-xs font-semibold text-text-muted">
            <span>מה מקבלים</span>
            <span className="text-center">חינם</span>
            <span className="text-center text-accent-hover flex items-center justify-center gap-1"><Crown className="w-3.5 h-3.5" /> Premium</span>
          </div>
          {PREMIUM_FEATURES.map((f) => {
            const Icon = ICONS[f.icon] || Check;
            return (
              <div key={f.title} className="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] sm:grid-cols-[minmax(0,1fr)_7rem_8rem] items-center px-4 md:px-5 py-3 border-b border-border-primary last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 text-text-muted shrink-0" />
                  <span className="text-sm text-text-primary">{f.title}</span>
                </div>
                <span className="text-center"><Cell value={f.free} /></span>
                <span className="text-center bg-accent-primary/[0.06] -my-3 py-3"><Cell value={f.premium} premium /></span>
              </div>
            );
          })}
        </div>

        {/* Coupon — the renewal path for a time-limited plan: the worker
            extends from max(currentExpiry, now) + days, so redeeming while
            still active adds days rather than overwriting. Hidden for a
            lifetime plan (premium with no expiry) — a coupon could only turn
            it into a time-limited one, and the worker refuses that anyway. */}
        {!isLifetime && (
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2.5 sm:flex-1 min-w-0">
            <Ticket className="w-5 h-5 text-accent-hover shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary">{isPremium ? 'יש לך קוד להארכת המנוי?' : 'יש לך קוד קופון?'}</p>
              <p className="text-xs text-text-muted">הימים מתווספים לתוקף מיד</p>
            </div>
          </div>
          <div className="flex gap-2 sm:w-80">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRedeem(); }}
              placeholder="הזן קוד"
              disabled={redeeming}
              aria-label="קוד קופון"
              className="flex-1 min-w-0 h-10 bg-bg-tertiary border border-border-primary rounded-xl px-3 text-sm text-text-primary outline-none focus:border-accent-primary font-mono uppercase text-right"
              dir="rtl"
              maxLength={32}
            />
            <button
              onClick={handleRedeem}
              disabled={redeeming || !couponCode.trim()}
              className="h-10 px-4 rounded-xl border border-border-hover text-text-primary text-sm font-bold hover:bg-bg-tertiary transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'מימוש'}
            </button>
          </div>
        </div>
        )}
      </div>
    </m.div>
  );
}
