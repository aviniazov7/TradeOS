import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Crown, Check, Bot, BookOpen, Wallet, Link2, Bell, BarChart3, Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PREMIUM_FEATURES, PREMIUM_PRICING } from '../../utils/constants';
import { pageVariants, pageTransition } from '../../utils/animations';

const ICONS = { Bot, BookOpen, Wallet, Link2, Bell, BarChart3 };

export default function PremiumPage() {
  const { isPremium } = useAuth();
  const navigate = useNavigate();

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="min-h-[calc(100vh-4rem)] px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-accent-primary/30 bg-gradient-to-b from-accent-primary/10 to-bg-secondary p-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-accent-primary/15 flex items-center justify-center mb-3">
            <Crown className="w-7 h-7 text-accent-primary" />
          </div>
          {isPremium ? (
            <>
              <h1 className="text-xl font-bold text-text-primary">אתה במנוי Premium 👑</h1>
              <p className="text-sm text-text-secondary mt-1">כל הפיצ'רים פתוחים. תודה על התמיכה!</p>
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

        <p className="text-center text-[11px] text-text-muted">
          ביטול בכל עת · ללא התחייבות
        </p>
      </div>
    </motion.div>
  );
}
