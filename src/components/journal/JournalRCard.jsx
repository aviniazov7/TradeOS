import { useMemo } from 'react';
import { Target, ShieldAlert } from 'lucide-react';
import { computeRStats } from '../../utils/journalAnalytics';
import { formatCurrency } from '../../utils/formatters';
import { formatRText } from '../../utils/signedNumbers';
import Card from '../shared/Card';
import StatTile from '../shared/StatTile';

const fmtR = (v, digits = 2) => (v === null || v === undefined ? '—' : (formatRText(v, digits) || '—'));
const rTone = (v) => (v === null || v === undefined ? 'text-text-muted' : v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-primary');

// Performance measured in R (multiples of the risk taken). Only trades with a
// stop have an R, so the card also calls out how much trading happened
// without one — the single most useful thing it can tell a trader.
export default function JournalRCard({ trades }) {
  const r = useMemo(() => computeRStats(trades), [trades]);
  if (!r.closed) return null;
  const maxCount = Math.max(1, ...r.buckets.map((b) => b.count));

  return (
    <Card className="relative overflow-hidden p-4 md:p-5 mb-4 md:mb-6">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(70% 120% at 100% 0%, rgba(37,99,235,0.10) 0%, transparent 60%)' }} />

      <div className="relative flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary inline-flex items-center gap-1.5">
            <Target className="w-4 h-4 text-accent-primary" />ניתוח לפי R
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">כמה פעמים הסיכון הרווחת או הפסדת בכל עסקה</p>
        </div>
        {r.stopRate !== null && (
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
            r.stopRate >= 90 ? 'bg-profit/10 text-profit border-profit/25' : 'bg-breakeven/10 text-breakeven border-breakeven/25'
          }`}>
            {r.stopRate.toFixed(0)}% מהעסקאות עם סטופ
          </span>
        )}
      </div>

      {r.withStop > 0 ? (
        <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 grid grid-cols-2 gap-2 content-start">
            <StatTile inset label="תוחלת לעסקה" value={fmtR(r.expectancyR)} tone={rTone(r.expectancyR)}
              title="הממוצע של R לכל עסקה — מעל 0 אומר שהשיטה מרוויחה לאורך זמן" />
            <StatTile inset label="סה״כ R בתקופה" value={fmtR(r.totalR, 1)} tone={rTone(r.totalR)} />
            <StatTile inset label="רווח ממוצע" value={fmtR(r.avgWinR)} tone={rTone(r.avgWinR)} />
            <StatTile inset label="הפסד ממוצע" value={fmtR(r.avgLossR)} tone={rTone(r.avgLossR)}
              title="מתחת ל-‎-1R אומר שהפסדים עוברים את הסטופ (החלקה או הזזת סטופ)" />
            <StatTile inset label="העסקה הטובה" value={fmtR(r.bestR, 1)} tone={rTone(r.bestR)} />
            <StatTile inset label="העסקה הגרועה" value={fmtR(r.worstR, 1)} tone={rTone(r.worstR)} />
          </div>

          {/* Distribution — plain bars (no chart library on this card). */}
          <div className="lg:col-span-3">
            <p className="text-[11px] text-text-muted mb-2">התפלגות העסקאות ({r.withStop} עם סטופ)</p>
            <div className="flex items-end gap-1.5 h-36" dir="ltr">
              {r.buckets.map((b) => (
                <div key={b.label} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1">
                  <span className="num-mono text-[10px] text-text-secondary">{b.count || ''}</span>
                  <div
                    className={`w-full rounded-t-md transition-all duration-500 ${b.side === 'loss' ? 'bg-loss/70' : 'bg-profit/70'}`}
                    style={{ height: `${Math.max(b.count ? 6 : 2, (b.count / maxCount) * 100)}%`, opacity: b.count ? 1 : 0.25 }}
                    title={`${b.label}: ${b.count}`}
                  />
                  <span className="text-[9px] md:text-[10px] text-text-muted whitespace-nowrap">{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="relative text-sm text-text-muted">לאף עסקה בתקופה הזו אין סטופ, ולכן אי אפשר לחשב R.</p>
      )}

      {r.noStop.count > 0 && (
        <div className="relative mt-4 flex items-start gap-2 rounded-xl border border-breakeven/25 bg-breakeven/5 px-3 py-2.5">
          <ShieldAlert className="w-4 h-4 text-breakeven shrink-0 mt-0.5" />
          <p className="text-[12px] text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">{r.noStop.count} עסקאות בלי סטופ</span>
            {' '}— סה״כ{' '}
            <span className={`num-mono font-semibold ${r.noStop.pnl >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">{formatCurrency(r.noStop.pnl)}</span>.
            {' '}בלי סטופ הסיכון לא מוגדר, ועסקה אחת רעה יכולה למחוק שבועות של רווח.
          </p>
        </div>
      )}
    </Card>
  );
}
