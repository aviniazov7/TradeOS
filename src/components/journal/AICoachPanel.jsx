import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Crown, RefreshCw, AlertCircle, Lock } from 'lucide-react';
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

// Render the model's markdown-ish bullets. We accept **bold**, • bullets, and
// section headings; everything else is plain text. Sanitize before injecting.
function renderReport(text) {
  if (!text) return null;
  const html = text
    .split('\n')
    .map((line) => {
      const l = line.trim();
      if (!l) return '<div class="h-2"></div>';
      // Section heading: **חוזקות** at start of line
      const heading = l.match(/^\*\*(.+?)\*\*\s*$/);
      if (heading) return `<h4 class="text-sm font-bold text-accent-primary mt-3 mb-1">${heading[1]}</h4>`;
      // Bullets — handle both Hebrew • and -/*
      if (l.startsWith('•') || l.startsWith('-') || l.startsWith('*')) {
        const inner = l.replace(/^[•\-*]\s*/, '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        return `<div class="flex gap-2 text-sm text-text-primary leading-relaxed"><span class="text-accent-primary mt-1">•</span><span>${inner}</span></div>`;
      }
      // Bold inline + plain
      const inline = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      return `<p class="text-sm text-text-primary leading-relaxed">${inline}</p>`;
    })
    .join('');
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['div', 'span', 'p', 'h4', 'b'], ALLOWED_ATTR: ['class'] });
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
      // Hint the model on what the user asked, but keep the system prompt fixed.
      const promptHint = promptKey
        ? { focus: promptKey }
        : null;
      const text = await generateCoachReport(promptHint ? { ...stats, focus: promptKey } : stats, isPremium ? 'deep' : 'short');
      setReport(text);
    } catch (e) {
      if (e.quotaExceeded) {
        setError(e.message);
      } else {
        setError(e.message || 'הניתוח נכשל. נסה שוב בעוד רגע.');
      }
      setReport('');
    } finally {
      setLoading(false);
    }
  };

  const promptsToShow = isPremium ? [...FREE_PROMPTS, ...PREMIUM_PROMPTS] : FREE_PROMPTS;

  return (
    <div className="space-y-4 mt-2">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-l from-accent-primary/10 to-transparent border border-accent-primary/20 rounded-2xl p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-accent-primary" />
              <h2 className="text-base font-bold text-text-primary">ניתוח AI אישי</h2>
              {isPremium && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-primary text-bg-primary font-bold">
                  <Crown className="w-2.5 h-2.5" /> Premium
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary">
              ה-AI יעבור על העסקאות שלך, יזהה דפוסים, ויכתוב לך מה לשפר.
              {!isPremium && ' במסלול החינמי הניתוח מבוסס על החודש האחרון בלבד.'}
            </p>
          </div>
          <button
            onClick={() => run(null)}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> מנתח...</>
              : <><Sparkles className="w-4 h-4" /> נתח עסקאות</>}
          </button>
        </div>
      </motion.div>

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-2">
        {promptsToShow.map((p) => (
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

      {/* Result */}
      {error && (
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
      {report && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="bg-bg-secondary border border-border-primary rounded-2xl p-5 space-y-1"
          dangerouslySetInnerHTML={{ __html: renderReport(report) }}
        />
      )}
      {loading && !report && (
        <div className="flex items-center justify-center gap-2 text-sm text-text-muted py-10">
          <RefreshCw className="w-4 h-4 animate-spin" /> ה-AI מנתח את העסקאות שלך...
        </div>
      )}

      {/* Premium upsell footer for free users */}
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
