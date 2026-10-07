import { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, RefreshCw, AlertCircle, Lock, Sparkles, TrendingUp, TrendingDown, Target, Lightbulb, MessageSquareText } from 'lucide-react';
import { LRM } from '../../utils/formatters';
import { useNavigate } from 'react-router-dom';
import ThinkingIndicator from '../shared/ThinkingIndicator';
import { renderBulletHtml } from '../../utils/renderBulletHtml';
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
  'המלצות לפעולה': { Icon: Target, color: 'text-accent-hover', bg: 'bg-accent-primary/10', border: 'border-accent-primary/30' },
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

// Coach "thinking" step labels for the backtest AI analyst (see ThinkingIndicator).
const COACH_STEPS = ['אוסף את עסקאות הבקטסט', 'בוחן את ה-edge לפי אסטרטגיה', 'משווה סשנים וטיימפריימים', 'מגבש המלצות'];

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
      <div className="max-w-md mx-auto text-center py-8">
        <span className="inline-grid place-items-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'var(--accent-gradient)' }}>
          <Lock className="w-6 h-6" style={{ color: '#06060a' }} />
        </span>
        <h2 className="text-lg font-bold text-text-primary">ניתוח AI לבקטסט הוא חלק מ-Premium</h2>
        <p className="text-sm text-text-secondary leading-relaxed mt-2 mb-5">
          ה-AI בודק איפה ה-edge שלך, אילו אסטרטגיות וסשנים רווחיים, והאם התוכנית מוכנה למסחר חי.
        </p>
        <button onClick={() => navigate('/premium')} className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer">
          <Crown className="w-4 h-4" /> שדרוג ל-Premium
        </button>
      </div>
    );
  }

  const sections = report ? parseSections(report) : [];
  const signed = (v, suffix = '') => `${LRM}${v > 0 ? '+' : ''}${round(v)}${suffix}`;
  const tone = (v) => (v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-primary');
  const pf = stats.profitFactorR === Infinity ? '∞' : round(stats.profitFactorR);
  // The backtest at a glance — computed here, so it is right before any AI call.
  const figures = [
    { label: 'עסקאות', value: stats.total || 0, sub: `${stats.wins || 0} רווח · ${stats.losses || 0} הפסד` },
    { label: 'אחוז הצלחה', value: `${Math.round(stats.winRate || 0)}%` },
    { label: 'R ממוצע', value: signed(stats.avgR || 0, 'R'), cls: tone(stats.avgR) },
    { label: 'סה"כ R', value: signed(stats.totalR || 0, 'R'), cls: tone(stats.totalR), sub: `מקדם רווח ${pf}` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-border-primary bg-border-primary">
        {figures.map((f) => (
          <div key={f.label} className="bg-bg-tertiary px-3.5 py-3 min-w-0">
            <div className="text-xs text-text-secondary">{f.label}</div>
            <div className={`num-mono text-lg font-bold mt-0.5 ${f.cls || 'text-text-primary'}`} dir="ltr" style={{ textAlign: 'right' }}>{f.value}</div>
            {f.sub && <div className="text-[11px] text-text-muted mt-0.5 truncate">{f.sub}</div>}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border-primary bg-bg-secondary p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Sparkles className="w-4 h-4 text-accent-hover" /> מה ה-AI בודק
            </h3>
            <p className="text-xs text-text-secondary mt-1">ה-edge לפי אסטרטגיה, סשן וטיימפריים — והאם התוכנית מוכנה למסחר חי</p>
          </div>
          <button onClick={() => run(null)} disabled={loading}
            className="shrink-0 h-10 px-4 inline-flex items-center gap-1.5 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50">
            {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> מנתח...</> : <><Sparkles className="w-4 h-4" /> ניתוח מלא</>}
          </button>
        </div>
        <div className="mt-4 pt-4 border-t border-border-primary">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted mb-2.5">
            <MessageSquareText className="w-3.5 h-3.5" /> או שאלה ממוקדת
          </p>
          <div className="flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button key={p.id} onClick={() => run(p.id)} disabled={loading}
                className={`text-[13px] h-9 px-3.5 rounded-xl border transition-colors cursor-pointer disabled:opacity-50 ${
                  activePrompt === p.id
                    ? 'bg-accent-primary/15 border-accent-primary/60 text-accent-hover font-semibold'
                    : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary hover:border-border-hover'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <ThinkingIndicator steps={COACH_STEPS} />}

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
                className="rounded-2xl border border-border-primary bg-bg-secondary p-4">
                <h3 className={`flex items-center gap-2 text-sm font-bold ${meta.color}`}>
                  <span className={`w-7 h-7 grid place-items-center rounded-lg ${meta.bg}`}>{Icon && <Icon className="w-4 h-4" />}</span>
                  {s.title || 'מסקנות'}
                </h3>
                <ul className="mt-3 space-y-2">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-text-primary leading-relaxed">
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
