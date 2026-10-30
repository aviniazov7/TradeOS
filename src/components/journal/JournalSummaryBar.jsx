import { useMemo } from 'react';
import { summarizeTrades } from '../../utils/journalAnalytics';
import { buildAccountReturnBook, summaryAccountReturn } from '../../utils/accountReturn';
import { formatCurrency, formatPercent } from '../../utils/formatters';
import { formatRText } from '../../utils/signedNumbers';

function Cell({ label, value, sub, valueClass = 'text-text-primary', className = '', title }) {
  return (
    <div className={`shrink-0 ${className}`} title={title || label}>
      <div className="text-[10px] text-text-muted leading-tight whitespace-nowrap">{label}</div>
      <div className={`num-mono text-[11px] md:text-sm font-bold whitespace-nowrap leading-tight ${valueClass}`} dir="ltr" style={{ textAlign: 'right' }}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted leading-tight whitespace-nowrap">{sub}</div>}
    </div>
  );
}

// Compact numbers for whatever the trades tab is currently showing — they
// follow the active filters, so "filter by BTC" immediately answers "how am I
// doing on BTC?" without switching to the analytics tab.
export default function JournalSummaryBar({ trades, filtered, liveById = {}, accountBalance = 0, returnBook = null }) {
  const s = useMemo(() => summarizeTrades(trades), [trades]);
  // Live P&L of the open positions in view (only those with a price feed).
  const live = useMemo(() => {
    const vals = trades.map((t) => liveById[t.id]?.pnl).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [trades, liveById]);
  const book = useMemo(
    () => returnBook || buildAccountReturnBook(trades, { openingBalance: accountBalance }),
    [returnBook, trades, accountBalance],
  );
  const pnlClass = s.net > 0 ? 'text-profit' : s.net < 0 ? 'text-loss' : 'text-text-primary';
  const rClass = s.avgR == null ? 'text-text-muted' : s.avgR >= 0 ? 'text-profit' : 'text-loss';
  // Measurable closed P&L over the balance those trades were taken against.
  // Trades with no usable balance are left out. Dust / empty wallets show "—".
  const balancePct = s.closed ? summaryAccountReturn(trades, book) : null;
  // Same gate as before: the cell exists only once a trade has closed. An
  // unusable balance then shows "—" instead of hiding a garbage percent.
  const showAccount = book.mode !== 'position' && s.closed > 0;
  const balanceClass = balancePct == null ? 'text-text-muted' : balancePct > 0 ? 'text-profit' : balancePct < 0 ? 'text-loss' : 'text-text-primary';

  // ps-4 between five figures pushed "R ממוצע" onto a second line around
  // 1024–1440px. Keep one row; the wider gap comes back only on a large screen.
  const rule = 'md:border-s md:border-border-primary md:ps-2 2xl:ps-4';
  return (
    // One strip at every width. The phone copy scrolls sideways if it must;
    // the desktop copy sits in the title row and does not wrap.
    <div data-testid="journal-header-stats" className="flex flex-nowrap items-center justify-between gap-x-2 w-max min-w-0 md:justify-center 2xl:gap-x-4">
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
      {showAccount && (
        <Cell
          className={rule}
          label="על היתרה"
          title="תשואה על היתרה"
          value={balancePct == null ? '—' : formatPercent(balancePct)}
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
