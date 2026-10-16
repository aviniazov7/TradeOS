import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import Card from '../shared/Card';
import { DirBadge, Num } from '../terminal/terminalUi';
import { HOME_POLL_MS, useTerminalData } from '../../hooks/useTerminalData';
import {
  positionMetrics, positionTotals, journalTradeForPosition, saneLiveMark,
  fmtUsd, fmtPct, pnlTone,
} from '../../utils/terminal';
import { tickerCoinKey } from '../../utils/tickerMarks';

// Stable empty list so the memos don't recompute while the exchange list loads.
const NONE = [];
const TOP = 3;
const posKey = (p) => `${p.source}|${p.externalId || ''}|${p.pair}|${p.direction}`;

const Sep = () => <span className="text-text-muted" aria-hidden>·</span>;

// Slim home strip for the same book as the journal's "פוזיציות פתוחות" tab.
// One row on desktop (~64px), two lines on a phone. Absent when the book is empty.
export default function OpenPositionsSummary({ hidden = false }) {
  const navigate = useNavigate();
  const { connected, snapshots, marks, openTrades } = useTerminalData({ pollMs: HOME_POLL_MS });
  const openAll = () => navigate('/journal?tab=positions');

  const exchanges = connected ?? NONE;
  const allPositions = useMemo(() => (
    exchanges.length
      ? exchanges.flatMap((ex) => (snapshots[ex]?.positions || []).map((p) => ({ ...p, source: p.source || ex })))
      : NONE
  ), [exchanges, snapshots]);
  const allOrders = useMemo(() => (
    exchanges.length
      ? exchanges.flatMap((ex) => (snapshots[ex]?.orders || []).map((o) => ({ ...o, exchange: o.exchange || ex })))
      : NONE
  ), [exchanges, snapshots]);

  const posRows = useMemo(() => allPositions
    .map((p) => {
      const liveMark = saneLiveMark(p, marks[p.pair]);
      const journalTrade = journalTradeForPosition(p, openTrades);
      return {
        key: posKey(p),
        p,
        m: positionMetrics(p, { liveMark, orders: allOrders, journalTrade }),
      };
    })
    .sort((a, b) => (b.m.value || 0) - (a.m.value || 0)),
  [allPositions, allOrders, marks, openTrades]);

  const totals = useMemo(() => positionTotals(posRows), [posRows]);

  // No connection, still loading the list, or a flat book: leave the home page alone.
  if (!exchanges.length || posRows.length === 0) return null;

  const mask = (text) => (hidden ? '••••' : text);
  const tone = pnlTone(totals.upnl);
  const top = posRows.slice(0, TOP);
  const rest = posRows.length - top.length;

  return (
    <Card
      data-testid="open-positions-strip"
      className="rounded-2xl mb-4 px-3 py-2 md:h-16 md:px-4 md:py-0 flex flex-col justify-center gap-1.5 md:flex-row md:items-center md:gap-3"
    >
      <div className="flex items-center gap-x-1.5 min-w-0 text-[13px] leading-none">
        <span className="font-bold text-text-primary shrink-0">פוזיציות פתוחות</span>
        <Num className="font-bold text-text-primary">{posRows.length}</Num>
        <Sep />
        <span className="text-text-secondary shrink-0">לא ממומש</span>
        <Num className={`font-bold ${tone}`}>{mask(fmtUsd(totals.upnl, { signed: true }))}</Num>
        {!hidden && totals.upnlPct != null && (
          <Num className={tone}>({fmtPct(totals.upnlPct)})</Num>
        )}
        <span className="hidden md:contents">
          <Sep />
          <span className="text-text-secondary shrink-0">סיכון</span>
          <Num className="font-bold text-text-primary">{mask(fmtUsd(totals.risk))}</Num>
        </span>
      </div>

      <div className="flex items-center gap-1.5 min-w-0 md:ms-auto">
        <span className="md:hidden inline-flex items-center gap-1 text-[13px] leading-none shrink-0">
          <span className="text-text-secondary">סיכון</span>
          <Num className="font-bold text-text-primary">{mask(fmtUsd(totals.risk))}</Num>
        </span>
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
          {top.map(({ key, p, m }, i) => (
            <button
              key={key}
              type="button"
              onClick={openAll}
              title={p.pair}
              className={`${i === 0 ? 'inline-flex' : 'hidden md:inline-flex'} items-center gap-1 h-7 px-1.5 rounded-lg bg-bg-tertiary border border-border-primary shrink-0 cursor-pointer hover:border-accent-primary/40`}
            >
              <CoinIcon pair={p.pair} className="w-4 h-4" />
              <span dir="ltr" className="text-[12px] font-bold text-text-primary">{tickerCoinKey(p.pair) || p.pair}</span>
              <DirBadge direction={p.direction} className="!h-4 !px-1 !text-[9px]" />
              <Num className={`text-[12px] font-bold ${pnlTone(m.upnl)}`}>{mask(fmtUsd(m.upnl, { signed: true }))}</Num>
            </button>
          ))}
          {rest > 0 && (
            <button type="button" onClick={openAll} className="hidden md:inline-flex items-center h-7 px-2 rounded-lg bg-bg-tertiary border border-border-primary text-[12px] font-bold text-text-secondary shrink-0 cursor-pointer">
              +{rest}
            </button>
          )}
          {posRows.length > 1 && (
            <button type="button" onClick={openAll} className="md:hidden inline-flex items-center h-7 px-2 rounded-lg bg-bg-tertiary border border-border-primary text-[12px] font-bold text-text-secondary shrink-0 cursor-pointer">
              +{posRows.length - 1}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={openAll}
          className="ms-auto md:ms-0 inline-flex items-center gap-0.5 shrink-0 text-[13px] font-semibold text-accent-hover hover:text-accent-primary cursor-pointer"
        >
          לכל הפוזיציות <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  );
}
