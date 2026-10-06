import { useState, useMemo, Fragment } from 'react';
import { Pencil, Trash2, Share2, Eye, TrendingUp, TrendingDown } from 'lucide-react';
import { formatDate, formatPrice, formatCurrency, formatPercent, formatRR } from '../../utils/formatters';
import { isClosedTrade, safePnl } from '../../utils/calculations';
import { getExchangeLogo } from '../../utils/constants';
import TradeDetailModal from './TradeDetailModal';
import CoinIcon from '../shared/CoinIcon';

function ExchangeIcon({ source }) {
  const url = getExchangeLogo(source);
  if (!url) return null;
  return <img src={url} alt={source} className="w-3.5 h-3.5 rounded-sm opacity-80" />;
}

// Render the stop loss. If it was moved mid-trade, show the new stop with a
// "New" badge and the original (struck through) alongside it.
function StopValue({ trade }) {
  const sl = parseFloat(trade.stopLoss);
  if (!sl) return '—';
  const orig = parseFloat(trade.originalStopLoss);
  const moved = orig > 0 && Math.abs(orig - sl) > Math.abs(orig) * 1e-6;
  if (!moved) return formatPrice(sl);
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="text-accent-primary font-medium">{formatPrice(sl)}</span>
      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-accent-primary/15 text-accent-primary leading-none">New</span>
      <span className="text-[10px] text-text-muted line-through">{formatPrice(orig)}</span>
    </span>
  );
}

const pnlColor = (val) => (val > 0 ? 'text-profit' : val < 0 ? 'text-loss' : 'text-breakeven');
// Honor the saved status — broker CSV imports (MT5) are status:'closed' with
// pnlFromExchange but NO exit price, and deriving from exitPrice alone showed
// them as eternally "open" with a — in the P&L column.
const getStatus = (trade) => trade.status === 'partial' ? 'partial' : (isClosedTrade(trade) ? 'closed' : 'open');

const MONTH_NAMES_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const getMonthKey = (trade) => {
  const d = trade.entryDate?.toDate ? trade.entryDate.toDate() : new Date(trade.entryDate || 0);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth()}`;
};
const getMonthLabel = (trade) => {
  const d = trade.entryDate?.toDate ? trade.entryDate.toDate() : new Date(trade.entryDate || 0);
  if (isNaN(d.getTime())) return '';
  return `${MONTH_NAMES_HE[d.getMonth()]} ${d.getFullYear()}`;
};

// Per-month totals over the FULL filtered list (the table only renders a
// window of it), so a separator's sum doesn't change as "load more" grows.
function buildMonthTotals(trades) {
  const map = new Map();
  trades.forEach((t) => {
    const key = getMonthKey(t);
    const m = map.get(key) || { count: 0, pnl: 0 };
    m.count++;
    if (isClosedTrade(t)) m.pnl += safePnl(t);
    map.set(key, m);
  });
  return map;
}

function MonthSeparator({ trade, totals }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-px bg-accent-primary/35" />
      <span className="text-[11px] font-bold text-accent-primary/80 shrink-0 tracking-wide">{getMonthLabel(trade)}</span>
      {totals && (
        <span className="text-[11px] text-text-muted shrink-0 inline-flex items-center gap-1.5">
          <span>· {totals.count} עסקאות ·</span>
          <span className={`num-mono font-semibold ${pnlColor(totals.pnl)}`} dir="ltr">{formatCurrency(totals.pnl)}</span>
        </span>
      )}
      <div className="flex-1 h-px bg-accent-primary/35" />
    </div>
  );
}

// Result stripe on the mobile card's leading edge (right side in RTL).
const stripeClass = (status, isPending, pnl) => {
  if (isPending) return 'border-s-border-primary';
  if (status !== 'closed') return 'border-s-accent-primary/50';
  return pnl > 0 ? 'border-s-profit' : pnl < 0 ? 'border-s-loss' : 'border-s-breakeven';
};

export default function TradeTable({ trades, allTrades, onEdit, onDelete, onShare, isLimitPending }) {
  const [detailTrade, setDetailTrade] = useState(null);
  const monthTotals = useMemo(() => buildMonthTotals(allTrades || trades), [allTrades, trades]);
  const pending = (t) => isLimitPending?.(t) ?? false;

  const statusBadge = (status, isPending) => {
    if (isPending) return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-text-muted/15 text-text-muted">Limit ממתין</span>;
    if (status === 'open')    return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-breakeven/15 text-breakeven">פתוחה</span>;
    if (status === 'partial') return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-breakeven/15 text-breakeven">חלקית</span>;
    return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent-primary/15 text-accent-primary">סגורה</span>;
  };

  return (
    <>
      {/* ═══════ Mobile: Cards ═══════ */}
      <div className="md:hidden space-y-2">
        {trades.map((trade, idx) => {
          const status = getStatus(trade);
          const isPending = pending(trade);
          const pnl = trade.netPnl ?? trade.pnl;
          const showMonthSep = idx === 0 || getMonthKey(trade) !== getMonthKey(trades[idx - 1]);
          const done = status !== 'open' && !isPending;
          const rr = formatRR(trade.rrRatio, pnl);

          return (
            <Fragment key={trade.id}>
              {showMonthSep && (
                <div className={`px-1 ${idx === 0 ? 'mb-2' : 'my-2'}`}>
                  <MonthSeparator trade={trade} totals={monthTotals.get(getMonthKey(trade))} />
                </div>
              )}
              <button
                type="button"
                onClick={() => setDetailTrade(trade)}
                className={`w-full text-right bg-bg-secondary border border-border-primary border-s-[3px] ${stripeClass(status, isPending, pnl)} rounded-xl px-3 py-2.5 cursor-pointer hover:border-border-hover active:scale-[0.99] transition ${isPending ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <CoinIcon pair={trade.pair} className="w-4 h-4 shrink-0" />
                    <span className="text-text-primary font-semibold text-sm truncate min-w-0" title={trade.pair}>{trade.pair}</span>
                    <span className={`shrink-0 inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${trade.direction === 'long' ? 'bg-long/10 text-long' : 'bg-short/10 text-short'}`}>
                      {trade.direction === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {trade.direction === 'long' ? 'Long' : 'Short'}
                    </span>
                    <span className="shrink-0">{statusBadge(status, isPending)}</span>
                    {trade.source && trade.source !== 'manual' && (
                      <span className="shrink-0"><ExchangeIcon source={trade.source} /></span>
                    )}
                  </div>
                  {done
                    ? <span className={`num-mono text-sm font-bold shrink-0 ${pnlColor(pnl)}`} dir="ltr">{formatCurrency(pnl)}</span>
                    : <span className="text-xs text-text-muted shrink-0">—</span>}
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-[11px]">
                  <span className="text-text-muted truncate min-w-0">
                    {formatDate(trade.entryDate)}{trade.strategy ? ` · ${trade.strategy}` : ''}
                  </span>
                  {done && (
                    <span className="num-mono shrink-0 inline-flex items-center gap-1.5" dir="ltr">
                      <span className={pnlColor(trade.pnlPercent)}>{formatPercent(trade.pnlPercent)}</span>
                      {rr !== '–' && <span className={pnl < 0 ? 'text-loss' : 'text-text-secondary'}>{rr}</span>}
                    </span>
                  )}
                </div>
              </button>
            </Fragment>
          );
        })}
      </div>

      {/* ═══════ Desktop: Table ═══════ */}
      {/* xl+: the table fits, so drop the horizontal scroller — otherwise it
          becomes the sticky header's scroll container and the header never
          sticks. Below xl the table keeps scrolling sideways. */}
      <div className="hidden md:block overflow-x-auto xl:overflow-visible">
        <table className="w-full text-xs">
          <thead className="xl:sticky xl:top-0 xl:z-[5] xl:bg-bg-primary">
            <tr className="text-text-muted border-b border-border-primary">
              <th className="py-2 px-2 text-right font-medium">זוג</th>
              <th className="py-2 px-2 text-right font-medium">כיוון</th>
              <th className="py-2 px-2 text-right font-medium">סטטוס</th>
              <th className="py-2 px-2 text-right font-medium">אסטרטגיה</th>
              <th className="py-2 px-2 text-right font-medium">תאריך</th>
              <th className="py-2 px-2 text-right font-medium">כניסה</th>
              <th className="py-2 px-2 text-right font-medium">סגירה</th>
              <th className="py-2 px-2 text-right font-medium">SL</th>
              <th className="py-2 px-2 text-right font-medium">%</th>
              <th className="py-2 px-2 text-right font-medium">R:R</th>
              <th className="py-2 px-2 text-right font-medium">P&L</th>
              <th className="py-2 px-2 text-right font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, idx) => {
              const status = getStatus(trade);
              const pnl = trade.netPnl ?? trade.pnl;
              const isPending = pending(trade);
              const showMonthSep = idx === 0 || getMonthKey(trade) !== getMonthKey(trades[idx - 1]);

              return (
                <Fragment key={trade.id}>
                  {showMonthSep && (
                    <tr>
                      <td colSpan={12} className={`${idx === 0 ? 'pt-2' : 'pt-3'} pb-1 px-2`}>
                        <MonthSeparator trade={trade} totals={monthTotals.get(getMonthKey(trade))} />
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`border-b border-border-primary/50 cursor-pointer hover:bg-bg-tertiary/50 transition-colors ${isPending ? 'opacity-60' : ''}`}
                    onClick={() => setDetailTrade(trade)}
                  >
                    <td className="py-2.5 px-2 text-text-primary font-semibold max-w-[13rem]">
                      <span className="inline-flex items-center gap-1.5 max-w-full">
                        <CoinIcon pair={trade.pair} className="w-4 h-4 shrink-0" />
                        <span className="truncate" title={trade.pair}>{trade.pair}</span>
                        {trade.source && trade.source !== 'manual' && (
                          <ExchangeIcon source={trade.source} />
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`inline-flex items-center gap-0.5 font-medium px-1.5 py-0.5 rounded ${trade.direction === 'long' ? 'bg-long/10 text-long' : 'bg-short/10 text-short'}`}>
                        {trade.direction === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {trade.direction === 'long' ? 'Long' : 'Short'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      {statusBadge(status, isPending)}
                    </td>
                    <td className="py-2.5 px-2 text-text-secondary max-w-[120px] truncate">{trade.strategy || '—'}</td>
                    <td className="py-2.5 px-2 text-text-muted whitespace-nowrap">{formatDate(trade.entryDate)}</td>
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap num-mono">{formatPrice(trade.entryPrice)}</td>
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap num-mono">
                      {status === 'open' ? '—' : (
                        <span>{formatPrice(trade.exitPrice)}{trade.exits?.length > 1 && <span className="text-[10px] text-text-muted mr-1">({trade.exits.length})</span>}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap num-mono"><StopValue trade={trade} /></td>
                    <td className={`py-2.5 px-2 whitespace-nowrap num-mono ${status === 'open' ? 'text-text-muted' : pnlColor(trade.pnlPercent)}`}>
                      {status === 'open' ? '—' : formatPercent(trade.pnlPercent)}
                    </td>
                    <td className={`py-2.5 px-2 whitespace-nowrap num-mono ${pnl < 0 ? 'text-loss' : 'text-text-secondary'}`}>{formatRR(trade.rrRatio, pnl)}</td>
                    <td className={`py-2.5 px-2 font-bold whitespace-nowrap num-mono ${status === 'open' ? 'text-text-muted' : pnlColor(pnl)}`}>
                      {status === 'open' ? '—' : formatCurrency(pnl)}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        {status !== 'open' && onShare && (
                          <button onClick={(e) => { e.stopPropagation(); onShare(trade); }} className="p-1 rounded text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer" title="שיתוף">
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onEdit(trade); }} className="p-1 rounded text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(trade); }} className="p-1 rounded text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDetailTrade(trade); }} className="p-1 rounded text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer" title="פרטים"><Eye className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>

                  </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <TradeDetailModal trade={detailTrade} isOpen={!!detailTrade} onClose={() => setDetailTrade(null)} onEdit={onEdit} onDelete={onDelete} onShare={onShare} />
    </>
  );
}
