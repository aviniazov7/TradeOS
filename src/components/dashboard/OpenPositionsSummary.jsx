import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import { DirBadge, Num } from '../terminal/terminalUi';
import { HOME_POLL_MS, useTerminalData } from '../../hooks/useTerminalData';
import {
  positionMetrics, positionTotals, journalTradeForPosition, saneLiveMark,
  fmtUsd, fmtPct, pnlTone,
} from '../../utils/terminal';
import { tickerCoinKey } from '../../utils/tickerMarks';
import { chipsThatFit } from '../../utils/chipsThatFit';

// Stable empty list so the memos don't recompute while the exchange list loads.
const NONE = [];
const TOP = 3;
const posKey = (p) => `${p.source}|${p.externalId || ''}|${p.pair}|${p.direction}`;
const CHIP = 'pos-chip shrink-0';

function gapPx(el) {
  const raw = getComputedStyle(el).columnGap || '0';
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith('rem') ? n * 16 : n;
}

const Sep = () => <span className="text-text-muted" aria-hidden>·</span>;

// Slim home strip for the same book as the journal's בורסה tab.
// One row on desktop (~64px), two lines on a phone. Absent when the book is empty.
export default function OpenPositionsSummary({ hidden = false }) {
  const navigate = useNavigate();
  const { connected, snapshots, marks, openTrades } = useTerminalData({ pollMs: HOME_POLL_MS });
  const openAll = () => navigate('/journal?tab=exchange');

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
  const top = posRows.slice(0, TOP);
  const rowRef = useRef(null);
  const measureRef = useRef(null);
  const [fitCount, setFitCount] = useState(TOP);
  const measureKey = `${posRows.length}|${hidden ? 1 : 0}|${top.map(({ key, m }) => `${key}:${m.upnl}`).join(',')}`;

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return undefined;
    const apply = () => {
      const chipWidths = [...measure.querySelectorAll('[data-chip]')].map((el) => el.offsetWidth);
      const overflowWidth = measure.querySelector('[data-overflow]')?.offsetWidth || 0;
      const n = chipsThatFit({
        chipWidths,
        overflowWidth,
        gap: gapPx(measure),
        available: row.clientWidth,
        total: posRows.length,
      });
      setFitCount((prev) => (prev === n ? prev : n));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measureKey, posRows.length]);

  // No connection, still loading the list, or a flat book: leave the home page alone.
  if (!exchanges.length || posRows.length === 0) return null;

  const mask = (text) => (hidden ? '••••' : text);
  const tone = pnlTone(totals.upnl);
  const shown = top.slice(0, fitCount);
  const hiddenCount = posRows.length - shown.length;

  return (
    <section data-testid="open-positions-strip" className="positions panel" aria-label="פוזיציות פתוחות">
      <div className="positions__lead">
        <span className="positions__title">פוזיציות פתוחות</span>
        <Num className="positions__count">{posRows.length}</Num>
        <Sep />
        <span className="text-text-secondary">לא ממומש</span>
        <Num className={`font-bold ${tone}`}>{mask(fmtUsd(totals.upnl, { signed: true }))}</Num>
        {!hidden && totals.upnlPct != null && (
          <Num className={tone}>({fmtPct(totals.upnlPct)})</Num>
        )}
      </div>
      <div ref={rowRef} className="positions__chips">
        <div ref={measureRef} aria-hidden className="absolute top-0 left-0 -z-10 flex items-center gap-1.5 invisible pointer-events-none">
          {top.map(({ key, p, m }) => (
            <span key={key} data-chip="" className={CHIP}>
              <CoinIcon pair={p.pair} className="w-4 h-4" />
              <span dir="ltr">{tickerCoinKey(p.pair) || p.pair}</span>
              <DirBadge direction={p.direction} className="!h-4 !px-1 !text-[9px]" />
              <span>{mask(fmtUsd(m.upnl, { signed: true }))}</span>
            </span>
          ))}
          <span data-overflow="" className={CHIP}>+{posRows.length}</span>
        </div>
        {shown.map(({ key, p, m }) => (
          <button
            key={key}
            type="button"
            data-chip=""
            onClick={openAll}
            title={p.pair}
            className={CHIP}
          >
            <CoinIcon pair={p.pair} className="w-4 h-4" />
            <span dir="ltr">{tickerCoinKey(p.pair) || p.pair}</span>
            <DirBadge direction={p.direction} className="!h-4 !px-1 !text-[9px]" />
            <Num className={`font-bold ${pnlTone(m.upnl)}`}>{mask(fmtUsd(m.upnl, { signed: true }))}</Num>
          </button>
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            data-testid="open-positions-overflow"
            onClick={openAll}
            aria-label={`עוד ${hiddenCount} פוזיציות`}
            className={`${CHIP} text-text-secondary`}
          >
            +{hiddenCount}
          </button>
        )}
      </div>
      <div className="positions__risk">סיכון <strong>{mask(fmtUsd(totals.risk))}</strong></div>
      <button type="button" onClick={openAll} className="panel__link">
        לכל הפוזיציות <ChevronLeft className="w-3.5 h-3.5" aria-hidden />
      </button>
    </section>
  );
}
