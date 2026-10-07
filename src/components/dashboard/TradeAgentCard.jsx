import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, ArrowUpRight, ArrowDownRight, CalendarDays, Target } from 'lucide-react';
import { buildCoachStats } from '../../utils/coachStats';
import CoinIcon from '../shared/CoinIcon';
import { LRM } from '../../utils/formatters';

// ── Trade Agent card ────────────────────────────────────────────────────────
// The home page's "AI agent": one sentence that says what matters most in the
// trader's book, then the few concrete findings behind it (the pair costing
// the most, the one earning the most, long vs short, this month vs last).
// Built from buildCoachStats (real numbers) — instant and free; the full AI
// read is one tap away.

const money = (v) => `${LRM}${v < 0 ? '−' : '+'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
// A signed amount inside Hebrew text: its own LTR island so the sign stays in front.
const M = ({ v }) => <span dir="ltr" className="inline-block">{money(v)}</span>;
const tradesLabel = (n) => (n === 1 ? 'עסקה אחת' : `${n} עסקאות`);

function analyze(stats) {
  if (!stats || stats.empty) return null;
  const s = stats.summary;
  if (!s || !s.total) return null;

  const absLoss = Math.abs(s.avgLoss);
  const pairs = stats.byPair || [];
  const worstPair = pairs.filter((p) => p.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0];
  const bestPair = pairs.filter((p) => p.pnl > 0).sort((a, b) => b.pnl - a.pnl)[0];

  let headline;
  if (s.avgWin > 0 && absLoss > s.avgWin * 1.25) {
    headline = `אתה מרוויח בקטן ומפסיד בגדול: רווח ממוצע $${s.avgWin} מול הפסד ממוצע $${absLoss}. הדק סטופים או תן לרווחים לרוץ יותר.`;
  } else if (s.profitFactor != null && s.profitFactor < 1) {
    headline = `פקטור הרווח שלך ${s.profitFactor}: אתה מאבד יותר ממה שאתה מרוויח. שווה לזהות אילו סטאפים מדממים ולהוריד אותם.`;
  } else if (s.winRate < 40) {
    headline = `אחוז ההצלחה שלך ${s.winRate}%, נמוך. שווה לחכות לאישור לפני כניסה במקום להקדים.`;
  } else if (s.pnl >= 0) {
    headline = `אתה במסלול טוב: ${s.winRate}% הצלחה ורווח כולל של $${s.pnl}. שמור על המשמעת ואל תגדיל סיכון אחרי רצף מנצח.`;
  } else {
    headline = `${s.total} עסקאות נותחו, ${s.winRate}% הצלחה. המשך לתעד — ככל שיש יותר נתונים, הניתוח חד יותר.`;
  }

  const rows = [];
  if (worstPair) rows.push({ key: 'worst', label: 'הזוג הכי מפסיד', pair: worstPair.key, value: money(worstPair.pnl), sub: tradesLabel(worstPair.trades), tone: 'loss' });
  if (bestPair) rows.push({ key: 'best', label: 'הזוג הכי רווחי', pair: bestPair.key, value: money(bestPair.pnl), sub: tradesLabel(bestPair.trades), tone: 'profit' });

  // Long vs short — which side actually pays.
  const dir = Object.fromEntries((stats.byDirection || []).map((d) => [d.key, d]));
  if (dir.long && dir.short) {
    const better = dir.long.pnl >= dir.short.pnl ? 'long' : 'short';
    rows.push({
      key: 'dir', label: 'לונג מול שורט', Icon: better === 'long' ? ArrowUpRight : ArrowDownRight,
      value: better === 'long' ? 'לונג עדיף' : 'שורט עדיף',
      sub: <>לונג <M v={dir.long.pnl} /> · שורט <M v={dir.short.pnl} /></>,
      tone: better === 'long' ? 'profit' : 'loss',
    });
  }

  // This month vs last.
  const cmp = stats.compareToPrevMonth;
  if (cmp?.thisMonth) {
    const now = cmp.thisMonth.pnl;
    const prev = cmp.prevMonth?.pnl;
    rows.push({
      key: 'month', label: 'החודש', Icon: CalendarDays, value: <M v={now} />,
      sub: prev != null ? <>חודש קודם <M v={prev} /></> : tradesLabel(cmp.thisMonth.total),
      tone: now >= 0 ? 'profit' : 'loss',
    });
  } else if (stats.byStrategy?.length) {
    const top = [...stats.byStrategy].sort((a, b) => b.pnl - a.pnl)[0];
    rows.push({ key: 'strategy', label: 'אסטרטגיה מובילה', Icon: Target, value: top.key, sub: <M v={top.pnl} />, tone: 'neutral' });
  }

  return { headline, rows: rows.slice(0, 4), total: s.total };
}

const TONE = { profit: 'text-profit', loss: 'text-loss', neutral: 'text-text-primary' };

export default function TradeAgentCard({ trades }) {
  const navigate = useNavigate();
  const stats = useMemo(() => buildCoachStats(trades, { premium: true }), [trades]);
  const a = useMemo(() => analyze(stats), [stats]);

  if (!a) return null; // not enough closed trades yet

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 md:p-5 border bg-bg-secondary h-full flex flex-col gap-4"
      style={{
        borderColor: 'rgba(59,130,246,0.3)',
        backgroundImage: 'radial-gradient(120% 90% at 100% 0%, rgba(59,130,246,0.14) 0%, transparent 60%)',
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

      {/* The one thing that matters most right now. */}
      <p className="text-[15px] leading-relaxed text-text-primary/90">{a.headline}</p>

      {/* The findings behind it. */}
      {a.rows.length > 0 && (
        <div className="rounded-xl bg-bg-tertiary border border-border-primary px-3">
          {a.rows.map((r) => (
            <div key={r.key} className="flex items-center gap-3 py-2.5 border-t border-border-primary/70 first:border-t-0">
              <span className="w-8 h-8 rounded-lg bg-bg-secondary border border-border-primary grid place-items-center shrink-0">
                {r.pair ? <CoinIcon pair={r.pair} className="w-5 h-5" /> : r.Icon && <r.Icon className={`w-4 h-4 ${TONE[r.tone]}`} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs text-text-secondary">{r.label}</span>
                <span className="block text-sm font-semibold text-text-primary truncate" dir={r.pair ? 'ltr' : undefined} style={r.pair ? { textAlign: 'right' } : undefined}>
                  {r.pair || r.value}
                </span>
              </span>
              <span className="text-left shrink-0">
                {r.pair && <span className={`block num-mono text-sm font-bold ${TONE[r.tone]}`} dir="ltr">{r.value}</span>}
                <span className="block text-[11px] text-text-secondary">{r.sub}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        // TradeAI is the AI destination: it opens on this same book, and from
        // there the trader can reach the chat, the chart reader and the analyst.
        onClick={() => navigate('/trade-ai')}
        className="mt-auto h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold bg-accent-primary/15 border border-accent-primary/35 text-accent-hover hover:bg-accent-primary/25 transition-colors cursor-pointer"
      >
        ניתוח מלא עם AI <ArrowLeft className="w-4 h-4" />
      </button>
    </div>
  );
}
