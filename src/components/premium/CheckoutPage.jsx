import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, Check, ShieldCheck, ChevronRight, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { PREMIUM_PRICING, PREMIUM_FEATURES } from '../../utils/constants';
import { startCheckout } from '../../services/paymentService';
import { pageVariants, pageTransition } from '../../utils/animations';

export default function CheckoutPage() {
  const { isPremium } = useAuth();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState('monthly');
  const [busy, setBusy] = useState(false);

  const plan = PREMIUM_PRICING[cycle];
  const monthlyEq = cycle === 'yearly' ? (plan.price / 12).toFixed(0) : plan.price;

  const pay = async () => {
    setBusy(true);
    try {
      const res = await startCheckout(cycle);
      if (!res.enabled) {
        toast('הסליקה תיפתח בקרוב 🙏', { icon: '⏳' });
        return;
      }
      window.location.href = res.url; // redirect to Grow's hosted payment page
    } catch (e) {
      toast.error(e.message || 'פתיחת התשלום נכשלה');
    } finally {
      setBusy(false);
    }
  };

  if (isPremium) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
        className="min-h-[calc(100vh-4rem)] px-4 py-6">
        <div className="max-w-md mx-auto text-center bg-bg-secondary border border-border-primary rounded-2xl p-8">
          <Crown className="w-10 h-10 text-accent-primary mx-auto mb-3" />
          <h1 className="text-lg font-bold text-text-primary">אתה כבר במנוי Premium 👑</h1>
          <button onClick={() => navigate('/')} className="mt-4 text-sm text-accent-primary cursor-pointer">חזרה לדשבורד</button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="min-h-[calc(100vh-4rem)] px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">

        <button onClick={() => navigate('/premium')} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary cursor-pointer">
          <ChevronRight className="w-4 h-4" /> חזרה
        </button>

        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-accent-primary/15 flex items-center justify-center mb-2">
            <Crown className="w-6 h-6 text-accent-primary" />
          </div>
          <h1 className="text-xl font-bold text-text-primary">TradeOS Premium</h1>
          <p className="text-sm text-text-secondary mt-1">השלמת ההזמנה</p>
        </div>

        {/* Billing cycle */}
        <div className="grid grid-cols-2 gap-2">
          {Object.values(PREMIUM_PRICING).map((p) => (
            <button key={p.id} onClick={() => setCycle(p.id)}
              className={`relative rounded-xl border p-3 text-right transition-colors cursor-pointer ${
                cycle === p.id ? 'border-accent-primary bg-accent-primary/10' : 'border-border-primary bg-bg-secondary hover:bg-bg-tertiary'
              }`}>
              {p.note && (
                <span className="absolute -top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent-primary text-bg-primary">{p.note}</span>
              )}
              <div className="text-sm font-semibold text-text-primary">{p.label}</div>
              <div className="text-text-primary mt-1" dir="ltr">
                <span className="text-lg font-bold">₪{p.price}</span>
                <span className="text-xs text-text-muted"> / {p.per}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Order summary */}
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">TradeOS Premium · {plan.label}</span>
            <span className="text-text-primary font-semibold" dir="ltr">₪{plan.price}</span>
          </div>
          {cycle === 'yearly' && (
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>מחיר חודשי אפקטיבי</span>
              <span dir="ltr">≈ ₪{monthlyEq} / חודש</span>
            </div>
          )}
          <div className="border-t border-border-primary pt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">סה"כ לתשלום</span>
            <span className="text-lg font-bold text-text-primary" dir="ltr">₪{plan.price}</span>
          </div>
        </div>

        {/* What you get */}
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4">
          <div className="text-xs text-text-muted mb-2">מה כלול</div>
          <div className="space-y-1.5">
            {PREMIUM_FEATURES.map((f) => (
              <div key={f.title} className="flex items-center gap-2 text-sm text-text-primary">
                <Check className="w-4 h-4 text-profit shrink-0" /> {f.title}
              </div>
            ))}
          </div>
        </div>

        {/* Pay */}
        <button onClick={pay} disabled={busy}
          className="w-full py-3.5 rounded-xl bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2">
          <Lock className="w-4 h-4" /> {busy ? 'רגע...' : `המשך לתשלום מאובטח · ₪${plan.price}`}
        </button>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
          <ShieldCheck className="w-3.5 h-3.5 text-profit" /> תשלום מאובטח · ביטול בכל עת
        </div>
      </div>
    </motion.div>
  );
}
