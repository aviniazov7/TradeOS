import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { m } from 'framer-motion';
import { Crown, Check, ShieldCheck, ChevronRight, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { PREMIUM_PRICING, PREMIUM_FEATURES } from '../../utils/constants';
import { startCheckout, requestPurchaseInquiry } from '../../services/paymentService';
import { pageVariants, pageTransition } from '../../utils/animations';

export default function CheckoutPage() {
  const { isPremium } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // The plan picked on the Premium page carries over; yearly anchors otherwise.
  const [cycle, setCycle] = useState(() => (params.get('cycle') === 'monthly' ? 'monthly' : 'yearly'));
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false); // must accept the refund policy before paying

  const plan = PREMIUM_PRICING[cycle];
  // Honest anchoring: how much the yearly plan saves vs paying monthly.
  const yearlyFull = PREMIUM_PRICING.monthly.price * 12;
  const yearlySavePct = Math.round((1 - PREMIUM_PRICING.yearly.price / yearlyFull) * 100);

  const pay = async () => {
    setBusy(true);
    try {
      const res = await startCheckout(cycle);
      if (!res.enabled) {
        // Card checkout isn't wired yet — capture the buyer's intent so a
        // ready-to-pay user isn't lost. Best-effort; the friendly message
        // shows regardless.
        try {
          await requestPurchaseInquiry(`בקשת רכישת Premium — מסלול ${plan.label} (₪${plan.price}).`);
          toast.success('רשמנו את הבקשה — ניצור איתך קשר לתיאום התשלום 🙏', { duration: 5000 });
        } catch {
          toast('הסליקה תיפתח בקרוב 🙏', { icon: '⏳' });
        }
        return;
      }
      window.location.href = res.url; // redirect to Grow's hosted payment page
    } catch (e) {
      toast.error(e.message || 'פתיחת התשלום נכשלה');
    } finally {
      setBusy(false);
    }
  };

  // NOTE: premium users are NOT bounced here — they can renew/extend. The
  // worker extends from max(currentExpiry, now)+days, and until card checkout
  // is live the pay button captures the intent as a lead (see pay()).

  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="px-1 py-2 md:py-6">
      <div className="max-w-lg mx-auto space-y-4">

        <button onClick={() => navigate('/premium')} className="h-9 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary cursor-pointer">
          <ChevronRight className="w-4 h-4" /> חזרה ל-Premium
        </button>

        <div className="flex items-center gap-3">
          <span className="w-11 h-11 shrink-0 rounded-xl grid place-items-center" style={{ background: 'var(--accent-gradient)' }}>
            <Crown className="w-5 h-5" style={{ color: '#ffffff' }} />
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-text-primary">{isPremium ? 'הארכת המנוי' : 'השלמת ההזמנה'}</h1>
            <p className="text-sm text-text-secondary">{isPremium ? 'הזמן יתווסף לתוקף הקיים' : 'TradeOS Premium'}</p>
          </div>
        </div>

        {/* Billing cycle */}
        <div role="radiogroup" aria-label="מסלול חיוב" className="space-y-2">
          {Object.values(PREMIUM_PRICING).map((p) => {
            const on = cycle === p.id;
            return (
              <button key={p.id} role="radio" aria-checked={on} onClick={() => setCycle(p.id)}
                className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-right transition-colors cursor-pointer ${
                  on ? 'border-accent-primary bg-accent-primary/[0.08]' : 'border-border-primary bg-bg-secondary hover:border-border-hover'
                }`}>
                <span className={`w-5 h-5 shrink-0 rounded-full border-2 grid place-items-center ${on ? 'border-accent-primary' : 'border-border-hover'}`}>
                  {on && <span className="w-2.5 h-2.5 rounded-full bg-accent-primary" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text-primary">{p.label}</span>
                    {p.id === 'yearly' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-profit/15 text-profit">חיסכון {yearlySavePct}%</span>}
                  </span>
                  <span className="block text-xs text-text-muted mt-0.5">
                    {p.id === 'yearly' ? <>שווה ל-<bdi dir="ltr">₪{Math.round(p.price / 12)}</bdi> לחודש · חודשיים חינם</> : 'חיוב כל חודש'}
                  </span>
                </span>
                <span className="text-left shrink-0" dir="ltr">
                  <span className="num-mono text-lg font-extrabold text-text-primary">₪{p.price}</span>
                  <span className="text-xs text-text-muted"> / {p.per}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Order summary */}
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Premium · {plan.label}</span>
            <span className="num-mono text-text-primary" dir="ltr">₪{plan.price}</span>
          </div>
          <div className="border-t border-border-primary pt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-text-primary">סה&quot;כ לתשלום</span>
            <span className="num-mono text-xl font-extrabold text-text-primary" dir="ltr">₪{plan.price}</span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            החיוב הוא בשקלים (₪) — זה מטבע התשלום, לא מטבע היומן. רווח והפסד בעסקאות נשארים בדולרים.
          </p>
          <details className="group border-t border-border-primary pt-3">
            <summary className="text-xs font-semibold text-accent-hover cursor-pointer list-none flex items-center gap-1">
              מה כלול במנוי <ChevronRight className="w-3.5 h-3.5 rotate-90 group-open:-rotate-90 transition-transform" />
            </summary>
            <ul className="mt-2.5 grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f.title} className="flex items-center gap-2 text-[13px] text-text-secondary">
                  <Check className="w-3.5 h-3.5 text-profit shrink-0" /> {f.title}
                </li>
              ))}
            </ul>
          </details>
        </div>

        {/* Policy agreement — required before payment */}
        <label className="flex items-start gap-2.5 text-[13px] text-text-secondary cursor-pointer select-none px-1">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-accent-primary cursor-pointer shrink-0"
          />
          <span>
            קראתי ואני מסכים ל
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); navigate('/refund-policy'); }}
              className="text-accent-hover underline underline-offset-2 cursor-pointer mx-0.5"
            >
              מדיניות הביטולים וההחזרים
            </button>
          </span>
        </label>

        <button onClick={pay} disabled={busy || !agreed}
          className="w-full h-12 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent-muted flex items-center justify-center gap-2">
          <Lock className="w-4 h-4" /> {busy ? 'רגע...' : <>המשך לתשלום מאובטח · <bdi dir="ltr">₪{plan.price}</bdi></>}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
          <ShieldCheck className="w-3.5 h-3.5 text-profit" /> תשלום מאובטח · ביטול בכל עת
        </p>
      </div>
    </m.div>
  );
}
