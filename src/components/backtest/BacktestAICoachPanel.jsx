import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Crown, RefreshCw, AlertCircle, Lock, Sparkles, TrendingUp, TrendingDown, Target, Lightbulb, Bot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useAuth } from '../../contexts/AuthContext';
import { useBacktestStats } from '../../hooks/useBacktestStats';
import { generateCoachReport } from '../../services/aiCoachService';

// AI backtest analyst — premium only. Sends a compact R-based stats summary to
// the worker's /ai-coach (mode:'backtest', which swaps in a strategy-validation
// system prompt) and renders the same 4-section report the journal coach uses.

const PROMPTS = [
  { id: 'profit', label: 'איפה אני מרוויח הכי הרבה?' },
  { id: 'strategy', label: 'איזו אסטרטגיה הכי טובה?' },
  { id: 'planReview', label: 'האם התוכנית רווחית?' },
  { id: 'improve', label: 'מה לשפר?' },
];

const SECTION_META = {
  'חוזקות': { Icon: TrendingUp, color: 'text-profit', bg: 'bg-profit/10', border: 'border-profit/30' },
  'חולשות': { Icon: TrendingDown, color: 'text-loss', bg: 'bg-loss/10', border: 'border-loss/30' },
  'המלצות לפעולה': { Icon: Target, color: 'text-accent-primary', bg: 'bg-accent-primary/10', border: 'border-accent-primary/30' },
  'תובנות מתקדמות': { Icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
};
const DEFAULT_META = { Icon: Sparkles, color: 'text-text-primary', bg: 'bg-bg-tertiary', border: 'border-border-primary' };
const CANONICAL = ['חוזקות', 'חולשות', 'המלצות לפעולה', 'תובנות מתקדמות'];

function normalizeTitle(raw) {
  const t = raw.replace(/^#+\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/\*\*/g, '').replace(/[:：]\s*$/, '').trim();
  return CANONICAL.find((c) => t === c || t.includes(c) || c.includes(t)) || t;
}

function parseSections(text) {
  const sections = [];
  let current = null;
  const isHeading = (l) => /^\*\*(.+?)\*\*\s*$/.test(l) || /^#{1,6}\s+\S+/.test(l) || /^\d+[.)]\s+\S+/.test(l);
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) { current = { title: normalizeTitle(line), bullets: [] }; sections.push(current); continue; }
    if (!current) { current = { title: '', bullets: [] }; sections.push(current); }
    current.bullets.push(line.replace(/^[•\-*]\s*/, ''));
  }
  const known = sections.filter((s) => CANONICAL.includes(s.title) && s.bullets.length);
  known.sort((a, b) => CANONICAL.indexOf(a.title) - CANONICAL.indexOf(b.title));
  return known;
}

function renderBulletHtml(text) {
  return DOMPurify.sanitize(text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'), { ALLOWED_TAGS: ['b', 'i'], ALLOWED_ATTR: [] });
}

const round = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Aggregate the raw rows by a field (timeframe/direction) — useBacktestStats
// already covers strategy/pair/session, but not these two.
function aggBy(rows, field) {
  const m = {};
  for (const b of rows) {
    const k = b[field] || '—';
    if (!m[k]) m[k] = { name: k, count: 0, wins: 0, totalR: 0 };
    m[k].count++;
    if (b.result === 'win') m[k].wins++;
    m[k].totalR += b.rResult || 0;
  }
  return Object.values(m)
    .map((x) => ({ name: x.name, count: x.count, winRate: round(x.count ? (x.wins / x.count) * 100 : 0), avgR: round(x.count ? x.totalR / x.count : 0), totalR: round(x.totalR) }))
    .sort((a, b) => b.totalR - a.totalR);
}

function buildPayload(stats, rows, focus) {
  const map = (arr, keyName) => (arr || []).map((x) => ({ name: x[keyName], count: x.count, winRate: round(x.winRate), avgR: round(x.avgR), totalR: round(x.totalR) }));
  return {
    focus,
    summary: {
      total: stats.total, wins: stats.wins, losses: stats.losses,
      winRate: round(stats.winRate), avgR: round(stats.avgR), totalR: round(stats.totalR),
      profitFactor: stats.profitFactorR === Infinity ? '∞' : round(stats.profitFactorR),
      bestR: round(stats.bestR), worstR: round(stats.worstR),
      maxWinStreak: stats.maxWinStreak, maxLossStreak: stats.maxLossStreak,
    },
    byStrategy: map(stats.byStrategy, 'strategy'),
    bySession: map(stats.bySession, 'session'),
    byPair: map(stats.byPair, 'pair').slice(0, 8),
    byTimeframe: aggBy(rows, 'timeframe'),
    byDirection: aggBy(rows, 'direction'),
  };
}

function ThinkingIndicator() {
  const steps = ['אוסף את עסקאות הבקטסט', 'בוחן את ה-edge לפי אסטרטגיה', 'משווה סשנים וטיימפריימים', 'מגבש המלצות'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % steps.length), 1600);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <div className="flex items-start gap-3 bg-bg-secondary border border-border-primary rounded-2xl p-4">
      <div className="shrink-0 w-9 h-9 rounded-full bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
        <Bot className="w-5 h-5 text-accent-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-text-primary">TradeAI</span>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }} className="text-xs text-text-secondary mt-1">
            {steps[i]}…
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function BacktestAICoachPanel({ backtests }) {
  const { isPremium } = useAuth();
  const navigate = useNavigate();
  const stats = useBacktestStats(backtests);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const [activePrompt, setActivePrompt] = useState(null);

  const run = async (promptKey = null) => {
    setActivePrompt(promptKey);
    setLoading(true);
    setError('');
    try {
      if (!stats.total) {
        setError('אין עדיין עסקאות בקטסט לניתוח. הוסף עסקאות כדי לקבל ניתוח.');
        setReport('');
        return;
      }
      const payload = buildPayload(stats, backtests, promptKey || 'overview');
      const text = await generateCoachReport(payload, 'deep', 'backtest');
      setReport(text);
    } catch (e) {
      setError(e.message || 'הניתוח נכשל. נסה שוב בעוד רגע.');
      setReport('');
    } finally {
      setLoading(false);
    }
  };

  // Premium gate — this analysis is a Premium feature.
  if (!isPremium) {
    return (
      <div className="mt-2 max-w-lg mx-auto text-center py-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-primary/15 border border-accent-primary/30 mb-4">
          <Lock className="w-7 h-7 text-accent-primary" />
        </div>
        <h2 className="text-lg font-bold text-text-primary mb-1.5 flex items-center justify-center gap-2">
          ניתוח AI לבקטסט
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-primary text-bg-primary font-bold"><Crown className="w-2.5 h-2.5" /> Premium</span>
        </h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-5">
          תן ל-AI לנתח את תוכנית הבקטסט שלך — היכן ה-edge, אילו אסטרטגיות וסשנים רווחיים, והאם התוכנית מוכנה למסחר חי.
        </p>
        <button onClick={() => navigate('/premium')} className="px-5 py-2.5 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer">
          שדרג ל-Premium
        </button>
      </div>
    );
  }

  const sections = report ? parseSections(report) : [];

  return (
    <div className="space-y-4 mt-2 max-w-3xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-accent-primary/25 bg-gradient-to-l from-accent-primary/10 via-bg-secondary to-bg-secondary p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-11 h-11 rounded-2xl bg-accent-primary/15 border border-accent-primary/40 flex items-center justify-center">
              <BrainCircuit className="w-6 h-6 text-accent-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-text-primary">ניתוח AI לבקטסט</h2>
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-primary text-bg-primary font-bold"><Crown className="w-2.5 h-2.5" /> Premium</span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                ה-AI יעריך את ה-edge של האסטרטגיה, יאתר את הצירופים הרווחיים, ויגיד לך אם התוכנית מוכנה למסחר חי.
              </p>
            </div>
          </div>
          <button onClick={() => run(null)} disabled={loading}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">
            {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> מנתח...</> : <><BrainCircuit className="w-4 h-4" /> נתח בקטסט</>}
          </button>
        </div>
      </motion.div>

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <button key={p.id} onClick={() => run(p.id)} disabled={loading}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${
              activePrompt === p.id
                ? 'bg-accent-primary/15 border-accent-primary text-accent-primary'
                : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary hover:border-border-hover'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {loading && <ThinkingIndicator />}

      {error && !loading && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-loss/30 bg-loss/10 text-sm text-loss">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {sections.length > 0 && !loading && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {sections.map((s, idx) => {
            const meta = SECTION_META[s.title] || DEFAULT_META;
            const { Icon } = meta;
            return (
              <motion.div key={`${s.title}-${idx}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * idx }}
                className={`border ${meta.border} ${meta.bg} rounded-2xl p-4 space-y-2`}>
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
    </div>
  );
}
