import { useState } from 'react';
import { m } from 'framer-motion';
import { BrainCircuit, RefreshCw, AlertCircle, TrendingUp, TrendingDown, Target, Lightbulb, Sparkles } from 'lucide-react';
import Modal from '../shared/Modal';
import ThinkingIndicator from '../shared/ThinkingIndicator';
import { renderBulletHtml } from '../../utils/renderBulletHtml';
import { generateCoachReport } from '../../services/aiCoachService';
import { fmtUsd, shortWallet } from '../../utils/polymarketScore';
import { dailyAiQuotaMessage, isDailyAiQuotaExhausted } from '../../utils/aiQuotaGate';

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
  const isHeading = (l) => /^\*\*(.+?)\*\*\s*$/.test(l) || /^#{1,6}\s+\S+/.test(l);
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

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Compact, prompt-cheap summary of the wallet for the analyst.
function buildPayload(row, positions, split) {
  const top = [...positions]
    .sort((a, b) => (b.conviction || 0) - (a.conviction || 0))
    .slice(0, 10)
    .map((p) => ({
      market: (p.title || '').slice(0, 70),
      outcome: p.outcome,
      valueUsd: Math.round(p.currentValue),
      pnlUsd: Math.round(p.cashPnl),
      sharePct: Math.round((p.conviction || 0) * 100),
      redeemable: !!p.redeemable,
    }));
  return {
    wallet: shortWallet(row?.wallet),
    name: row?.name || null,
    days30: row ? { pnlUsd: Math.round(row.pnl), roiPct: round2(row.roi), volumeUsd: Math.round(row.volume), smartScore: row.smartScore } : null,
    openPositions: positions.length,
    realizedUsd: Math.round(split.realized),
    unrealizedUsd: Math.round(split.unrealized),
    topPositions: top,
  };
}

const STEPS = ['קורא את פוזיציות הארנק', 'מודד ריכוזיות ונתחי-תיק', 'משווה ממומש מול לא-ממומש', 'מגבש שורה תחתונה'];

// "האנליסט הפרטי" — one click turns a smart-money wallet's public book into a
// structured Hebrew read (strengths / weaknesses / what to watch).
export default function WalletAnalystModal({ isOpen, onClose, row, positions, split, aiUsage = null }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const quotaOut = isDailyAiQuotaExhausted(aiUsage);
  const quotaMessage = dailyAiQuotaMessage(aiUsage || {});

  const run = async () => {
    if (quotaOut) {
      setError(quotaMessage);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = buildPayload(row, positions, split);
      const text = await generateCoachReport(payload, 'deep', 'polymarket');
      setReport(text);
    } catch (e) {
      setError(e.message || 'הניתוח נכשל. נסה שוב בעוד רגע.');
      setReport('');
    } finally {
      setLoading(false);
      aiUsage?.refresh?.();
    }
  };

  const sections = report ? parseSections(report) : [];
  const title = row?.name || shortWallet(row?.wallet);

  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="ניתוח ארנק AI" maxWidth="max-w-2xl"
      title={(
        <span className="inline-flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-accent-primary" />
          <span className="font-bold text-text-primary">האנליסט הפרטי · {title}</span>
        </span>
      )}>
      <div className="space-y-4">
        {/* Launcher */}
        {!report && !loading && (
          <div className="text-center py-4">
            <p className="text-sm text-text-secondary leading-relaxed mb-4 max-w-md mx-auto">
              ה-AI יקרא את התיק הציבורי של הארנק — {positions.length} פוזיציות בשווי {fmtUsd(positions.reduce((s, p) => s + (p.currentValue || 0), 0))} —
              ויחזיר ניתוח: איפה הוא חזק, איפה הסיכון, ומה שווה מעקב.
            </p>
            {quotaOut ? (
              <p className="text-sm font-semibold text-loss">{quotaMessage}</p>
            ) : (
              <button onClick={run}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer">
                <BrainCircuit className="w-4 h-4" /> נתח את הארנק
              </button>
            )}
          </div>
        )}

        {loading && <ThinkingIndicator steps={STEPS} />}

        {error && !loading && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-loss/30 bg-loss/10 text-sm text-loss">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {sections.length > 0 && !loading && (
          <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
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
            {quotaOut ? (
              <p className="text-xs font-semibold text-loss">{quotaMessage}</p>
            ) : (
              <button onClick={run} disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-xs font-semibold text-text-secondary hover:text-accent-primary transition-colors cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" /> נתח שוב
              </button>
            )}
          </m.div>
        )}

        {/* The model answered but broke the section contract — show the raw text
            rather than leaving a blank modal with no way to retry. */}
        {report && sections.length === 0 && !loading && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border-primary bg-bg-tertiary/40 p-4 text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{report}</div>
            {quotaOut ? (
              <p className="text-xs font-semibold text-loss">{quotaMessage}</p>
            ) : (
              <button onClick={run}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-xs font-semibold text-text-secondary hover:text-accent-primary transition-colors cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" /> נתח שוב
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
