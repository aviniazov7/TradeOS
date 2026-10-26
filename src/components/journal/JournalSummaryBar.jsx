import { useMemo } from 'react';
import { summarizeTrades } from '../../utils/journalAnalytics';
import { formatCurrency } from '../../utils/formatters';
import { formatRText } from '../../utils/signedNumbers';

function Cell({ label, value, sub, valueClass = 'text-text-primary', className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[10px] text-text-muted truncate leading-tight">{label}</div>
      <div className={`num-mono text-xs md:text-sm font-bold truncate leading-tight ${valueClass}`} dir="ltr" style={{ textAlign: 'right' }}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted truncate leading-tight">{sub}</div>}
    </div>
  );
}

// Compact numbers for whatever the trades tab is currently showing — they
// follow the active filters, so "filter by BTC" immediately answers "how am I
// doing on BTC?" without switching to the analytics tab.
export default function JournalSummaryBar({ trades, filtered, liveById = {} }) {
  const s = useMemo(() => summarizeTrades(trades), [trades]);
  // Live P&L of the open positions in view (only those with a price feed).
  const live = useMemo(() => {
    const vals = trades.map((t) => liveById[t.id]?.pnl).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [trades, liveById]);
  const pnlClass = s.net > 0 ? 'text-profit' : s.net < 0 ? 'text-loss' : 'text-text-primary';
  const rClass = s.avgR == null ? 'text-text-muted' : s.avgR >= 0 ? 'text-profit' : 'text-loss';

  const rule = 'md:border-s md:border-border-primary md:ps-4';
  return (
    // One compact strip. On a phone it wraps to two columns under the header;
    // from md up it sits in the gap between the journal title and the tabs.
    <div data-testid="journal-header-stats" className="grid grid-cols-2 gap-x-3 gap-y-1.5 w-full md:flex md:w-auto md:flex-wrap md:items-center md:justify-center md:gap-x-4 md:gap-y-1">
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
