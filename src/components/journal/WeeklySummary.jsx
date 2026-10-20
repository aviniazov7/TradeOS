import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import { formatCurrency, LRM } from '../../utils/formatters';
import { setupLabel } from '../../utils/setupStats';
import {
  formatWeekRange,
  isSameTradeWeek,
  listTradeWeeks,
  summarizeWeek,
} from '../../utils/weeklySummary';

function formatR(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${LRM}${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}

const tone = (v) => (v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-primary');

function Cell({ label, value, sub, valueClass = 'text-text-primary' }) {
  return (
    <div className="min-w-0 rounded-xl border border-border-primary bg-bg-secondary px-3 py-2.5">
      <div className="text-[10px] text-text-muted truncate">{label}</div>
      <div className={`num-mono text-sm md:text-base font-bold truncate ${valueClass}`} dir="ltr" style={{ textAlign: 'right' }}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted truncate mt-0.5">{sub}</div>}
    </div>
  );
}

function Extreme({ label, trade }) {
  if (!trade) {
    return <Cell label={label} value="—" valueClass="text-text-muted" />;
  }
  const dir = trade.direction === 'short' ? 'Short' : trade.direction === 'long' ? 'Long' : '';
  return (
    <Cell
      label={label}
      value={trade.pair || '—'}
      valueClass={tone(trade.pnl)}
      sub={(
        <span>
          {dir ? `${dir} · ` : ''}
          <span className="num-mono" dir="ltr">{formatCurrency(trade.pnl)}</span>
          {trade.netR != null && <> · <span className="num-mono" dir="ltr">{formatR(trade.netR)}</span></>}
        </span>
      )}
    />
  );
}

// Current week and past weeks that have trades. Numbers follow the journal
// header: closed trades, win rate without breakevens, net R.
export default function WeeklySummary({ trades, onFilterJump }) {
  const now = useMemo(() => new Date(), []);
  const weeks = useMemo(() => listTradeWeeks(trades, now), [trades, now]);
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, weeks.length - 1));
  const weekStart = weeks[safeIndex];
  const summary = useMemo(() => (weekStart ? summarizeWeek(trades, weekStart) : null), [trades, weekStart]);
  const isCurrent = weekStart ? isSameTradeWeek(weekStart, now) : false;

  if (!summary || !weekStart) return null;

  const go = (next) => setIndex(Math.min(Math.max(0, next), weeks.length - 1));

  return (
    <section aria-label="סיכום שבועי" className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(safeIndex + 1)}
          disabled={safeIndex >= weeks.length - 1}
          aria-label="השבוע הקודם"
          className="w-10 h-10 shrink-0 grid place-items-center rounded-xl border border-border-primary bg-bg-secondary text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
            <CalendarRange className="w-3.5 h-3.5" />
            {isCurrent ? 'השבוע' : 'שבוע קודם'}
          </div>
          <div className="text-sm md:text-base font-bold text-text-primary">{formatWeekRange(weekStart, now)}</div>
        </div>
        <button
          type="button"
          onClick={() => go(safeIndex - 1)}
          disabled={safeIndex <= 0}
          aria-label="השבוע הבא"
          className="w-10 h-10 shrink-0 grid place-items-center rounded-xl border border-border-primary bg-bg-secondary text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {weeks.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {weeks.map((w, i) => (
            <button
              key={w.getTime()}
              type="button"
              onClick={() => go(i)}
              aria-current={i === safeIndex ? 'true' : undefined}
              className={`shrink-0 h-8 px-2.5 rounded-lg text-[11px] border cursor-pointer ${
                i === safeIndex
                  ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/30 font-semibold'
                  : 'bg-bg-tertiary text-text-muted border-border-primary'
              }`}
            >
              {isSameTradeWeek(w, now) ? 'השבוע' : formatWeekRange(w, now)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Cell
          label="עסקאות"
          value={summary.closed}
          sub={summary.open > 0 ? `+ ${summary.open} פתוחות` : 'סגורות'}
        />
        <Cell
          label="אחוז הצלחה"
          value={summary.winRate == null ? '—' : `${summary.winRate.toFixed(1)}%`}
          sub={summary.closed ? `${summary.wins}W · ${summary.losses}L` : null}
        />
        <Cell
          label="R נטו"
          value={formatR(summary.totalNetR)}
          valueClass={tone(summary.totalNetR)}
          sub={summary.avgNetR == null ? null : <span>ממוצע <span className="num-mono" dir="ltr">{formatR(summary.avgNetR)}</span></span>}
        />
        <Cell
          label="רווח נקי"
          value={summary.closed ? formatCurrency(summary.pnl) : '—'}
          valueClass={summary.closed ? tone(summary.pnl) : 'text-text-muted'}
        />
        <Extreme label="העסקה הטובה" trade={summary.best} />
        <Extreme label="העסקה הגרועה" trade={summary.worst} />
      </div>

      <div className="rounded-xl border border-border-primary bg-bg-secondary px-3 py-3">
        <div className="text-[10px] text-text-muted mb-1">הסטאפ המוביל</div>
        {summary.topSetup ? (
          <button
            type="button"
            onClick={() => onFilterJump?.({ setup: summary.topSetup.name })}
            className="w-full text-right cursor-pointer"
          >
            <div className="text-sm font-semibold text-text-primary">{summary.topSetup.label || setupLabel(summary.topSetup.name)}</div>
            <div className="text-[11px] text-text-muted mt-0.5">
              {summary.topSetup.count} עסקאות · {summary.topSetup.winRate.toFixed(0)}% הצלחה
              {summary.topSetup.avgNetR != null && (
                <> · ממוצע <span className="num-mono" dir="ltr">{formatR(summary.topSetup.avgNetR)}</span></>
              )}
            </div>
          </button>
        ) : (
          <p className="text-xs text-text-secondary">
            {summary.closed ? 'אין סטאפ מסומן השבוע' : 'אין עסקאות סגורות בשבוע הזה'}
          </p>
        )}
      </div>

      {summary.adherence && (
        <div className="rounded-xl border border-border-primary bg-bg-secondary px-3 py-3">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <div className="text-sm font-semibold text-text-primary">עמידה בחוקים</div>
            <div className="num-mono text-xs text-text-secondary" dir="ltr">{summary.adherence.avg.toFixed(0)}%</div>
          </div>
          <p className="text-[11px] text-text-muted mb-2">
            {summary.adherence.samples} עסקאות עם צ׳קליסט · {summary.adherence.followed} עמדו · {summary.adherence.missed} סטו
          </p>
          {summary.adherence.notes.length > 0 && (
            <ul className="space-y-2">
              {summary.adherence.notes.map((n, i) => (
                <li key={`${n.pair}-${i}`} className="text-xs text-text-secondary border-t border-border-primary/60 pt-2">
                  <div className="font-medium text-text-primary">
                    {n.pair || 'עסקה'}
                    <span className="text-text-muted font-normal"> · {n.adherence.toFixed(0)}%</span>
                  </div>
                  {n.missed.length > 0 && (
                    <div className="mt-0.5">לא סומן: {n.missed.join(' · ')}</div>
                  )}
                  {n.note && <div className="mt-0.5 whitespace-pre-wrap">{n.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
