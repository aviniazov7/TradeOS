import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Crown, Check, Bot, BookOpen, Wallet, Link2, Bell, BarChart3, Sparkles, Ticket, Loader2, Image, Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { PREMIUM_FEATURES, PREMIUM_PRICING } from '../../utils/constants';
import { pageVariants, pageTransition } from '../../utils/animations';
import { redeemCoupon } from '../../services/couponService';
import { planExpiresMs } from '../../utils/premium';

const ICONS = { Bot, BookOpen, Wallet, Link2, Bell, BarChart3, Sparkles, Image, Layers };

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
  const [couponCode, setCouponCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

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
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="min-h-[calc(100vh-4rem)] px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Hero */}
        <div className="border-beam relative overflow-hidden rounded-2xl border border-accent-primary/30 bg-gradient-to-b from-accent-primary/10 to-bg-secondary p-6 text-center">
          {/* violet→cyan top hairline */}
          <div className="absolute top-0 inset-x-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(to right, transparent, #8b5cf6, #06b6d4, transparent)' }} />
          <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--accent-gradient)' }}>
            <Crown className="w-7 h-7 text-white" />
          </div>
          {isPremium ? (
            <>
              <h1 className="text-xl font-bold text-text-primary">אתה במנוי Premium 👑</h1>
              <p className="text-sm text-text-secondary mt-1">כל הפיצ'רים פתוחים. תודה על התמיכה!</p>
              {timeLeft ? (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-primary/10 border border-accent-primary/30 text-xs">
                  <span className="text-accent-primary font-semibold">נשארו {timeLeft}</span>
                  <span className="text-text-muted">· מסתיים ב-{expiresAt}</span>
                </div>
              ) : (
                <div
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-white"
                  style={{ background: 'var(--accent-gradient)', boxShadow: '0 4px 16px -4px rgba(139,92,246,0.55)' }}
                >
                  <Crown className="w-3.5 h-3.5" /> גישה ללא הגבלת זמן
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-text-primary">שדרג ל-TradeOS Premium</h1>
              <p className="text-sm text-text-secondary mt-1">פתח את כל היכולות — בלי הגבלות.</p>
            </>
          )}
        </div>

        {/* Comparison */}
        <div className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-3 border-b border-border-primary text-xs text-text-muted">
            <span>פיצ'ר</span>
            <span className="w-20 text-center">חינם</span>
            <span className="w-24 text-center text-accent-primary font-semibold flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Premium
            </span>
          </div>
          {PREMIUM_FEATURES.map((f) => {
            const Icon = ICONS[f.icon] || Check;
            return (
              <div key={f.title} className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-3 border-b border-border-primary last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-text-muted shrink-0" />
                  <span className="text-sm text-text-primary truncate">{f.title}</span>
                </div>
                <span className="w-20 text-center text-xs text-text-muted">{f.free}</span>
                <span className="w-24 text-center text-xs font-semibold text-accent-primary">{f.premium}</span>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        {!isPremium && (
          <div className="bg-bg-secondary border border-border-primary rounded-2xl p-5 text-center space-y-3">
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-3xl font-bold text-text-primary" dir="ltr">₪{PREMIUM_PRICING.monthly.price}</span>
              <span className="text-sm text-text-muted">/ חודש</span>
            </div>
            <button
              onClick={() => navigate('/premium/checkout')}
              className="w-full py-3 rounded-xl bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Crown className="w-4 h-4" /> שדרג עכשיו
            </button>
            <p className="text-[11px] text-text-muted">אפשר גם מסלול שנתי עם חודשיים חינם.</p>
          </div>
        )}

        {/* Coupon redeem — free users only. Premium users could 'extend' here
            but we'd surface this differently; for V1 keep it on the upgrade
            flow only. */}
        {!isPremium && (
          <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Ticket className="w-4 h-4 text-accent-primary" /> יש לך קוד קופון?
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRedeem(); }}
                placeholder="הזן קוד"
                disabled={redeeming}
                className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary font-mono uppercase text-right"
                dir="rtl"
                maxLength={32}
              />
              <button
                onClick={handleRedeem}
                disabled={redeeming || !couponCode.trim()}
                className="px-4 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'מימוש'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-text-muted">
          ביטול בכל עת · ללא התחייבות
        </p>
      </div>
    </motion.div>
  );
}
