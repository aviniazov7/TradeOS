import { useState, Fragment } from 'react';
import { Pencil, Trash2, Share2, ExternalLink, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { formatDate, formatPrice, formatCurrency, formatPercent, formatRR } from '../../utils/formatters';
import { MISTAKE_LABELS, getExchangeLogo } from '../../utils/constants';
import CoinIcon from '../shared/CoinIcon';

function ExchangeIcon({ source }) {
  const url = getExchangeLogo(source);
  if (!url) return null;
  return <img src={url} alt={source} className="w-3.5 h-3.5 rounded-sm opacity-80" />;
}

const pnlColor = (val) => (val > 0 ? 'text-profit' : val < 0 ? 'text-loss' : 'text-breakeven');
const getStatus = (trade) => trade.status === 'partial' ? 'partial' : (trade.exitPrice > 0 ? 'closed' : 'open');

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

const ratingLabels = { 1: 'נמוך', 2: 'בינוני-', 3: 'בינוני', 4: 'טוב', 5: 'מעולה' };

/* ──── Shared expanded details (used by both mobile & desktop) ──── */
function ExpandedDetails({ trade, status, onEdit, onDelete, onShare }) {
  const pnl = trade.netPnl ?? trade.pnl;
  return (
    <div className="mt-3 pt-3 border-t border-border-primary/50 space-y-3">
      {/* Row 1: Prices (mobile only - desktop shows in table) */}
      <div className="md:hidden grid grid-cols-5 gap-x-2 text-[11px]">
        <div>
          <span className="text-text-muted">כניסה</span>
          <p className="text-text-primary">{formatPrice(trade.entryPrice)}</p>
        </div>
        <div>
          <span className="text-text-muted">סגירה</span>
          <p className="text-text-primary">{status === 'open' ? '—' : formatPrice(trade.exitPrice)}</p>
        </div>
        <div>
          <span className="text-text-muted">SL</span>
          <p className="text-text-primary">{trade.stopLoss ? formatPrice(trade.stopLoss) : '—'}</p>
        </div>
        <div>
          <span className="text-text-muted">%</span>
          <p className={status === 'open' ? 'text-text-muted' : pnlColor(trade.pnlPercent)}>
            {status === 'open' ? '—' : formatPercent(trade.pnlPercent)}
          </p>
        </div>
        <div>
          <span className="text-text-muted">R:R</span>
          <p className={pnl < 0 ? 'text-loss' : 'text-text-secondary'}>{formatRR(trade.rrRatio, pnl)}</p>
        </div>
      </div>

      {/* Partial exits breakdown */}
      {trade.exits?.length > 1 && (
        <div className="text-[11px]">
          <span className="text-text-muted">פירוט יציאות:</span>
          <div className="flex gap-2 flex-wrap mt-0.5">
            {trade.exits.map((exit, i) => (
              <span key={i} className="text-text-secondary bg-bg-tertiary px-1.5 py-0.5 rounded">
                {formatPrice(exit.price)} ({exit.percent}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Position details */}
      <div className="grid grid-cols-5 gap-x-2 text-[11px]">
        <div>
          <span className="text-text-muted">פוזיציה</span>
          <p className="text-text-primary">{trade.positionSize ? `$${Number(trade.positionSize).toLocaleString()}` : '—'}</p>
        </div>
        <div>
          <span className="text-text-muted">סיכון</span>
          <p className="text-text-primary">{trade.riskAmount ? `$${Number(trade.riskAmount).toLocaleString()}` : '—'}</p>
        </div>
        <div>
          <span className="text-text-muted">מינוף</span>
          <p className="text-text-primary">{trade.leverage ? `x${trade.leverage}` : '—'}</p>
        </div>
        <div>
          <span className="text-text-muted">עמלות</span>
          <p className="text-text-primary">{trade.fees ? `$${Number(trade.fees).toLocaleString()}` : '—'}</p>
        </div>
        <div>
          <span className="text-text-muted">TF</span>
          <p className="text-text-secondary">{trade.timeframe || '—'}</p>
        </div>
      </div>

      {/* Strategy on mobile */}
      {trade.strategy && (
        <div className="md:hidden text-[11px]">
          <span className="text-text-muted">אסטרטגיה: </span>
          <span className="text-text-secondary">{trade.strategy}</span>
        </div>
      )}

      {/* Mental state ratings */}
      {(trade.focusRating || trade.confidenceRating || trade.stressRating || trade.planAdherenceRating) && (
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          {trade.focusRating && (
            <div>
              <span className="text-text-muted">ריכוז</span>
              <p className="text-text-secondary">{trade.focusRating}/5 {ratingLabels[trade.focusRating]}</p>
            </div>
          )}
          {trade.confidenceRating && (
            <div>
              <span className="text-text-muted">ביטחון</span>
              <p className="text-text-secondary">{trade.confidenceRating}/5 {ratingLabels[trade.confidenceRating]}</p>
            </div>
          )}
          {trade.stressRating && (
            <div>
              <span className="text-text-muted">לחץ</span>
              <p className="text-text-secondary">{trade.stressRating}/5 {ratingLabels[trade.stressRating]}</p>
            </div>
          )}
          {trade.planAdherenceRating && (
            <div>
              <span className="text-text-muted">עקביות</span>
              <p className="text-text-secondary">{trade.planAdherenceRating}/5 {ratingLabels[trade.planAdherenceRating]}</p>
            </div>
          )}
        </div>
      )}

      {/* Mistakes, Entry reason, Tags, TradingView */}
      {(trade.mistakes?.length > 0 || trade.entryReason || trade.tags || trade.tradingViewUrl) && (
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          {trade.mistakes?.length > 0 && (
            <span>
              <span className="text-text-muted">טעויות: </span>
              <span className="text-loss">{trade.mistakes.map((m) => MISTAKE_LABELS[m] || m).join(', ')}</span>
            </span>
          )}
          {trade.entryReason && (
            <span>
              <span className="text-text-muted">סיבה: </span>
              <span className="text-text-secondary">{trade.entryReason}</span>
            </span>
          )}
          {trade.tags && (
            <div className="flex items-center gap-1 flex-wrap">
              {(typeof trade.tags === 'string' ? trade.tags.split(',') : trade.tags).filter(Boolean).map((tag) => (
                <span key={tag.trim()} className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                  {tag.trim()}
                </span>
              ))}
            </div>
          )}
          {trade.tradingViewUrl && (
            <a href={trade.tradingViewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-accent-primary text-xs mr-auto">
              <ExternalLink className="w-3.5 h-3.5" />TradingView
            </a>
          )}
        </div>
      )}

      {/* Notes + Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border-primary/50">
        <div className="flex items-center gap-2 text-[11px]">
          {trade.notes && (
            <span>
              <span className="text-text-muted">הערות: </span>
              <span className="text-text-secondary">{trade.notes}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {status !== 'open' && onShare && (
            <button onClick={(e) => { e.stopPropagation(); onShare(trade); }} className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
              <Share2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onEdit(trade); }} className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(trade); }} className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TradeTable({ trades, onEdit, onDelete, onShare, isLimitPending }) {
  const [expandedId, setExpandedId] = useState(null);
  const pending = (t) => isLimitPending?.(t) ?? false;

  const statusBadge = (status, isPending) => {
    if (isPending) return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-text-muted/15 text-text-muted">Limit ממתין</span>;
    if (status === 'open')    return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-breakeven/15 text-breakeven">פתוחה</span>;
    if (status === 'partial') return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-500">חלקית</span>;
    return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent-primary/15 text-accent-primary">סגורה</span>;
  };

  return (
    <>
      {/* ═══════ Mobile: Accordion Cards ═══════ */}
      <div className="md:hidden space-y-2">
        {trades.map((trade, idx) => {
          const status = getStatus(trade);
          const isPending = pending(trade);
          const isExpanded = expandedId === trade.id;
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
                onClick={() => setExpandedId(isExpanded ? null : trade.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CoinIcon pair={trade.pair} className="w-4 h-4" />
                  <span className="text-text-primary font-semibold text-sm">{trade.pair}</span>
                  <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${trade.direction === 'long' ? 'bg-long/10 text-long' : 'bg-short/10 text-short'}`}>
                    {trade.direction === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {trade.direction === 'long' ? 'Long' : 'Short'}
                  </span>
                  {statusBadge(status, isPending)}
                  {trade.source && trade.source !== 'manual' && (
                    <ExchangeIcon source={trade.source} />
                  )}
                  <span className="text-[11px] text-text-muted">{formatDate(trade.entryDate)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {status !== 'open' && !isPending && <span className={`text-sm font-bold ${pnlColor(pnl)}`}>{formatCurrency(pnl)}</span>}
                  {(status === 'open' || isPending) && <span className="text-xs text-text-muted">—</span>}
                  <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
              {isExpanded && <ExpandedDetails trade={trade} status={status} onEdit={onEdit} onDelete={onDelete} onShare={onShare} />}
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
              const isExpanded = expandedId === trade.id;
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
                    onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                  >
                    <td className="py-2.5 px-2 text-text-primary font-semibold whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <CoinIcon pair={trade.pair} className="w-4 h-4" />
                        {trade.pair}
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
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap">{trade.stopLoss ? formatPrice(trade.stopLoss) : '—'}</td>
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
                        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </td>
                  </tr>

                  {/* Expanded details */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={12} className="p-0">
                        <div className="bg-bg-tertiary/30 border-b border-border-primary/50 px-6 py-4 text-[11px]">
                          {/* All groups in one row with spacing */}
                          <div className="flex items-center gap-8 flex-wrap">
                            {/* Group 1: Position details */}
                            <div className="flex gap-10 bg-bg-tertiary/50 rounded-lg px-6 py-2.5">
                              <div>
                                <span className="text-text-muted">פוזיציה</span>
                                <p className="text-text-primary">{trade.positionSize ? `$${Number(trade.positionSize).toLocaleString()}` : '—'}</p>
                              </div>
                              <div>
                                <span className="text-text-muted">סיכון</span>
                                <p className="text-text-primary">{trade.riskAmount ? `$${Number(trade.riskAmount).toLocaleString()}` : '—'}</p>
                              </div>
                              <div>
                                <span className="text-text-muted">מינוף</span>
                                <p className="text-text-primary">{trade.leverage ? `x${trade.leverage}` : '—'}</p>
                              </div>
                              <div>
                                <span className="text-text-muted">עמלות</span>
                                <p className="text-text-primary">{trade.fees ? `$${Number(trade.fees).toLocaleString()}` : '—'}</p>
                              </div>
                              <div>
                                <span className="text-text-muted">TF</span>
                                <p className="text-text-secondary">{trade.timeframe || '—'}</p>
                              </div>
                            </div>

                            {/* Partial exits breakdown */}
                            {trade.exits?.length > 1 && (
                              <div className="flex gap-3 items-center bg-bg-tertiary/50 rounded-lg px-6 py-2.5">
                                <span className="text-text-muted">יציאות:</span>
                                {trade.exits.map((exit, i) => (
                                  <span key={i} className="text-text-secondary">
                                    {formatPrice(exit.price)} ({exit.percent}%)
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Group 2: Mental state ratings */}
                            {(trade.focusRating || trade.confidenceRating || trade.stressRating || trade.planAdherenceRating) && (
                              <div className="flex gap-10 bg-bg-tertiary/50 rounded-lg px-6 py-2.5">
                                {trade.focusRating && (
                                  <div>
                                    <span className="text-text-muted">ריכוז</span>
                                    <p className="text-text-secondary">{trade.focusRating}/5 {ratingLabels[trade.focusRating]}</p>
                                  </div>
                                )}
                                {trade.confidenceRating && (
                                  <div>
                                    <span className="text-text-muted">ביטחון</span>
                                    <p className="text-text-secondary">{trade.confidenceRating}/5 {ratingLabels[trade.confidenceRating]}</p>
                                  </div>
                                )}
                                {trade.stressRating && (
                                  <div>
                                    <span className="text-text-muted">לחץ</span>
                                    <p className="text-text-secondary">{trade.stressRating}/5 {ratingLabels[trade.stressRating]}</p>
                                  </div>
                                )}
                                {trade.planAdherenceRating && (
                                  <div>
                                    <span className="text-text-muted">עקביות</span>
                                    <p className="text-text-secondary">{trade.planAdherenceRating}/5 {ratingLabels[trade.planAdherenceRating]}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Group 3: Mistakes, Reason, Tags, TradingView, Notes */}
                            {trade.mistakes?.length > 0 && (
                              <span>
                                <span className="text-text-muted">טעויות: </span>
                                <span className="text-loss">{trade.mistakes.map((m) => MISTAKE_LABELS[m] || m).join(', ')}</span>
                              </span>
                            )}
                            {trade.entryReason && (
                              <span>
                                <span className="text-text-muted">סיבה: </span>
                                <span className="text-text-secondary">{trade.entryReason}</span>
                              </span>
                            )}
                            {trade.tags && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {(typeof trade.tags === 'string' ? trade.tags.split(',') : trade.tags).filter(Boolean).map((tag) => (
                                  <span key={tag.trim()} className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                                    {tag.trim()}
                                  </span>
                                ))}
                              </div>
                            )}
                            {trade.tradingViewUrl && (
                              <a href={trade.tradingViewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent-primary">
                                <ExternalLink className="w-3.5 h-3.5" />TradingView
                              </a>
                            )}
                            {trade.notes && (
                              <span>
                                <span className="text-text-muted">הערות: </span>
                                <span className="text-text-secondary">{trade.notes}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
