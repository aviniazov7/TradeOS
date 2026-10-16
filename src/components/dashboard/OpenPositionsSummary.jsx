import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CoinIcon from '../shared/CoinIcon';
import Skeleton from '../shared/Skeleton';
import { DirBadge, Num } from '../terminal/terminalUi';
import { useTerminalData } from '../../hooks/useTerminalData';
import {
  positionMetrics, positionTotals, journalTradeForPosition, saneLiveMark,
  fmtUsd, fmtPct, pnlTone,
} from '../../utils/terminal';
import { HomePanel } from './HomeSections';

// Stable empty list so the memos don't recompute while the exchange list loads.
const NONE = [];
const TOP = 3;
const posKey = (p) => `${p.source}|${p.externalId || ''}|${p.pair}|${p.direction}`;

// Compact home summary of the same book as the journal's "פוזיציות פתוחות"
// tab: live exchange positions, not the journal's open trades.
export default function OpenPositionsSummary({ hidden = false }) {
  const navigate = useNavigate();
  const { connected, snapshots, marks, openTrades, loading } = useTerminalData();
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

  // Nothing connected: don't leave an empty card on the home screen.
  // While the connection list itself is still loading, stay hidden too —
  // a skeleton that then vanishes is worse than the card arriving a moment later.
  if (connected == null || exchanges.length === 0) return null;

  const mask = (text) => (hidden ? '••••' : text);
  const tone = pnlTone(totals.upnl);
  const top = posRows.slice(0, TOP);
  const rest = posRows.length - top.length;
  const fetchFailed = exchanges.some((ex) => snapshots[ex]?.error || snapshots[ex]?.positionsError);

  return (
    <HomePanel title="פוזיציות פתוחות" link="לכל הפוזיציות" onLink={openAll} className="mb-4">
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="טוען פוזיציות">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : posRows.length === 0 ? (
        <p className="text-sm text-text-secondary py-2">
          {fetchFailed ? 'לא הצלחנו לקרוא את הפוזיציות מהבורסה.' : 'אין פוזיציות פתוחות כרגע.'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-0">
              <div className="text-[11px] text-text-muted">פתוחות</div>
              <Num className="text-base md:text-lg font-bold text-text-primary">{posRows.length}</Num>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-text-muted">לא ממומש</div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <Num className={`text-base md:text-lg font-bold ${tone}`}>{mask(fmtUsd(totals.upnl, { signed: true }))}</Num>
                {!hidden && totals.upnlPct != null && (
                  <Num className={`text-[11px] ${tone}`}>{fmtPct(totals.upnlPct)}</Num>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-text-muted">סיכון פתוח</div>
              <Num className="text-base md:text-lg font-bold text-text-primary">{mask(fmtUsd(totals.risk))}</Num>
            </div>
          </div>

          <div className="mt-2">
            {top.map(({ key, p, m }) => (
              <button
                key={key}
                type="button"
                onClick={openAll}
                className="w-full flex items-center gap-2.5 py-2 border-t border-border-primary/70 first:border-t-0 text-right cursor-pointer hover:bg-bg-tertiary/40 rounded-lg transition-colors"
              >
                <span className="w-8 h-8 rounded-full bg-bg-tertiary border border-border-primary grid place-items-center shrink-0">
                  <CoinIcon pair={p.pair} className="w-5 h-5" />
                </span>
                <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <span dir="ltr" className="text-sm font-bold text-text-primary whitespace-nowrap">{p.pair}</span>
                  <DirBadge direction={p.direction} />
                </span>
                <Num className={`ms-auto text-sm font-bold shrink-0 ${pnlTone(m.upnl)}`}>
                  {mask(fmtUsd(m.upnl, { signed: true }))}
                </Num>
              </button>
            ))}
          </div>
          {rest > 0 && <p className="text-[12px] text-text-muted pt-1">ועוד {rest}</p>}
        </>
      )}
    </HomePanel>
  );
}
