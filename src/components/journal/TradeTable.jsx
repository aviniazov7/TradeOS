import { useState, useMemo, Fragment } from 'react';
import { Pencil, Trash2, Share2, Eye, TrendingUp, TrendingDown, Check, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { formatDate, formatPrice, formatCurrency, formatPercent, formatSignedR } from '../../utils/formatters';
import { cryptoQuantityPnl, formatQuoteAmount, formatSymbolPrice } from '../../utils/pairCatalog';
import { isClosedTrade, safePnl, signedTradeR, tradeShownPercent, usesContractMath } from '../../utils/calculations';
import { buildAccountReturnBook } from '../../utils/accountReturn';
import { setupLabel, tradeSetups } from '../../utils/setupStats';
import { getExchangeLogo } from '../../utils/constants';
import TradeDetailModal from './TradeDetailModal';
import CoinIcon from '../shared/CoinIcon';
import ExchangeLogo from '../shared/ExchangeLogo';
import FitText from '../shared/FitText';

function showPnl(trade, value) {
  const quote = formatQuoteAmount(value, trade?.contract?.currency, { signed: true });
  if (quote) return quote;
  if (trade && !cryptoQuantityPnl(trade.pair) && !usesContractMath(trade)) return '—';
  return formatCurrency(value);
}

function ExchangeIcon({ source }) {
  if (!getExchangeLogo(source)) return null;
  return <ExchangeLogo exchange={source} size="w-3.5 h-3.5" />;
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

// Closed rows use net P&L over the balance before that trade. Open rows do
// the same with the live P&L. A reported balance that is missing, zero, or
// dust shows "—" instead of a position percent.
function rowPercent(trade, { done, live, accountBalance, strictAccount }) {
  if (done) return tradeShownPercent(trade, accountBalance, { strictAccount });
  if (live) return tradeShownPercent(trade, accountBalance, { net: live.pnl, positionPercent: live.percent, strictAccount });
  return null;
}

function percentTitle(shown, done) {
  if (!shown || shown.percent == null) return undefined;
  if (shown.onAccount) return done ? 'תשואה על היתרה, אחרי עמלות' : 'תשואה חיה על היתרה';
  return done ? 'תשואה על הפוזיציה, אחרי עמלות' : 'תשואה על הפוזיציה';
}
// Honor the saved status — broker CSV imports are status:'closed' with
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

// "LIVE" marker next to an open position's floating P&L.
function LiveTag() {
  // font-sans: the P&L cell uses the mono number face, which mangles Hebrew.
  return <span className="font-sans text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-primary/15 text-accent-primary leading-none tracking-wide" dir="ltr">LIVE</span>;
}

function SelectBox({ checked }) {
  return (
    <span className={`w-4 h-4 rounded border-2 inline-flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-accent-primary border-accent-primary' : 'border-border-hover'}`}>
      {checked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
    </span>
  );
}

// Clickable, sortable column header.
function SortTh({ label, sortKey, sort, onSortChange }) {
  const active = sort?.key === sortKey;
  const Arrow = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className="py-2 px-2 text-right font-medium" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSortChange?.(sortKey)}
        className={`inline-flex items-center gap-1 cursor-pointer hover:text-text-primary transition-colors ${active ? 'text-accent-primary' : ''}`}>
        {label}
        <Arrow className={`w-3 h-3 ${active ? '' : 'opacity-40'}`} />
      </button>
    </th>
  );
}

export default function TradeTable({
  trades, allTrades, liveById = {}, sort, onSortChange, showMonths = true,
  selectMode = false, selectedIds, onToggleSelect,
  onEdit, onDelete, onShare, isLimitPending, accountBalance = 0, returnBook = null,
}) {
  const [detailTrade, setDetailTrade] = useState(null);
  const monthTotals = useMemo(() => buildMonthTotals(allTrades || trades), [allTrades, trades]);
  const book = useMemo(
    () => returnBook || buildAccountReturnBook(allTrades || trades, { openingBalance: accountBalance }),
    [returnBook, allTrades, trades, accountBalance],
  );
  const pending = (t) => isLimitPending?.(t) ?? false;
  const onAccount = book.mode !== 'position';
  const balanceFor = (trade) => {
    if (!onAccount) return 0;
    const balance = book.byId.get(trade?.id);
    return balance == null ? null : balance;
  };

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
          const showMonthSep = showMonths && (idx === 0 || getMonthKey(trade) !== getMonthKey(trades[idx - 1]));
          const done = status !== 'open' && !isPending;
          const live = status === 'open' && !isPending ? liveById[trade.id] : null;
          const netR = done ? signedTradeR(trade) : null;
          const shownPct = rowPercent(trade, { done, live, accountBalance: balanceFor(trade), strictAccount: onAccount });
          const rr = formatSignedR(netR);
          const selected = selectMode && selectedIds?.has(trade.id);

          return (
            <Fragment key={trade.id}>
              {showMonthSep && (
                <div className={`px-1 ${idx === 0 ? 'mb-3' : 'mt-5 mb-3'}`}>
                  <MonthSeparator trade={trade} totals={monthTotals.get(getMonthKey(trade))} />
                </div>
              )}
              <button
                type="button"
                onClick={() => (selectMode ? onToggleSelect?.(trade.id) : setDetailTrade(trade))}
                aria-pressed={selectMode ? selected : undefined}
                className={`w-full text-right bg-bg-secondary border border-border-primary border-s-[3px] ${stripeClass(status, isPending, pnl)} rounded-xl px-3 py-2.5 cursor-pointer hover:border-border-hover active:scale-[0.99] transition ${isPending ? 'opacity-60' : ''} ${selected ? 'ring-2 ring-accent-primary/60' : ''}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {selectMode && <SelectBox checked={selected} />}
                    <CoinIcon pair={trade.pair} assetClass={trade.assetClass} className="w-4 h-4 shrink-0" />
                    <span dir="ltr" className="text-text-primary font-semibold text-sm whitespace-nowrap shrink-0" title={trade.pair}>{trade.pair}</span>
                    <span className={`shrink-0 inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${trade.direction === 'long' ? 'bg-long/10 text-long' : 'bg-short/10 text-short'}`}>
                      {trade.direction === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {trade.direction === 'long' ? 'Long' : 'Short'}
                    </span>
                  </div>
                  {done
                    ? <FitText className={`num-mono text-sm font-bold shrink-0 max-w-[42%] ${pnlColor(pnl)}`} min={11} dir="ltr">{showPnl(trade, pnl)}</FitText>
                    : live
                      ? <span className="shrink-0 inline-flex items-center gap-1.5"><LiveTag /><span className={`num-mono text-sm font-bold ${pnlColor(live.pnl)}`} dir="ltr">{formatCurrency(live.pnl)}</span></span>
                      : <span className="text-xs text-text-muted shrink-0">—</span>}
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-[11px]">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0">{statusBadge(status, isPending)}</span>
                    {trade.source && trade.source !== 'manual' && (
                      <span className="shrink-0"><ExchangeIcon source={trade.source} /></span>
                    )}
                    {/* The date always shows in full; only a long strategy name is cut. */}
                    <span className="text-text-muted shrink-0 num-mono">{formatDate(trade.entryDate)}</span>
                    {trade.strategy && <span className="text-text-muted truncate min-w-0">· {trade.strategy}</span>}
                    {tradeSetups(trade)[0] && <span className="text-text-muted truncate min-w-0">· {setupLabel(tradeSetups(trade)[0])}</span>}
                  </span>
                  {done && (onAccount || shownPct?.percent != null) && (
                    <span className="num-mono shrink-0 inline-flex items-center gap-1.5" dir="ltr">
                      <span className={shownPct?.percent == null ? 'text-text-muted' : pnlColor(shownPct.percent)} title={percentTitle(shownPct, true)}>
                        {shownPct?.percent == null ? '—' : formatPercent(shownPct.percent)}
                      </span>
                      {rr !== '–' && <span className={pnl < 0 ? 'text-loss' : 'text-text-secondary'}>{rr}</span>}
                    </span>
                  )}
                  {live && (onAccount || shownPct?.percent != null) && (
                    <span className={`num-mono shrink-0 ${shownPct?.percent == null ? 'text-text-muted' : pnlColor(shownPct.percent)}`} dir="ltr" title={percentTitle(shownPct, false)}>
                      {shownPct?.percent == null ? '—' : formatPercent(shownPct.percent)}
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
              {selectMode && <th className="py-2 ps-2 w-6" aria-label="בחירה" />}
              <SortTh label="זוג" sortKey="pair" sort={sort} onSortChange={onSortChange} />
              <th className="py-2 px-2 text-right font-medium">כיוון</th>
              <th className="py-2 px-2 text-right font-medium">סטטוס</th>
              <th className="py-2 px-2 text-right font-medium">אסטרטגיה</th>
              <SortTh label="תאריך" sortKey="date" sort={sort} onSortChange={onSortChange} />
              <th className="py-2 px-2 text-right font-medium">כניסה</th>
              <th className="py-2 px-2 text-right font-medium">סגירה</th>
              <th className="py-2 px-2 text-right font-medium">SL</th>
              <th className="py-2 px-2 text-right font-medium" title={onAccount ? 'תשואה נטו על יתרת החשבון' : 'אחוז נטו על הפוזיציה, אחרי עמלות'}>{onAccount ? 'על היתרה' : '% נטו'}</th>
              <SortTh label="R נטו" sortKey="r" sort={sort} onSortChange={onSortChange} />
              <SortTh label="P&L" sortKey="pnl" sort={sort} onSortChange={onSortChange} />
              <th className="py-2 px-2 text-right font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, idx) => {
              const status = getStatus(trade);
              const pnl = trade.netPnl ?? trade.pnl;
              const isPending = pending(trade);
              const showMonthSep = showMonths && (idx === 0 || getMonthKey(trade) !== getMonthKey(trades[idx - 1]));
              const live = status === 'open' && !isPending ? liveById[trade.id] : null;
              const shownPct = rowPercent(trade, { done: status !== 'open' && !isPending, live, accountBalance: balanceFor(trade), strictAccount: onAccount });
              const selected = selectMode && selectedIds?.has(trade.id);

              return (
                <Fragment key={trade.id}>
                  {showMonthSep && (
                    <tr>
                      <td colSpan={selectMode ? 13 : 12} className={`${idx === 0 ? 'pt-2' : 'pt-7'} pb-3 px-2`}>
                        <MonthSeparator trade={trade} totals={monthTotals.get(getMonthKey(trade))} />
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`border-b border-border-primary/50 cursor-pointer transition-colors ${selected ? 'bg-accent-primary/10' : 'hover:bg-bg-tertiary/50'} ${isPending ? 'opacity-60' : ''}`}
                    onClick={() => (selectMode ? onToggleSelect?.(trade.id) : setDetailTrade(trade))}
                    aria-selected={selectMode ? selected : undefined}
                  >
                    {selectMode && <td className="py-2.5 ps-2"><SelectBox checked={selected} /></td>}
                    <td className="py-2.5 px-2 text-text-primary font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <CoinIcon pair={trade.pair} assetClass={trade.assetClass} className="w-4 h-4 shrink-0" />
                        <span dir="ltr" className="whitespace-nowrap" title={trade.pair}>{trade.pair}</span>
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
                    <td className="py-2.5 px-2 text-text-secondary max-w-[140px] truncate"
                      title={[
                        Number.isFinite(trade.checklistAdherence) ? `הצמדות לצ׳קליסט התוכנית: ${trade.checklistAdherence}%${trade.planName ? ` · ${trade.planName}` : ''}` : '',
                        tradeSetups(trade).map(setupLabel).join(' · '),
                      ].filter(Boolean).join(' · ') || undefined}>
                      {[trade.strategy, tradeSetups(trade)[0] && setupLabel(tradeSetups(trade)[0])].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="py-2.5 px-2 text-text-muted whitespace-nowrap">{formatDate(trade.entryDate)}</td>
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap num-mono">{formatSymbolPrice(trade.entryPrice, trade.pair)}</td>
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap num-mono">
                      {status === 'open' ? '—' : (
                        <span>{formatSymbolPrice(trade.exitPrice, trade.pair)}{trade.exits?.length > 1 && <span className="text-[10px] text-text-muted mr-1">({trade.exits.length})</span>}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-text-primary whitespace-nowrap num-mono"><StopValue trade={trade} /></td>
                    <td className={`py-2.5 px-2 whitespace-nowrap num-mono ${shownPct?.percent == null ? 'text-text-muted' : pnlColor(shownPct.percent)}`} title={percentTitle(shownPct, status !== 'open')}>
                      <span dir="ltr">{shownPct?.percent == null ? '—' : formatPercent(shownPct.percent)}</span>
                    </td>
                    <td className={`py-2.5 px-2 whitespace-nowrap num-mono ${pnl < 0 ? 'text-loss' : 'text-text-secondary'}`} title="R נטו, אחרי עמלות"><span dir="ltr">{status === 'open' ? '–' : formatSignedR(signedTradeR(trade))}</span></td>
                    <td className={`py-2.5 px-2 font-bold whitespace-nowrap num-mono ${status === 'open' ? (live ? pnlColor(live.pnl) : 'text-text-muted') : pnlColor(pnl)}`}>
                      {status !== 'open' ? <span dir="ltr">{showPnl(trade, pnl)}</span> : live ? (
                        <span className="inline-flex items-center gap-1.5" title="רווח/הפסד חי לפי המחיר הנוכחי (לפני עמלות)">
                          <LiveTag /><span dir="ltr">{formatCurrency(live.pnl)}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        {status !== 'open' && onShare && (
                          <button onClick={(e) => { e.stopPropagation(); onShare(trade); }} className="p-1 rounded text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer" title="שיתוף">
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onEdit(trade); }} className="p-1 rounded text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer" title="עריכה">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(trade); }} className="p-1 rounded text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer" title="מחיקה">
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
      <TradeDetailModal trade={detailTrade} isOpen={!!detailTrade} onClose={() => setDetailTrade(null)} onEdit={onEdit} onDelete={onDelete} onShare={onShare} accountBalance={balanceFor(detailTrade)} strictAccount={onAccount} />
    </>
  );
}
