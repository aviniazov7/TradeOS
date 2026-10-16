import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, ListOrdered, Layers, RefreshCw, TriangleAlert } from 'lucide-react';
import Card from '../shared/Card';
import Skeleton from '../shared/Skeleton';
import EmptyState from '../shared/EmptyState';
import { headerIconBtn } from '../shared/headerStyles';
import TerminalPositions from '../terminal/TerminalPositions';
import TerminalOrders from '../terminal/TerminalOrders';
import { Num } from '../terminal/terminalUi';
import { useNow, useMedia } from '../terminal/terminalHooks';
import { useTerminalData } from '../../hooks/useTerminalData';
import { useJournalContext } from '../../contexts/JournalContext';
import {
  EXCHANGE_LABELS, positionMetrics, positionTotals, journalTradeForPosition, saneLiveMark,
  fmtUsd, fmtPct, agoLabel, pnlTone,
} from '../../utils/terminal';

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

function SectionTitle({ children }) {
  return <h3 className="text-sm font-bold text-text-primary mb-2">{children}</h3>;
}

// Open positions and resting orders from the connected exchanges. Read-only.
// The old trading-station charts stay out of the journal.
export default function OpenPositionsTab() {
  const navigate = useNavigate();
  const { journals } = useJournalContext();
  const { connected, snapshots, marks, openTrades, loading, refreshing, lastUpdated, refresh } = useTerminalData();
  const mobile = useMedia('(max-width: 767px)');
  const [exFilter, setExFilter] = useState('all');

  const journalByExchange = useMemo(() => {
    const map = {};
    for (const j of journals || []) if (j.exchange && !map[j.exchange]) map[j.exchange] = j.name;
    return map;
  }, [journals]);

  const exchanges = useMemo(() => connected || [], [connected]);
  const allPositions = useMemo(
    () => exchanges.flatMap((ex) => (snapshots[ex]?.positions || []).map((p) => ({ ...p, source: p.source || ex }))),
    [exchanges, snapshots],
  );
  const allOrders = useMemo(
    () => exchanges.flatMap((ex) => (snapshots[ex]?.orders || []).map((o) => ({ ...o, exchange: o.exchange || ex }))),
    [exchanges, snapshots],
  );

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

  const problems = exchanges
    .map((ex) => ({ ex, s: snapshots[ex] }))
    .filter(({ s }) => s && (s.error || s.positionsError || s.ordersError || s.ordersPartial));
  const noExchanges = connected !== null && exchanges.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {!noExchanges && <UpdatedLabel at={lastUpdated} refreshing={refreshing} />}
        {!noExchanges && (
          <button type="button" onClick={refresh} disabled={refreshing || connected === null} className={headerIconBtn} title="רענון" aria-label="רענון">
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {exchanges.length > 1 && <ExchangeChips exchanges={exchanges} value={exFilter} onChange={setExFilter} counts={counts} />}

      <Card className="rounded-2xl p-3 md:p-4 space-y-5">
        {problems.length > 0 && (
          <div className="space-y-1.5">
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
            description="חבר בורסה במפתח קריאה בלבד, והפוזיציות והפקודות הפתוחות יופיעו כאן."
            actionLabel="חיבור בורסאות"
            onAction={() => navigate('/journal?tab=exchange')}
          />
        ) : loading ? (
          <ListSkeleton />
        ) : (
          <>
            <section>
              <SectionTitle>פוזיציות פתוחות</SectionTitle>
              {posRows.length ? (
                <div className="space-y-3">
                  <Totals totals={totals} count={posRows.length} />
                  <TerminalPositions rows={posRows} mobile={mobile} />
                </div>
              ) : (
                <EmptyState icon={Layers} title="אין פוזיציות פתוחות" description="כשתפתח פוזיציה באחת הבורסות המחוברות היא תופיע כאן." />
              )}
            </section>
            <section>
              <SectionTitle>פקודות פתוחות</SectionTitle>
              {orderRows.length ? (
                <TerminalOrders rows={orderRows} mobile={mobile} />
              ) : (
                <EmptyState icon={ListOrdered} title="אין פקודות פתוחות" description="פקודות לימיט, סטופ ו-TP שממתינות בבורסה יופיעו כאן." />
              )}
            </section>
          </>
        )}
      </Card>
    </div>
  );
}
