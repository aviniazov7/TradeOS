import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Target, Layers, Gauge, Sparkles, ChevronUp } from 'lucide-react';

// The questions worth asking about YOUR OWN book, not about the market. Each
// one is answerable from the journal, which is the whole point of asking it
// here rather than in a generic chatbot.
const QUICK_QUESTIONS = [
  { id: 'why-losing', icon: '📉', text: 'איפה אני מפסיד הכי הרבה כסף?' },
  { id: 'best-setup', icon: '🎯', text: 'איזו אסטרטגיה עובדת לי הכי טוב?' },
  { id: 'when-trade', icon: '🕐', text: 'באילו שעות אני סוחר הכי טוב?' },
  { id: 'mistakes', icon: '⚠️', text: 'מה 3 הטעויות שחוזרות אצלי?' },
  { id: 'risk-now', icon: '🛡️', text: 'האם הסיכון שלי כרגע סביר?' },
  { id: 'vs-plan', icon: '📋', text: 'האם אני עומד בתוכנית המסחר שלי?' },
];

const fmt$ = (v) => {
  const sign = v >= 0 ? '+' : '-';
  const a = Math.abs(v);
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
};

// A sparkline drawn from the real cumulative curve. Canvas would be overkill
// for ~30 points and an inline SVG keeps it theme-aware through currentColor.
function Spark({ points, positive }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p - min) / span) * 26}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={`w-full h-7 ${positive ? 'text-profit' : 'text-loss'}`} aria-hidden="true">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function InsightCard({ label, value, sub, tone = 'neutral', Icon, spark, sparkPositive }) {
  let toneClass = 'text-text-primary';
  if (tone === 'profit') toneClass = 'text-profit';
  else if (tone === 'loss') toneClass = 'text-loss';
  return (
    <div className="min-w-0 rounded-2xl border border-border-primary bg-bg-secondary/60 p-3 flex flex-col justify-between">
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-lg font-bold truncate ${toneClass}`} dir="ltr">{value}</div>
          {sub && <div className="text-[10px] text-text-muted truncate">{sub}</div>}
        </div>
        {spark?.length > 1 && <div className="w-16 shrink-0 opacity-70"><Spark points={spark} positive={sparkPositive} /></div>}
      </div>
    </div>
  );
}

/**
 * The head of the TradeAI page: the trader's own numbers first, then the
 * questions worth asking about them. A generic assistant can answer anything;
 * the reason to ask it HERE is that it can see this book.
 */
export default function TradeAIHub({ stats, tradesCount, equityCurve, onAsk, open = true, onToggle }) {
  const pnl = Number(stats?.totalPnL) || 0;
  const winRate = Number(stats?.winRate) || 0;
  const pf = stats?.profitFactor;
  const pfText = pf === Infinity ? '∞' : Number.isFinite(pf) ? pf.toFixed(2) : '—';

  return (
    <section className="max-w-2xl mx-auto w-full space-y-3">
      <div className="text-center relative">
        <h1 className="text-lg md:text-xl font-bold text-text-primary inline-flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent-primary" />
          מה תרצה לדעת על המסחר שלך?
        </h1>
        <p className="text-[11px] text-text-muted mt-1">
          {tradesCount
            ? `הסוכן רואה את ${tradesCount} העסקאות הסגורות שלך. לתוכנית וליומן המנטליות — פתח את "האנליסט שלך".`
            : 'הוסף עסקאות כדי שהסוכן יוכל לנתח את הספר שלך.'}
        </p>
        {onToggle && (
          <button
            onClick={onToggle}
            aria-expanded={open}
            title={open ? 'כווץ כדי להגדיל את הצ׳אט' : 'הצג את הנתונים שלך'}
            className="absolute top-0 left-0 inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-bg-secondary"
          >
            {open ? 'כווץ' : 'הנתונים שלי'}
            <ChevronUp className={`w-3 h-3 transition-transform duration-200 ${open ? '' : 'rotate-180'}`} />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="hub-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden space-y-3"
          >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <InsightCard
          label="P&L כולל"
          value={fmt$(pnl)}
          sub={`${tradesCount} עסקאות`}
          tone={pnl >= 0 ? 'profit' : 'loss'}
          Icon={TrendingUp}
          spark={equityCurve}
          sparkPositive={pnl >= 0}
        />
        <InsightCard
          label="אחוז הצלחה"
          value={`${winRate.toFixed(1)}%`}
          sub={`${stats?.winCount ?? 0} מול ${stats?.lossCount ?? 0}`}
          Icon={Target}
        />
        <InsightCard
          label="Profit Factor"
          value={pfText}
          sub={stats?.pfRating || '—'}
          tone={Number.isFinite(pf) && pf >= 1 ? 'profit' : 'neutral'}
          Icon={Gauge}
        />
        <InsightCard
          label="פוזיציות פתוחות"
          value={stats?.openCount ?? 0}
          sub={stats?.openCount ? 'נבדקות במפקח הסיכון' : 'הספר סגור'}
          Icon={Layers}
        />
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 pt-0.5">
        {QUICK_QUESTIONS.map((q, i) => (
          <motion.button
            key={q.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i, duration: 0.18 }}
            onClick={() => onAsk(q.text)}
            className="text-[11px] px-2.5 py-1.5 rounded-full border border-border-primary bg-bg-secondary/60 text-text-secondary hover:text-text-primary hover:border-border-hover hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <span aria-hidden="true">{q.icon}</span> {q.text}
          </motion.button>
        ))}
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
