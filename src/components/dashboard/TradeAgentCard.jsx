import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, ArrowUpRight, ArrowDownRight, CalendarDays, Target } from 'lucide-react';
import { buildCoachStats } from '../../utils/coachStats';
import { conclusionsReady, NOT_ENOUGH_DATA_NOTE } from '../../utils/coachCopy';
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
  if (!conclusionsReady(s.total)) {
    headline = NOT_ENOUGH_DATA_NOTE;
  } else if (s.avgWin > 0 && absLoss > s.avgWin * 1.25) {
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

  if (!a) {
    return (
      <section className="panel agent" aria-labelledby="agentTitle">
        <div className="agent__head">
          <span className="agent__mark" aria-hidden><Sparkles className="w-5 h-5" /></span>
          <div>
            <div className="agent__title-row">
              <h2 className="agent__title" id="agentTitle">הסוכן שלך</h2>
              <span className="chip chip--accent">AI</span>
            </div>
            <div className="agent__sub">ממתין לעסקאות סגורות</div>
          </div>
        </div>
        <p className="agent__headline">
          הסוכן קורא את היומן שלך ומסמן איפה הכסף נכנס ואיפה הוא יוצא. ברגע שתסגור את העסקה הראשונה יופיעו כאן הממצאים — הזוג הכי רווחי, הזוג הכי יקר, ולונג מול שורט.
        </p>
        <button type="button" onClick={() => navigate('/journal?new=1')} className="btn btn--outline agent__cta">
          הוסף עסקה ראשונה <ArrowLeft className="w-4 h-4" />
        </button>
      </section>
    );
  }

  return (
    <section className="panel agent" aria-labelledby="agentTitle">
      <div className="agent__head">
        <span className="agent__mark" aria-hidden><Sparkles className="w-5 h-5" /></span>
        <div>
          <div className="agent__title-row">
            <h2 className="agent__title" id="agentTitle">הסוכן שלך</h2>
            <span className="chip chip--accent">AI</span>
          </div>
          <div className="agent__sub">ניתוח {a.total} העסקאות שלך</div>
        </div>
      </div>
      <p className="agent__headline">{a.headline}</p>
      {a.rows.length > 0 && (
        <div className="agent__findings">
          {a.rows.map((r) => (
            <div key={r.key} className="finding">
              <span className="finding__label">{r.label}</span>
              <span className={`finding__value ${TONE[r.tone] || ''}`}>
                {r.pair ? <CoinIcon pair={r.pair} className="w-4 h-4" /> : r.Icon && <r.Icon className="w-4 h-4" />}
                <span dir={r.pair ? 'ltr' : undefined}>{r.pair || r.value}</span>
                {r.pair && <span className="num" dir="ltr">{r.value}</span>}
              </span>
              <span className="finding__sub">{r.sub}</span>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => navigate('/trade-ai')}
        className="btn btn--outline agent__cta"
      >
        ניתוח מלא עם AI <ArrowLeft className="w-4 h-4" />
      </button>
    </section>
  );
}
