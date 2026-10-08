import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CandlestickChart, RefreshCw, Square, Columns2, Grid2x2, Link2, TriangleAlert, Layers, ListOrdered,
} from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import Card from '../shared/Card';
import TabStrip from '../shared/TabStrip';
import Skeleton from '../shared/Skeleton';
import EmptyState from '../shared/EmptyState';
import CoinIcon from '../shared/CoinIcon';
import { headerIconBtn } from '../shared/headerStyles';
import TerminalCharts from './TerminalCharts';
import TerminalPositions from './TerminalPositions';
import TerminalOrders from './TerminalOrders';
import { ExchangeTag, Num } from './terminalUi';
import { useNow, useMedia, useAppTheme } from './terminalHooks';
import { useTerminalData } from '../../hooks/useTerminalData';
import { useJournalContext } from '../../contexts/JournalContext';
import { pageVariants, pageTransition } from '../../utils/animations';
import {
  EXCHANGE_LABELS, tvSymbol, positionMetrics, positionTotals, journalTradeForPosition, saneLiveMark,
  fmtUsd, fmtPct, agoLabel, pnlTone,
} from '../../utils/terminal';

const MotionDiv = motion.div;

const LS_SEL = 'tradeos_terminal_symbol';
const LS_LAYOUT = 'tradeos_terminal_layout';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

const LAYOUTS = [
  { id: 1, icon: Square, label: 'גרף אחד' },
  { id: 2, icon: Columns2, label: 'שני גרפים' },
  { id: 4, icon: Grid2x2, label: 'ארבעה גרפים' },
];

const posKey = (p) => `${p.source}|${p.externalId || ''}|${p.pair}|${p.direction}`;

function UpdatedLabel({ at, refreshing }) {
  const now = useNow(1000);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted whitespace-nowrap" aria-live="polite">
      <span className={`w-1.5 h-1.5 rounded-full ${at ? 'bg-profit' : 'bg-text-muted'} ${refreshing ? 'animate-pulse' : ''}`} />
      {at ? `עודכן ${agoLabel(at, now)}` : 'טוען…'}
    </span>
  );
}

function LayoutToggle({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="פריסת גרפים" className="hidden md:inline-flex items-center gap-0.5 h-11 rounded-xl bg-bg-tertiary border border-border-primary p-1">
      {LAYOUTS.map(({ id, icon, label }) => {
        const Icon = icon;
        return (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          title={label}
          aria-label={label}
          onClick={() => onChange(id)}
          className={`w-9 h-full rounded-lg grid place-items-center transition-colors cursor-pointer ${
            value === id ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
        );
      })}
    </div>
  );
}

function ExchangeChips({ exchanges, value, onChange, counts }) {
  const chip = (on) => `inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
    on ? 'border-accent-primary/40 bg-accent-primary/12 text-accent-hover' : 'border-border-primary bg-bg-tertiary text-text-muted hover:text-text-primary'
  }`;
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="סינון לפי בורסה">
      <button type="button" aria-pressed={value === 'all'} onClick={() => onChange('all')} className={chip(value === 'all')}>הכל</button>
      {exchanges.map((ex) => (
        <button key={ex} type="button" aria-pressed={value === ex} onClick={() => onChange(ex)} className={chip(value === ex)}>
          {EXCHANGE_LABELS[ex] || ex}
          {counts[ex] > 0 && <Num className="text-[10px] opacity-75">{counts[ex]}</Num>}
        </button>
      ))}
    </div>
  );
}

// Symbol picker above the charts: the current symbol, then the other open
// positions' symbols as one-tap chips.
function SymbolBar({ selected, choices, onPick }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="inline-flex items-center gap-2 h-9 px-3 rounded-xl bg-bg-secondary border border-border-primary shrink-0">
        <CoinIcon pair={selected.pair} className="w-5 h-5" />
        <span className="font-bold text-sm text-text-primary" dir="ltr">{selected.pair}</span>
        <span className="text-[11px] hidden sm:inline"><ExchangeTag exchange={selected.exchange} compact /></span>
      </span>
      {choices.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-w-0">
          {choices.map((c) => (
            <button
              key={`${c.exchange}|${c.pair}`}
              type="button"
              onClick={() => onPick(c)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border-primary bg-bg-tertiary text-xs text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer shrink-0"
            >
              <CoinIcon pair={c.pair} className="w-4 h-4" />
              <span dir="ltr" className="font-semibold">{c.pair.replace(/USDT$/, '')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Totals({ totals, count }) {
  const cell = 'min-w-0 rounded-xl bg-bg-tertiary border border-border-primary px-3 py-2';
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <div className={cell}>
        <div className="text-[10px] text-text-muted">שווי כולל · {count} פוזיציות</div>
        <Num className="text-sm md:text-base font-bold text-text-primary">{fmtUsd(totals.value)}</Num>
      </div>
      <div className={cell}>
        <div className="text-[10px] text-text-muted">רווח/הפסד לא ממומש</div>
        <div className="flex items-baseline gap-2">
          <Num className={`text-sm md:text-base font-bold ${pnlTone(totals.upnl)}`}>{fmtUsd(totals.upnl, { signed: true })}</Num>
          {totals.upnlPct != null && <Num className={`text-[10px] ${pnlTone(totals.upnl)}`}>{fmtPct(totals.upnlPct)}</Num>}
        </div>
      </div>
      <div className={cell}>
        <div className="text-[10px] text-text-muted">מרג׳ין בשימוש</div>
        <Num className="text-sm md:text-base font-bold text-text-primary">{fmtUsd(totals.margin)}</Num>
      </div>
      <div className={cell}>
        <div className="text-[10px] text-text-muted">סיכון פתוח (עד הסטופים)</div>
        <Num className="text-sm md:text-base font-bold text-text-primary">{fmtUsd(totals.risk)}</Num>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 py-1" aria-hidden>
      {[0, 1, 2].map((i) => <Skeleton key={i} variant="card" className="h-14" />)}
    </div>
  );
}

export default function TerminalPage() {
  const navigate = useNavigate();
  const { journals } = useJournalContext();
  const { connected, snapshots, marks, openTrades, loading, refreshing, lastUpdated, refresh } = useTerminalData();
  const mobile = useMedia('(max-width: 767px)');
  const theme = useAppTheme();

  const [tab, setTab] = useState('positions');
  const [exFilter, setExFilter] = useState('all');
  const [layout, setLayoutState] = useState(() => {
    const v = parseInt(lsGet(LS_LAYOUT), 10);
    return [1, 2, 4].includes(v) ? v : 4;
  });
  const setLayout = (v) => { setLayoutState(v); lsSet(LS_LAYOUT, String(v)); };

  // The charted symbol: what the user picked (remembered), else the biggest
  // open position, else BTC.
  const [picked, setPicked] = useState(() => {
    try { const v = JSON.parse(lsGet(LS_SEL) || 'null'); return v?.pair ? v : null; } catch { return null; }
  });
  const [pickedNow, setPickedNow] = useState(false);
  const chartsRef = useRef(null);

  const journalByExchange = useMemo(() => {
    const m = {};
    for (const j of journals || []) if (j.exchange && !m[j.exchange]) m[j.exchange] = j.name;
    return m;
  }, [journals]);

  const exchanges = useMemo(() => connected || [], [connected]);
  const allPositions = useMemo(() => exchanges.flatMap((ex) => (snapshots[ex]?.positions || []).map((p) => ({ ...p, source: p.source || ex }))), [exchanges, snapshots]);
  const allOrders = useMemo(() => exchanges.flatMap((ex) => (snapshots[ex]?.orders || []).map((o) => ({ ...o, exchange: o.exchange || ex }))), [exchanges, snapshots]);

  const posRows = useMemo(() => allPositions
    .filter((p) => exFilter === 'all' || p.source === exFilter)
    .map((p) => {
      const liveMark = saneLiveMark(p, marks[p.pair]);
      const journalTrade = journalTradeForPosition(p, openTrades);
      return {
        key: posKey(p),
        p,
        m: positionMetrics(p, { liveMark, orders: allOrders, journalTrade }),
        journalName: journalByExchange[p.source] || null,
        inJournal: !!journalTrade,
        live: liveMark > 0,
      };
    })
    .sort((a, b) => b.m.value - a.m.value), [allPositions, allOrders, marks, openTrades, exFilter, journalByExchange]);

  const orderRows = useMemo(() => allOrders
    .filter((o) => exFilter === 'all' || o.exchange === exFilter)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((o) => ({ key: `${o.exchange}|${o.id}`, o, journalName: journalByExchange[o.exchange] || null })), [allOrders, exFilter, journalByExchange]);

  const totals = useMemo(() => positionTotals(posRows), [posRows]);

  const counts = useMemo(() => {
    const c = {};
    for (const p of allPositions) c[p.source] = (c[p.source] || 0) + 1;
    return c;
  }, [allPositions]);

  // A pick made on this visit always wins; a remembered one only while that
  // position is still open (else the biggest open position leads).
  const auto = posRows[0] ? { pair: posRows[0].p.pair, exchange: posRows[0].p.source } : null;
  const pickedIsOpen = !!picked && posRows.some((r) => r.p.pair === picked.pair && r.p.source === picked.exchange);
  const selected = (picked && (pickedNow || pickedIsOpen || !auto)) ? picked : (auto || { pair: 'BTCUSDT', exchange: 'bybit' });
  const selectedKey = posRows.find((r) => r.p.pair === selected.pair && r.p.source === selected.exchange)?.key || null;

  const pick = useCallback((pair, exchange) => {
    const v = { pair, exchange };
    setPickedNow(true);
    setPicked(v);
    lsSet(LS_SEL, JSON.stringify(v));
    if (window.matchMedia?.('(max-width: 767px)').matches) chartsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const symbolChoices = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const r of posRows) {
      const k = `${r.p.source}|${r.p.pair}`;
      if (seen.has(k) || (r.p.pair === selected.pair && r.p.source === selected.exchange)) continue;
      seen.add(k);
      out.push({ pair: r.p.pair, exchange: r.p.source });
    }
    return out.slice(0, 12);
  }, [posRows, selected.pair, selected.exchange]);

  const problems = exchanges
    .map((ex) => ({ ex, s: snapshots[ex] }))
    .filter(({ s }) => s && (s.error || s.positionsError || s.ordersError || s.ordersPartial));

  const noExchanges = connected !== null && exchanges.length === 0;

  const tabs = [
    { id: 'positions', label: `פוזיציות (${posRows.length})`, mobileLabel: `פוזיציות (${posRows.length})` },
    { id: 'orders', label: `פקודות פתוחות (${orderRows.length})`, mobileLabel: `פקודות (${orderRows.length})` },
  ];

  return (
    <MotionDiv variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <PageHeader
        icon={CandlestickChart}
        title="טרמינל"
        subtitle="פוזיציות, פקודות וגרפים חיים מכל הבורסות המחוברות — קריאה בלבד"
        actions={(
          <>
            {!noExchanges && <UpdatedLabel at={lastUpdated} refreshing={refreshing} />}
            <LayoutToggle value={layout} onChange={setLayout} />
            {!noExchanges && (
              <button type="button" onClick={refresh} disabled={refreshing || connected === null} className={headerIconBtn} title="רענון" aria-label="רענון">
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </>
        )}
      />

      <div className="space-y-3 md:space-y-4">
        {exchanges.length > 1 && <ExchangeChips exchanges={exchanges} value={exFilter} onChange={setExFilter} counts={counts} />}

        <div ref={chartsRef} className="scroll-mt-20">
          <TerminalCharts
            symbol={tvSymbol(selected.pair, selected.exchange)}
            layout={layout}
            theme={theme}
            mobile={mobile}
            toolbar={<SymbolBar selected={selected} choices={symbolChoices} onPick={(c) => pick(c.pair, c.exchange)} />}
          />
        </div>

        <Card className="rounded-2xl p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="rounded-xl bg-bg-tertiary border border-border-primary p-1">
              <TabStrip tabs={tabs} value={tab} onChange={setTab} variant={mobile ? 'mobile' : 'desktop'} layoutKey="terminal-tab" />
            </div>
            {tab === 'positions' && posRows.some((r) => r.live) && (
              <span className="text-[10px] text-text-muted">מחיר מארק חי בין רענונים · הרווח/הפסד מחושב מחדש</span>
            )}
          </div>

          {problems.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {problems.map(({ ex, s }) => (
                <div key={ex} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-breakeven/25 bg-breakeven/10 px-3 py-2 text-[12px] text-text-secondary">
                  <TriangleAlert className="w-3.5 h-3.5 text-breakeven shrink-0" />
                  <b className="text-text-primary">{EXCHANGE_LABELS[ex] || ex}</b>
                  <span className="text-text-muted">—</span>
                  <span>{s.error || s.positionsError || s.ordersError || 'חלק מסוגי הפקודות (TP/SL / טריגר) לא נטענו'}</span>
                  {(s.reason || /מפתח|חבר מחדש/.test(s.error || s.positionsError || s.ordersError || '')) && (
                    <button type="button" onClick={() => navigate('/journal?tab=exchange')} className="text-accent-primary hover:underline cursor-pointer">עדכון מפתחות</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {noExchanges ? (
            <EmptyState
              icon={Link2}
              title="עוד לא חיברת בורסה"
              description="חבר את Bybit, MEXC, OKX, Bitget (מפתח קריאה בלבד) או Hyperliquid (כתובת ארנק) — והפוזיציות והפקודות הפתוחות יופיעו כאן בזמן אמת."
              actionLabel="חיבור בורסות"
              onAction={() => navigate('/journal?tab=exchange')}
            />
          ) : loading ? (
            <ListSkeleton />
          ) : tab === 'positions' ? (
            posRows.length ? (
              <div className="space-y-3">
                <Totals totals={totals} count={posRows.length} />
                <TerminalPositions rows={posRows} selectedKey={selectedKey} onSelect={(p) => pick(p.pair, p.source)} mobile={mobile} />
              </div>
            ) : (
              <EmptyState icon={Layers} title="אין פוזיציות פתוחות" description="כשתפתח פוזיציה באחת הבורסות המחוברות היא תופיע כאן תוך כמה שניות." />
            )
          ) : orderRows.length ? (
            <TerminalOrders rows={orderRows} onSelect={(o) => pick(o.pair, o.exchange)} mobile={mobile} />
          ) : (
            <EmptyState icon={ListOrdered} title="אין פקודות פתוחות" description="פקודות לימיט, סטופ, TP וטריגר שממתינות בבורסה יופיעו כאן." />
          )}
        </Card>
      </div>
    </MotionDiv>
  );
}
