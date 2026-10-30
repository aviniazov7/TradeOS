import { useState } from 'react';
import { useAiUsage } from '../../hooks/useAiUsage';
import { dailyAiQuotaMessage, isDailyAiQuotaExhausted } from '../../utils/aiQuotaGate';
import { useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';
import { BrainCircuit, Sparkles, RefreshCw, AlertCircle, Crown, MapPin, AlertTriangle, Footprints } from 'lucide-react';
import ThinkingIndicator from '../shared/ThinkingIndicator';
import { generateCoachReport } from '../../services/aiCoachService';
import { parseSections } from '../../utils/aiReportSections';
import { renderBulletHtml } from '../../utils/renderBulletHtml';
import { buildAiSummary } from '../../utils/traderStage';
import { formatDateTime } from '../../utils/formatters';
import { readAiAnalysis, writeAiAnalysis } from './journeyStorage';
import { panel } from './journeyStyle';

const STEPS = ['קורא את מפת ההתפתחות...', 'משווה מול שערי השלב הבא...', 'מזהה את החסם המרכזי...', 'מנסח את הצעד הבא...'];

// The coach endpoint answers in its fixed three-section contract; here each
// section is read as one question of the "where am I" narrative.
const SECTION_VIEW = {
  חוזקות: { title: 'איפה אתה עומד', Icon: MapPin, color: 'text-accent-hover', dot: 'bg-accent-primary' },
  חולשות: { title: 'מה מעכב אותך', Icon: AlertTriangle, color: 'text-breakeven', dot: 'bg-breakeven' },
  'המלצות לפעולה': { title: 'הצעד הבא', Icon: Footprints, color: 'text-profit', dot: 'bg-profit' },
  'תובנות מתקדמות': { title: 'תובנות נוספות', Icon: Sparkles, color: 'text-text-secondary', dot: 'bg-text-muted' },
};

export default function JourneyAiPanel({ assessment, uid, isPremium }) {
  const navigate = useNavigate();
  const [result, setResult] = useState(() => readAiAnalysis(uid));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const aiUsage = useAiUsage();
  const quotaMessage = isDailyAiQuotaExhausted(aiUsage) ? dailyAiQuotaMessage(aiUsage) : '';

  const blocked = assessment.insufficient;

  const run = async () => {
    if (loading || blocked) return;
    if (quotaMessage) {
      setError(quotaMessage);
      return;
    }
    setLoading(true);
    setError('');
    let called = false;
    try {
      // Short report on purpose: the narrative is three short answers, and a
      // short run costs the least of the user's coach quota.
      called = true;
      const text = await generateCoachReport(buildAiSummary(assessment), 'short', 'journal');
      if (!text.trim()) throw new Error('ה-AI החזיר תשובה ריקה. נסה שוב בעוד רגע.');
      const next = { text, at: Date.now(), stageIndex: assessment.stage.index, stageName: assessment.stage.name };
      setResult(next);
      writeAiAnalysis(uid, next);
    } catch (e) {
      setError(e?.message || 'הניתוח נכשל. נסה שוב בעוד רגע.');
    } finally {
      setLoading(false);
      if (called) aiUsage.refresh();
    }
  };

  const sections = result ? parseSections(result.text) : [];
  const stale = result && result.stageIndex != null && result.stageIndex !== assessment.stage.index;

  return (
    <section className={panel} aria-label="ניתוח AI אישי">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)' }} aria-hidden>
            <BrainCircuit className="w-5 h-5" style={{ color: '#06060a' }} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm md:text-[15px] font-bold text-text-primary">ניתוח AI אישי</h2>
              {isPremium && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-hover font-bold">
                  <Crown className="w-2.5 h-2.5" aria-hidden /> Premium
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5">איפה אתה, מה מעכב אותך והצעד החשוב ביותר הבא</p>
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading || blocked || !!quotaMessage}
          className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin" aria-hidden /> מנתח...</>
            : <><Sparkles className="w-4 h-4" aria-hidden /> {result ? 'נתח מחדש' : 'נתח אותי'}</>}
        </button>
      </div>

      <p className="text-[11px] text-text-muted mt-3 leading-relaxed">
        נשלח ל-AI רק סיכום של המפה (שלב, ציונים, ראיות ויעדים), בלי רשימת העסקאות.
        {!isPremium && ' במסלול החינמי כל ניתוח נספר מתוך 5 ניתוחי ה-AI החודשיים.'}
      </p>

      {blocked && !result && (
        <p className="mt-3 text-xs text-text-secondary rounded-xl bg-bg-tertiary border border-border-primary p-3">
          הניתוח נפתח אחרי שיש מספיק נתונים להערכה (לפחות 10 עסקאות סגורות).
        </p>
      )}

      {loading && <div className="mt-4"><ThinkingIndicator steps={STEPS} /></div>}

      {(error || quotaMessage) && !loading && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-xl border border-loss/30 bg-loss/10 text-sm text-loss" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-0">
            <p>{error || quotaMessage}</p>
            {(error || quotaMessage).includes('Premium') && (
              <button type="button" onClick={() => navigate('/premium')} className="mt-1 text-xs underline text-accent-primary cursor-pointer">
                לשדרוג Premium
              </button>
            )}
          </div>
        </div>
      )}

      {result && !loading && (
        <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
          <p className="text-[11px] text-text-muted">
            נוצר ב-<span className="num-mono" dir="ltr">{formatDateTime(new Date(result.at))}</span>
            {stale && <span className="text-breakeven"> · השלב שלך השתנה מאז ({result.stageName} ← {assessment.stage.name}), כדאי לנתח מחדש</span>}
          </p>
          {sections.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {sections.map((s) => {
                const view = SECTION_VIEW[s.title] || SECTION_VIEW['תובנות מתקדמות'];
                const { Icon } = view;
                const isNext = s.title === 'המלצות לפעולה';
                return (
                  <div key={s.title} className="rounded-xl bg-bg-tertiary border border-border-primary p-3.5 min-w-0">
                    <h3 className={`flex items-center gap-1.5 text-xs font-bold ${view.color} mb-2`}>
                      <Icon className="w-3.5 h-3.5" aria-hidden />{view.title}
                    </h3>
                    <ul className="space-y-2">
                      {s.bullets.map((b, i) => (
                        <li
                          key={i}
                          className={`flex gap-2 text-[13px] leading-relaxed ${isNext && i === 0 ? 'text-text-primary font-semibold rounded-lg bg-profit/10 border border-profit/25 p-2' : 'text-text-secondary'}`}
                        >
                          <span className={`mt-2 w-1.5 h-1.5 rounded-full ${view.dot} shrink-0`} aria-hidden />
                          <span className="min-w-0" dangerouslySetInnerHTML={{ __html: renderBulletHtml(b) }} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{result.text}</p>
          )}
        </m.div>
      )}
    </section>
  );
}
