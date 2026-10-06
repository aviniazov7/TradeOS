import { useMemo } from 'react';
import { summarizeTrades } from '../../utils/journalAnalytics';
import { formatCurrency } from '../../utils/formatters';
import Card from '../shared/Card';

function Cell({ label, value, sub, valueClass = 'text-text-primary', className = '' }) {
  return (
    <div className={`min-w-0 px-3 py-2.5 md:px-4 border-border-primary ${className}`}>
      <div className="text-[10px] md:text-[11px] text-text-muted truncate">{label}</div>
      <div className={`num-mono text-sm md:text-base font-bold truncate ${valueClass}`} dir="ltr" style={{ textAlign: 'right' }}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted truncate">{sub}</div>}
    </div>
  );
}

// Compact numbers for whatever the trades tab is currently showing — they
// follow the active filters, so "filter by BTC" immediately answers "how am I
// doing on BTC?" without switching to the analytics tab.
export default function JournalSummaryBar({ trades, filtered }) {
  const s = useMemo(() => summarizeTrades(trades), [trades]);
  const pnlClass = s.net > 0 ? 'text-profit' : s.net < 0 ? 'text-loss' : 'text-text-primary';
  const rClass = s.avgR == null ? 'text-text-muted' : s.avgR >= 0 ? 'text-profit' : 'text-loss';

  return (
    // Separators: 2×2 on phones (inner cross), one row of 4 from md up.
    <Card className="mb-3 grid grid-cols-2 md:grid-cols-4">
      <Cell
        className="border-e"
        label={filtered ? 'עסקאות (לפי הסינון)' : 'עסקאות'}
        value={s.closed}
        sub={s.open > 0 ? `+ ${s.open} פתוחות` : 'סגורות'}
      />
      <Cell className="md:border-e" label="רווח נקי" value={s.closed ? formatCurrency(s.net) : '—'} valueClass={s.closed ? pnlClass : 'text-text-muted'} />
      <Cell
        className="border-e border-t md:border-t-0"
        label="אחוז הצלחה"
        value={s.winRate == null ? '—' : `${s.winRate.toFixed(1)}%`}
        sub={s.closed ? `${s.wins}W · ${s.losses}L` : null}
      />
      <Cell className="border-t md:border-t-0" label="R ממוצע" value={s.avgR == null ? '—' : `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R`} valueClass={rClass} />
    </Card>
  );
}
