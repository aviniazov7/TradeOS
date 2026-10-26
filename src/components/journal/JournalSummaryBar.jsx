import { useMemo } from 'react';
import { summarizeTrades } from '../../utils/journalAnalytics';
import { tradeShownPercent } from '../../utils/calculations';
import { formatCurrency, formatPercent } from '../../utils/formatters';
import { formatRText } from '../../utils/signedNumbers';

function Cell({ label, value, sub, valueClass = 'text-text-primary', className = '', title }) {
  return (
    <div className={`shrink-0 md:shrink ${className}`} title={title || label}>
      <div className="text-[10px] text-text-muted leading-tight whitespace-nowrap">{label}</div>
      <div className={`num-mono text-[11px] md:text-sm font-bold whitespace-nowrap leading-tight ${valueClass}`} dir="ltr" style={{ textAlign: 'right' }}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted leading-tight whitespace-nowrap">{sub}</div>}
    </div>
  );
}

// Compact numbers for whatever the trades tab is currently showing — they
// follow the active filters, so "filter by BTC" immediately answers "how am I
// doing on BTC?" without switching to the analytics tab.
export default function JournalSummaryBar({ trades, filtered, liveById = {}, accountBalance = 0 }) {
  const s = useMemo(() => summarizeTrades(trades), [trades]);
  // Live P&L of the open positions in view (only those with a price feed).
  const live = useMemo(() => {
    const vals = trades.map((t) => liveById[t.id]?.pnl).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [trades, liveById]);
  const pnlClass = s.net > 0 ? 'text-profit' : s.net < 0 ? 'text-loss' : 'text-text-primary';
  const rClass = s.avgR == null ? 'text-text-muted' : s.avgR >= 0 ? 'text-profit' : 'text-loss';
  const onBalance = s.closed ? tradeShownPercent({ netPnl: s.net }, accountBalance) : null;
  const balancePct = onBalance?.onAccount ? onBalance.percent : null;
  const balanceClass = balancePct == null ? 'text-text-muted' : balancePct > 0 ? 'text-profit' : balancePct < 0 ? 'text-loss' : 'text-text-primary';

  const rule = 'md:border-s md:border-border-primary md:ps-4';
  return (
    // One compact strip, including on a phone: every figure stays on a single
    // row under the tabs. From md up it sits in the gap between the title
    // and the tabs, and may wrap only if the window is still narrow.
    <div data-testid="journal-header-stats" className="flex flex-nowrap items-start justify-between gap-2 w-full min-w-0 overflow-x-auto no-scrollbar md:w-auto md:overflow-visible md:flex-wrap md:items-center md:justify-center md:gap-x-4 md:gap-y-1">
      <Cell
        label={filtered ? 'עסקאות (לפי הסינון)' : 'עסקאות'}
        value={s.closed}
        sub={s.open > 0 ? `+ ${s.open} פתוחות` : 'סגורות'}
      />
      <Cell
        className={rule}
        label="רווח נקי"
        value={s.closed ? formatCurrency(s.net) : '—'}
        valueClass={s.closed ? pnlClass : 'text-text-muted'}
        sub={live !== null && (
          <span>פתוחות: <span className={`num-mono font-semibold ${live >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">{formatCurrency(live)}</span></span>
        )}
      />
      {balancePct != null && (
        <Cell
          className={rule}
          label="על היתרה"
          title="תשואה על היתרה"
          value={formatPercent(balancePct)}
          valueClass={balanceClass}
        />
      )}
      <Cell
        className={rule}
        label="אחוז הצלחה"
        value={s.winRate == null ? '—' : `${s.winRate.toFixed(1)}%`}
        sub={s.closed ? `${s.wins}W · ${s.losses}L` : null}
      />
      <Cell className={rule} label="R ממוצע" value={s.avgR == null ? '—' : formatRText(s.avgR)} valueClass={rClass} />
    </div>
  );
}
