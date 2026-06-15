import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit, Crown, RefreshCw, AlertCircle, Lock, Sparkles,
  TrendingUp, TrendingDown, Target, Lightbulb, Bot,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useAuth } from '../../contexts/AuthContext';
import { generateCoachReport } from '../../services/aiCoachService';
import { buildCoachStats } from '../../utils/coachStats';

// Quick prompts the user can click to seed the report.
const FREE_PROMPTS = [
  { id: 'overview', label: 'סיכום חודש אחרון' },
  { id: 'losses', label: 'איפה אני מפסיד הכי הרבה?' },
  { id: 'topPair', label: 'מה המטבע הכי רווחי שלי?' },
];
const PREMIUM_PROMPTS = [
  { id: 'mistakes', label: '3 הטעויות הכי גדולות שלי' },
  { id: 'sessionEdge', label: 'איזה סשן הכי רווחי?' },
  { id: 'compareMonth', label: 'איך החודש מול הקודם?' },
  { id: 'strategyEdge', label: 'איזו אסטרטגיה מצליחה?' },
];

// Each section header maps to an icon + accent color. The model is locked to
// these four headings (חוזקות / חולשות / המלצות לפעולה / תובנות מתקדמות) so
// we get deterministic styling.
const SECTION_META = {
  'חוזקות': { Icon: TrendingUp, color: 'text-profit', bg: 'bg-profit/10', border: 'border-profit/30' },
  'חולשות': { Icon: TrendingDown, color: 'text-loss', bg: 'bg-loss/10', border: 'border-loss/30' },
  'המלצות לפעולה': { Icon: Target, color: 'text-accent-primary', bg: 'bg-accent-primary/10', border: 'border-accent-primary/30' },
  'תובנות מתקדמות': { Icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
};
const DEFAULT_META = { Icon: Sparkles, color: 'text-text-primary', bg: 'bg-bg-tertiary', border: 'border-border-primary' };

// Known canonical sections — used to map slipped formats back to the right
// bucket and to ignore any section the model invents on its own (e.g. "מסקנות").
const CANONICAL_SECTIONS = ['חוזקות', 'חולשות', 'המלצות לפעולה', 'תובנות מתקדמות'];

function normalizeTitle(raw) {
  // Strip markdown noise the model sometimes leaks despite the prompt.
  let t = raw.replace(/^#+\s*/, '')      // "## חוזקות"
    .replace(/^\d+[.)]\s*/, '')          // "1. חוזקות"
    .replace(/\*\*/g, '')                // "**חוזקות**"
    .replace(/[:：]\s*$/, '')            // trailing colon
    .trim();
  // Snap to a canonical section if the model used a near match.
  const match = CANONICAL_SECTIONS.find((c) => t === c || t.includes(c) || c.includes(t));
  return match || t;
}

// Split the model's response into structured sections. Tolerates **bold**
// headings, '##' headings, and numbered headings. Drops anything that isn't
// one of the four canonical sections so a stray "מסקנות" intro doesn't show
// up as its own card.
function parseSections(text) {
  const sections = [];
  let current = null;
  const isHeading = (l) =>
    /^\*\*(.+?)\*\*\s*$/.test(l) ||      // **חוזקות**
    /^#{1,6}\s+\S+/.test(l) ||           // ## חוזקות
    /^\d+[.)]\s+\S+/.test(l);            // 1. חוזקות

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      const title = normalizeTitle(line);
      current = { title, bullets: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: '', bullets: [] };
      sections.push(current);
    }
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      current.bullets.push(line.replace(/^[•\-*]\s*/, ''));
    } else {
      current.bullets.push(line);
    }
  }
  // Keep only canonical sections (drops stray "מסקנות" intros) and re-order
  // them deterministically for a consistent layout.
  const known = sections.filter((s) => CANONICAL_SECTIONS.includes(s.title) && s.bullets.length);
  known.sort((a, b) => CANONICAL_SECTIONS.indexOf(a.title) - CANONICAL_SECTIONS.indexOf(b.title));
  return known;
}

function renderBulletHtml(text) {
  const html = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i'], ALLOWED_ATTR: [] });
}

// ---- Stats dashboard --------------------------------------------------------
// Renders deterministic stats + mini charts BEFORE the AI commentary so the
// numbers come from us (trusted), not the model. The model only contextualizes
// them in the section cards below.

const fmt$ = (v) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`;
const fmt$Compact = (v) => {
  const sign = v >= 0 ? '+' : '-';
  const a = Math.abs(v);
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
};

function StatCard({ label, value, sub, tone = 'neutral', Icon }) {
  const toneClass = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-text-primary';
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className={`text-lg font-bold ${toneClass}`} dir="ltr">{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// Horizontal bars — each row shows a label, its P&L value, and a bar whose
// width is proportional to the absolute P&L. Profit = green, loss = red.
function PnlBars({ title, rows, Icon }) {
  if (!rows || !rows.length) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-accent-primary" />}
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const pct = (Math.abs(r.pnl) / max) * 100;
          const positive = r.pnl >= 0;
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-text-secondary">{r.key} <span className="text-text-muted">· {r.trades}</span></span>
                <span className={positive ? 'text-profit font-semibold' : 'text-loss font-semibold'} dir="ltr">{fmt$(r.pnl)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                <div
                  className={`h-full rounded-full ${positive ? 'bg-profit' : 'bg-loss'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Donut-ish split bar — wins (green) vs losses (red) as a single horizontal bar
// with their counts. Cheaper than a real donut and reads instantly.
function WinLossBar({ wins, losses }) {
  const total = wins + losses;
  if (!total) return null;
  const winPct = (wins / total) * 100;
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-text-secondary">פילוח עסקאות</span>
        <span className="text-text-muted">{total} סה"כ</span>
      </div>
      <div className="h-3 rounded-full bg-bg-tertiary overflow-hidden flex">
        <div className="h-full bg-profit" style={{ width: `${winPct}%` }} />
        <div className="h-full bg-loss" style={{ width: `${100 - winPct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span className="text-profit">● {wins} רווחים ({winPct.toFixed(0)}%)</span>
        <span className="text-loss">● {losses} הפסדים ({(100 - winPct).toFixed(0)}%)</span>
      </div>
    </div>
  );
}

function StatsDashboard({ stats }) {
  if (!stats || stats.empty) return null;
  const s = stats.summary || {};
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard
          label="P&L כולל"
          value={fmt$Compact(s.pnl || 0)}
          tone={(s.pnl || 0) >= 0 ? 'profit' : 'loss'}
          Icon={TrendingUp}
        />
        <StatCard label="אחוז הצלחה" value={`${s.winRate || 0}%`} sub={`${s.wins}/${s.total} עסקאות`} Icon={Target} />
        <StatCard
          label="Profit Factor"
          value={s.profitFactor != null ? s.profitFactor : '—'}
          sub={s.profitFactor >= 1.5 ? 'מצוין' : s.profitFactor >= 1 ? 'תקין' : 'לשיפור'}
          tone={s.profitFactor >= 1 ? 'profit' : 'loss'}
          Icon={Sparkles}
        />
        <StatCard
          label="רווח מול הפסד ממוצע"
          value={`${fmt$Compact(s.avgWin || 0)} / ${fmt$Compact(s.avgLoss || 0)}`}
          Icon={Lightbulb}
        />
      </div>

      <WinLossBar wins={s.wins || 0} losses={s.losses || 0} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <PnlBars title="מטבעות מובילים" rows={(stats.byPair || []).slice(0, 5)} Icon={TrendingUp} />
        {stats.bySession?.length > 0 && (
          <PnlBars title="לפי סשן מסחר" rows={stats.bySession} Icon={Target} />
        )}
        {stats.byStrategy?.length > 0 && !stats.bySession?.length && (
          <PnlBars title="לפי אסטרטגיה" rows={stats.byStrategy} Icon={Lightbulb} />
        )}
        {!stats.bySession?.length && !stats.byStrategy?.length && (stats.byDirection || []).length > 0 && (
          <PnlBars title="לפי כיוון" rows={stats.byDirection} Icon={TrendingDown} />
        )}
      </div>
    </div>
  );
}

// Animated "AI is thinking" indicator — cycles short labels so it feels like
// the model is actually working, not just spinning a wheel.
function ThinkingIndicator() {
  const steps = [
    'אוסף את העסקאות שלך',
    'מחפש דפוסי הפסד חוזרים',
    'משווה תקופות וביצועים',
    'מגבש המלצות פעולה',
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % steps.length), 1600);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <div className="flex items-start gap-3 bg-bg-secondary border border-border-primary rounded-2xl p-4">
      <div className="shrink-0 w-9 h-9 rounded-full bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
        <Bot className="w-4.5 h-4.5 text-accent-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-primary">TradeAI</span>
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" style={{ animationDelay: '180ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" style={{ animationDelay: '360ms' }} />
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-xs text-text-secondary mt-1"
          >
            {steps[i]}…
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function AICoachPanel({ trades }) {
  const { isPremium } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [stats, setStats] = useState(null); // computed snapshot used by the dashboard
  const [error, setError] = useState('');
  const [activePrompt, setActivePrompt] = useState(null);

  const run = async (promptKey = null) => {
    setActivePrompt(promptKey);
    setLoading(true);
    setError('');
    try {
      const built = buildCoachStats(trades, { premium: isPremium });
      if (built.empty) {
        setError(isPremium ? 'אין עדיין עסקאות סגורות לנתח.' : 'אין עסקאות סגורות החודש. הוסף עסקאות כדי לקבל ניתוח.');
        setReport('');
        setStats(null);
        return;
      }
      setStats(built);
      const text = await generateCoachReport(promptKey ? { ...built, focus: promptKey } : built, isPremium ? 'deep' : 'short');
      setReport(text);
    } catch (e) {
      setError(e.message || 'הניתוח נכשל. נסה שוב בעוד רגע.');
      setReport('');
    } finally {
      setLoading(false);
    }
  };

  const sections = report ? parseSections(report) : [];

  return (
    <div className="space-y-4 mt-2 max-w-3xl mx-auto">
      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-accent-primary/25 bg-gradient-to-l from-accent-primary/10 via-bg-secondary to-bg-secondary p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-11 h-11 rounded-2xl bg-accent-primary/15 border border-accent-primary/40 flex items-center justify-center">
              <BrainCircuit className="w-6 h-6 text-accent-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-text-primary">ניתוח AI אישי</h2>
                {isPremium && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-primary text-bg-primary font-bold">
                    <Crown className="w-2.5 h-2.5" /> Premium
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                ה-AI יעבור על העסקאות שלך, יזהה דפוסים, ויכתוב לך מה לשפר.
                {!isPremium && ' במסלול החינמי הניתוח מבוסס על החודש האחרון בלבד.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => run(null)}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> מנתח...</>
              : <><BrainCircuit className="w-4 h-4" /> נתח עסקאות</>}
          </button>
        </div>
      </motion.div>

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-2">
        {(isPremium ? [...FREE_PROMPTS, ...PREMIUM_PROMPTS] : FREE_PROMPTS).map((p) => (
          <button
            key={p.id}
            onClick={() => run(p.id)}
            disabled={loading}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${
              activePrompt === p.id
                ? 'bg-accent-primary/15 border-accent-primary text-accent-primary'
                : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary hover:border-border-hover'
            }`}
          >
            {p.label}
          </button>
        ))}
        {!isPremium && PREMIUM_PROMPTS.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate('/premium')}
            className="text-xs px-3 py-1.5 rounded-full border border-accent-primary/30 bg-bg-secondary text-text-muted hover:text-accent-primary cursor-pointer inline-flex items-center gap-1"
            title="שדרג ל-Premium כדי לפתוח"
          >
            <Lock className="w-3 h-3" />
            {p.label}
          </button>
        ))}
      </div>

      {/* Thinking indicator while the model is working */}
      {loading && <ThinkingIndicator />}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-loss/30 bg-loss/10 text-sm text-loss">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{error}</p>
            {error.includes('שדרג ל-Premium') && (
              <button onClick={() => navigate('/premium')} className="mt-1 text-xs underline text-accent-primary cursor-pointer">
                לשדרוג Premium
              </button>
            )}
          </div>
        </div>
      )}

      {/* Structured chat-style report */}
      {sections.length > 0 && !loading && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {/* Bot intro bubble */}
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
              <Bot className="w-4.5 h-4.5 text-accent-primary" />
            </div>
            <div className="flex-1 bg-bg-secondary border border-border-primary rounded-2xl rounded-tr-sm px-4 py-3">
              <div className="text-xs font-semibold text-text-primary mb-0.5 flex items-center gap-1">
                TradeAI
                <span className="text-[10px] text-text-muted">· ניתוח שהושלם</span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                סיימתי לעבור על העסקאות שלך. הנה מה שמצאתי:
              </p>
            </div>
          </div>

          {/* Stats dashboard — deterministic numbers + mini charts */}
          <StatsDashboard stats={stats} />

          {/* Section cards */}
          {sections.map((s, idx) => {
            const meta = SECTION_META[s.title] || DEFAULT_META;
            const { Icon } = meta;
            return (
              <motion.div
                key={`${s.title}-${idx}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * idx }}
                className={`border ${meta.border} ${meta.bg} rounded-2xl p-4 space-y-2`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                  <h3 className={`text-sm font-bold ${meta.color}`}>{s.title || 'מסקנות'}</h3>
                </div>
                <ul className="space-y-1.5">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-primary leading-relaxed">
                      <span className={`mt-2 inline-block w-1.5 h-1.5 rounded-full ${meta.color.replace('text-', 'bg-')} shrink-0`} />
                      <span dangerouslySetInnerHTML={{ __html: renderBulletHtml(b) }} />
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Footer upsell for free users */}
      {!isPremium && (
        <div className="text-center text-[11px] text-text-muted pt-2">
          {`במסלול החינמי: 5 ניתוחים בחודש, מבוסס על החודש האחרון בלבד.`}
          <button onClick={() => navigate('/premium')} className="text-accent-primary mr-1 cursor-pointer">
            שדרג ל-Premium לניתוחים ללא הגבלה
          </button>
        </div>
      )}
    </div>
  );
}
