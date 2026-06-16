import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, Gift, Check, Loader2, AlertCircle, LogIn, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { getCouponInfo, redeemCoupon } from '../../services/couponService';
import { PREMIUM_FEATURES } from '../../utils/constants';

// Public-facing landing page for a shared coupon link: /redeem/:code
// A friend opens it, sees a designed offer card, and redeems in one tap.
export default function CouponLandingPage() {
  const { code: rawCode } = useParams();
  const code = (rawCode || '').toUpperCase();
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCouponInfo(code)
      .then((d) => { if (!cancelled) { setInfo(d); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.notFound ? 'הקוד לא נמצא או שאינו תקף יותר.' : (e.message || 'שגיאה')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code]);

  const handleRedeem = async () => {
    if (!user) {
      // Send them to login, then back here to finish redeeming.
      navigate(`/login?redirect=${encodeURIComponent(`/redeem/${code}`)}`);
      return;
    }
    setRedeeming(true);
    try {
      const r = await redeemCoupon(code);
      setDone(true);
      toast.success(`קיבלת ${r.days} ימי Premium 🎉`);
    } catch (e) {
      toast.error(e.message || 'מימוש הקופון נכשל');
      // Refresh info in case it just got used up
      getCouponInfo(code).then(setInfo).catch(() => {});
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-bg-primary">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Card */}
        <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 via-bg-secondary to-bg-secondary p-7 text-center">
          {/* glow */}
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.18) 0%, transparent 60%)' }} />

          <div className="relative">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mb-4">
              <Gift className="w-8 h-8 text-amber-400" />
            </div>

            {loading ? (
              <div className="py-10 flex flex-col items-center gap-2 text-text-muted">
                <Loader2 className="w-6 h-6 animate-spin" /> טוען את הקופון…
              </div>
            ) : error ? (
              <div className="py-6">
                <AlertCircle className="w-8 h-8 text-loss mx-auto mb-2" />
                <h1 className="text-lg font-bold text-text-primary">אופס</h1>
                <p className="text-sm text-text-secondary mt-1">{error}</p>
                <button onClick={() => navigate('/')} className="mt-4 text-sm text-accent-primary cursor-pointer">לדף הבית</button>
              </div>
            ) : done || (isPremium && info) ? (
              <div className="py-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-profit/15 border border-profit/40 flex items-center justify-center mb-3">
                  <Check className="w-7 h-7 text-profit" />
                </div>
                <h1 className="text-xl font-bold text-text-primary">{done ? 'הקופון מומש! 🎉' : 'כבר יש לך Premium 👑'}</h1>
                <p className="text-sm text-text-secondary mt-1">{done ? `קיבלת ${info?.days} ימי Premium. כל הפיצ'רים פתוחים.` : 'אין צורך לממש את הקופון — כל הפיצ\'רים כבר פתוחים אצלך.'}</p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-5 w-full py-3 rounded-xl bg-amber-500 text-bg-primary text-sm font-bold hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  כניסה לאפליקציה
                </button>
              </div>
            ) : (
              <>
                <div className="text-[11px] uppercase tracking-wider text-amber-400/80 font-semibold">קוד מתנה</div>
                <h1 className="text-2xl font-extrabold text-text-primary mt-1">
                  {info.days} ימי <span className="text-amber-400">Premium</span> חינם
                </h1>
                {info.label && <p className="text-xs text-text-muted mt-1">{info.label}</p>}

                <div className="my-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-tertiary border border-border-primary font-mono text-lg font-bold text-amber-400" dir="ltr">
                  {info.code}
                </div>

                {!info.valid ? (
                  <p className="text-sm text-loss">{info.reason === 'expired' ? 'תוקף הקוד פג.' : 'הקוד נוצל במלואו.'}</p>
                ) : (
                  <button
                    onClick={handleRedeem}
                    disabled={redeeming}
                    className="w-full py-3.5 rounded-xl bg-amber-500 text-bg-primary text-sm font-bold hover:bg-amber-400 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {redeeming ? <Loader2 className="w-4 h-4 animate-spin" />
                      : user ? <><Crown className="w-4 h-4" /> ממש את הקופון</>
                      : <><LogIn className="w-4 h-4" /> התחבר וממש</>}
                  </button>
                )}
                {!user && info.valid && (
                  <p className="text-[11px] text-text-muted mt-2">צריך להתחבר כדי לממש — לוקח שניה.</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* What you get */}
        {!loading && !error && info?.valid && !done && (
          <div className="mt-3 bg-bg-secondary border border-border-primary rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> מה נפתח עם Premium
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {PREMIUM_FEATURES.map((f) => (
                <div key={f.title} className="flex items-center gap-1.5 text-xs text-text-primary">
                  <Check className="w-3.5 h-3.5 text-profit shrink-0" /> {f.title}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-text-muted mt-4">TradeOS — יומן מסחר חכם</p>
      </motion.div>
    </div>
  );
}
