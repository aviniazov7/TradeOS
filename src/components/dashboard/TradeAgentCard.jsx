import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { buildCoachStats } from '../../utils/coachStats';

// ── Trade Agent card ────────────────────────────────────────────────────────
// A compact "AI agent" summary of the user's trades, right on the dashboard.
// The insight is derived from buildCoachStats (real numbers) — no external AI
// call yet, so it works instantly and for free. When a model key is wired, the
// same buildCoachStats payload feeds the model for a deeper natural-language
// read; this card becomes its teaser.

function tagStyle(tone) {
  if (tone === 'loss') return { color: '#ff6b6b', borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)' };
  if (tone === 'profit') return { color: '#26d07c', borderColor: 'rgba(38,208,124,0.35)', background: 'rgba(38,208,124,0.08)' };
  return { color: 'var(--color-text-muted)', borderColor: 'rgba(255,255,255,0.12)' };
}

function analyze(stats) {
  if (!stats || stats.empty) return null;
  const s = stats.summary;
  if (!s || !s.total) return null;

  const absLoss = Math.abs(s.avgLoss);
  const worstPair = (stats.byPair || []).filter((p) => p.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0];
  const bestPair = (stats.byPair || []).filter((p) => p.pnl > 0).sort((a, b) => b.pnl - a.pnl)[0];

  let headline;
  if (s.avgWin > 0 && absLoss > s.avgWin * 1.25) {
    headline = `אתה מרוויח בקטן ומפסיד בגדול — רווח ממוצע $${s.avgWin} מול הפסד ממוצע $${absLoss}. הדק סטופים או תן לרווחים לרוץ יותר.`;
  } else if (s.profitFactor != null && s.profitFactor < 1) {
    headline = `פקטור הרווח שלך הוא ${s.profitFactor} — אתה מוחק יותר ממה שאתה מרוויח. שווה לזהות אילו סטאפים מדממים ולהוריד אותם.`;
  } else if (s.winRate < 40) {
    headline = `אחוז ההצלחה שלך ${s.winRate}% — נמוך. שווה לחכות לאישור לפני כניסה במקום להקדים.`;
  } else if (s.pnl >= 0) {
    headline = `אתה במסלול טוב — ${s.winRate}% הצלחה ורווח כולל של $${s.pnl}. שמור על המשמעת ואל תגדיל סיכון אחרי רצף מנצח.`;
  } else {
    headline = `${s.total} עסקאות נותחו · ${s.winRate}% הצלחה. המשך לתעד — ככל שיהיה יותר דאטה, הניתוח יהיה חד יותר.`;
  }

  const tags = [];
  if (worstPair) tags.push({ text: `${worstPair.key} ${worstPair.pnl}$`, tone: 'loss' });
  if (bestPair) tags.push({ text: `${bestPair.key} +${bestPair.pnl}$`, tone: 'profit' });
  tags.push({ text: `Win ${s.winRate}%`, tone: s.winRate >= 50 ? 'profit' : 'muted' });
  if (s.profitFactor != null) tags.push({ text: `PF ${s.profitFactor}`, tone: s.profitFactor >= 1 ? 'profit' : 'loss' });

  return { headline, tags, total: s.total };
}

export default function TradeAgentCard({ trades }) {
  const navigate = useNavigate();
  const stats = useMemo(() => buildCoachStats(trades, { premium: true }), [trades]);
  const a = useMemo(() => analyze(stats), [stats]);

  if (!a) return null; // not enough closed trades yet

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 mb-4 border"
      style={{
        borderColor: 'rgba(59,130,246,0.32)',
        background: 'radial-gradient(130% 120% at 100% 0%, rgba(59,130,246,0.15) 0%, transparent 58%), rgba(13,13,18,0.75)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl shrink-0 grid place-items-center"
          style={{ background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)', boxShadow: '0 0 18px -4px rgba(59,130,246,0.6)' }}
        >
          <Sparkles className="w-5 h-5" style={{ color: '#06060a' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-text-primary">הסוכן שלך</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>AI</span>
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">ניתוח {a.total} העסקאות שלך</div>
        </div>
      </div>

      <p className="text-sm leading-relaxed mt-3 text-text-secondary">{a.headline}</p>

      {a.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {a.tags.map((t, i) => (
            <span key={i} className="text-[11px] font-semibold px-2 py-1 rounded-full border" style={tagStyle(t.tone)}>
              {t.text}
            </span>
          ))}
        </div>
      )}

      <button
        // TradeAI is the AI destination: it opens on this same book (the hub
        // shows P&L, win rate and open positions), and from there the trader
        // can reach the chat, the chart reader and the full analyst without
        // leaving the page. The journal modal is the narrower of the two.
        onClick={() => navigate('/trade-ai')}
        className="mt-3.5 w-full flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-xl text-white transition-transform hover:brightness-110"
        style={{ background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)' }}
      >
        ניתוח מלא עם AI <ArrowLeft className="w-4 h-4" />
      </button>
    </div>
  );
}
