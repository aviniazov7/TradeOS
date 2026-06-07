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

// Split the model's response into structured sections by **heading** lines,
// keeping bullet content under each. Inline **bold** is preserved per bullet.
function parseSections(text) {
  const sections = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^\*\*(.+?)\*\*\s*$/);
    if (heading) {
      current = { title: heading[1].trim(), bullets: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      // Stray text before any heading — start an unlabeled section.
      current = { title: '', bullets: [] };
      sections.push(current);
    }
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      current.bullets.push(line.replace(/^[•\-*]\s*/, ''));
    } else {
      // Heading-less paragraph: still treat as one bullet for uniform styling.
      current.bullets.push(line);
    }
  }
  return sections.filter((s) => s.bullets.length);
}

function renderBulletHtml(text) {
  const html = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i'], ALLOWED_ATTR: [] });
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
  const [error, setError] = useState('');
  const [activePrompt, setActivePrompt] = useState(null);

  const run = async (promptKey = null) => {
    setActivePrompt(promptKey);
    setLoading(true);
    setError('');
    try {
      const stats = buildCoachStats(trades, { premium: isPremium });
      if (stats.empty) {
        setError(isPremium ? 'אין עדיין עסקאות סגורות לנתח.' : 'אין עסקאות סגורות החודש. הוסף עסקאות כדי לקבל ניתוח.');
        setReport('');
        return;
      }
      const text = await generateCoachReport(promptKey ? { ...stats, focus: promptKey } : stats, isPremium ? 'deep' : 'short');
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
          {`במסלול החינמי: 3 ניתוחים בחודש, מבוסס על החודש האחרון בלבד.`}
          <button onClick={() => navigate('/premium')} className="text-accent-primary mr-1 cursor-pointer">
            שדרג ל-Premium לניתוחים ללא הגבלה
          </button>
        </div>
      )}
    </div>
  );
}
