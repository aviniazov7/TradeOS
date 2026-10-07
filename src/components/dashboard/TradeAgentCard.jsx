import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { buildCoachStats } from '../../utils/coachStats';
import CoinIcon from '../shared/CoinIcon';
import { LRM } from '../../utils/formatters';

// ── Trade Agent card ────────────────────────────────────────────────────────
// A compact "AI agent" summary of the user's trades, right on the dashboard.
// The insight is derived from buildCoachStats (real numbers) — no external AI
// call yet, so it works instantly and for free. When a model key is wired, the
// same buildCoachStats payload feeds the model for a deeper natural-language
// read; this card becomes its teaser.

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

  // The pair costing the most and the one earning the most — the win rate and
  // profit factor already sit in the KPI row right below.
  const tags = [];
  if (worstPair) tags.push({ pair: worstPair.key, pnl: worstPair.pnl });
  if (bestPair) tags.push({ pair: bestPair.key, pnl: bestPair.pnl });

  return { headline, tags, total: s.total };
}

export default function TradeAgentCard({ trades }) {
  const navigate = useNavigate();
  const stats = useMemo(() => buildCoachStats(trades, { premium: true }), [trades]);
  const a = useMemo(() => analyze(stats), [stats]);

  if (!a) return null; // not enough closed trades yet

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 md:p-5 border bg-bg-secondary h-full flex flex-col gap-3.5"
      style={{
        borderColor: 'rgba(59,130,246,0.3)',
        backgroundImage: 'radial-gradient(120% 100% at 100% 0%, rgba(59,130,246,0.14) 0%, transparent 60%)',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl shrink-0 grid place-items-center"
          style={{ background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)', boxShadow: '0 0 18px -4px rgba(59,130,246,0.6)' }}>
          <Sparkles className="w-5 h-5" style={{ color: '#06060a' }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-extrabold text-text-primary">הסוכן שלך</h2>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-hover">AI</span>
          </div>
          <div className="text-xs text-text-secondary mt-0.5">ניתוח {a.total} העסקאות שלך</div>
        </div>
      </div>

      <p className="text-[15px] leading-relaxed text-text-primary/90">{a.headline}</p>

      {a.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.tags.map((t) => (
            <span key={t.pair} className={`inline-flex items-center gap-1.5 text-xs font-bold ps-1 pe-2.5 py-1 rounded-full ${t.pnl < 0 ? 'bg-loss/12 text-loss' : 'bg-profit/12 text-profit'}`}>
              <CoinIcon pair={t.pair} className="w-4 h-4" />
              <span dir="ltr">{t.pair} {LRM}{t.pnl < 0 ? '−' : '+'}${Math.abs(t.pnl)}</span>
            </span>
          ))}
        </div>
      )}

      <button
        // TradeAI is the AI destination: it opens on this same book (the hub
        // shows P&L, win rate and open positions), and from there the trader
        // can reach the chat, the chart reader and the full analyst.
        onClick={() => navigate('/trade-ai')}
        className="mt-auto h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold bg-accent-primary/15 border border-accent-primary/35 text-accent-hover hover:bg-accent-primary/25 transition-colors cursor-pointer"
      >
        ניתוח מלא עם AI <ArrowLeft className="w-4 h-4" />
      </button>
    </div>
  );
}
