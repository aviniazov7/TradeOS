import { motion } from 'framer-motion';
import { RefreshCw, TrendingUp, TrendingDown, Target, Lightbulb, Sparkles } from 'lucide-react';
import { renderBulletHtml } from '../../utils/renderBulletHtml';
import { parseSections } from '../../utils/aiReportSections';

const SECTION_META = {
  'חוזקות': { Icon: TrendingUp, color: 'text-profit', bg: 'bg-profit/10', border: 'border-profit/30' },
  'חולשות': { Icon: TrendingDown, color: 'text-loss', bg: 'bg-loss/10', border: 'border-loss/30' },
  'המלצות לפעולה': { Icon: Target, color: 'text-accent-primary', bg: 'bg-accent-primary/10', border: 'border-accent-primary/30' },
  'תובנות מתקדמות': { Icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
};
const DEFAULT_META = { Icon: Sparkles, color: 'text-text-primary', bg: 'bg-bg-tertiary', border: 'border-border-primary' };

// Shared renderer for an AI report: coloured section cards, with a raw-text
// fallback so a model that breaks the contract never yields a blank panel.
export default function AiReport({ report, onRerun }) {
  const sections = report ? parseSections(report) : [];
  if (!report) return null;

  if (sections.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-border-primary bg-bg-tertiary/40 p-4 text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{report}</div>
        {onRerun && (
          <button onClick={onRerun} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-xs font-semibold text-text-secondary hover:text-accent-primary transition-colors cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> נתח שוב
          </button>
        )}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      {sections.map((s, idx) => {
        const meta = SECTION_META[s.title] || DEFAULT_META;
        const { Icon } = meta;
        return (
          <div key={`${s.title}-${idx}`} className={`border ${meta.border} ${meta.bg} rounded-2xl p-4 space-y-2`}>
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${meta.color}`} />
              <h3 className={`text-sm font-bold ${meta.color}`}>{s.title}</h3>
            </div>
            <ul className="space-y-1.5">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-sm text-text-primary leading-relaxed">
                  <span className={`mt-2 inline-block w-1.5 h-1.5 rounded-full ${meta.color.replace('text-', 'bg-')} shrink-0`} />
                  <span dangerouslySetInnerHTML={{ __html: renderBulletHtml(b) }} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {onRerun && (
        <button onClick={onRerun} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-xs font-semibold text-text-secondary hover:text-accent-primary transition-colors cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> נתח שוב
        </button>
      )}
    </motion.div>
  );
}
