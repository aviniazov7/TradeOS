import { useState, Fragment } from 'react';
import { Pencil, Trash2, Share2, Eye, TrendingUp, TrendingDown } from 'lucide-react';
import { formatDate, formatPrice, formatCurrency, formatPercent, formatRR } from '../../utils/formatters';
import { isClosedTrade } from '../../utils/calculations';
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

export default function TradeTable({ trades, onEdit, onDelete, onShare, isLimitPending }) {
  const [detailTrade, setDetailTrade] = useState(null);
  const pending = (t) => isLimitPending?.(t) ?? false;

  const statusBadge = (status, isPending) => {
    if (isPending) return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-text-muted/15 text-text-muted">Limit ממתין</span>;
    if (status === 'open')    return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-breakeven/15 text-breakeven">פתוחה</span>;
    if (status === 'partial') return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-breakeven/15 text-breakeven">חלקית</span>;
    return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent-primary/15 text-accent-primary">סגורה</span>;
  };

  return (
    <>
      {/* ═══════ Mobile: Accordion Cards ═══════ */}
      <div className="md:hidden space-y-2">
        {trades.map((trade, idx) => {
          const status = getStatus(trade);
          const isPending = pending(trade);
          const pnl = trade.netPnl ?? trade.pnl;
          const showMonthSep = idx > 0 && getMonthKey(trade) !== getMonthKey(trades[idx - 1]);

          return (
            <Fragment key={trade.id}>
              {showMonthSep && (
                <div className="flex items-center gap-2.5 my-2 px-1">
                  <div className="flex-1 h-px bg-accent-primary/40" />
                  <span className="text-[11px] font-bold text-accent-primary/80 shrink-0 tracking-wide">{getMonthLabel(trade)}</span>
                  <div className="flex-1 h-px bg-accent-primary/40" />
                </div>
              )}
            <div className={`bg-bg-secondary border border-border-primary rounded-xl p-3 ${isPending ? 'opacity-60' : ''}`}>
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setDetailTrade(trade)}
              >
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
                  <span className="text-[11px] text-text-muted shrink-0">{formatDate(trade.entryDate)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {status !== 'open' && !isPending && <span className={`text-sm font-bold ${pnlColor(pnl)}`}>{formatCurrency(pnl)}</span>}
                  {(status === 'open' || isPending) && <span className="text-xs text-text-muted">—</span>}
                  <Eye className="w-4 h-4 text-text-muted" />
                </div>
              </div>
            </div>
            </Fragment>
          );
        })}
      </div>

      {/* ═══════ Desktop: Table ═══════ */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
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
              const showMonthSep = idx > 0 && getMonthKey(trade) !== getMonthKey(trades[idx - 1]);

              return (
                <Fragment key={trade.id}>
                  {showMonthSep && (
                    <tr>
                      <td colSpan={12} className="pt-3 pb-1 px-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-accent-primary/35" />
                          <span className="text-[11px] font-bold text-accent-primary/80 shrink-0 tracking-wide px-1">{getMonthLabel(trade)}</span>
                          <div className="flex-1 h-px bg-accent-primary/35" />
                        </div>
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
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap">{formatPrice(trade.entryPrice)}</td>
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap">
                      {status === 'open' ? '—' : (
                        <span>{formatPrice(trade.exitPrice)}{trade.exits?.length > 1 && <span className="text-[10px] text-text-muted mr-1">({trade.exits.length})</span>}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap"><StopValue trade={trade} /></td>
                    <td className={`py-2.5 px-2 whitespace-nowrap ${status === 'open' ? 'text-text-muted' : pnlColor(trade.pnlPercent)}`}>
                      {status === 'open' ? '—' : formatPercent(trade.pnlPercent)}
                    </td>
                    <td className={`py-2.5 px-2 whitespace-nowrap ${pnl < 0 ? 'text-loss' : 'text-text-secondary'}`}>{formatRR(trade.rrRatio, pnl)}</td>
                    <td className={`py-2.5 px-2 font-bold whitespace-nowrap ${status === 'open' ? 'text-text-muted' : pnlColor(pnl)}`}>
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
