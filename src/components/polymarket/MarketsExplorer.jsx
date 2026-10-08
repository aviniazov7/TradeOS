import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Search, AlertCircle, RefreshCw, Zap, Droplets, CalendarClock, Sparkles } from 'lucide-react';
import { usePolymarkets } from '../../hooks/usePolymarkets';
import { fmtUsd } from '../../utils/polymarketScore';
import { staggerContainer, staggerItem } from '../../utils/animations';

const SORTS = [
  { key: 'volume', label: 'מחזור 24ש׳', icon: Zap, val: (m) => m.volume24hr },
  { key: 'liquidity', label: 'נזילות', icon: Droplets, val: (m) => m.liquidity },
  { key: 'closing', label: 'נסגר בקרוב', icon: CalendarClock, val: (m) => (m.endDate ? -new Date(m.endDate).getTime() : -Infinity) },
  { key: 'new', label: 'חדשים', icon: Sparkles, val: (m) => (m.isNew ? 1 : 0) },
];

// A binary market's YES+NO should price to ~$1. A gap beyond fees is a
// mispricing signal (NOT executable arbitrage — depth and fees eat gaps).
const ARB_GAP = 0.03;

function daysLeft(endDate) {
  if (!endDate) return null;
  const d = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  return Number.isFinite(d) ? d : null;
}

function pct(p) {
  return `${Math.round((Number(p) || 0) * 100)}%`;
}

function MarketRow({ m, onOpen }) {
  const yes = m.prices[0] ?? 0;
  const gap = Math.abs(1 - m.priceSum);
  const hasArb = m.outcomes.length === 2 && gap >= ARB_GAP;
  const dl = daysLeft(m.endDate);
  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary text-right cursor-pointer transition-colors hover:border-accent-primary/40 outline-none focus-visible:border-accent-primary/60">
      {m.icon
        ? <img src={m.icon} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" loading="lazy" />
        : <div className="w-9 h-9 rounded-lg bg-bg-tertiary shrink-0" />}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-text-primary truncate" dir="auto">{m.question}</span>
          {m.isNew && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-accent-primary/15 text-accent-primary shrink-0">חדש</span>}
          {hasArb && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-400/15 text-amber-400 shrink-0"
              title={`סכום המחירים ${Math.round(m.priceSum * 100)}¢ במקום 100¢ — פער תמחור של ${Math.round(gap * 100)}¢ (איתות, לא ארביטראז' מובטח)`}>
              פער {Math.round(gap * 100)}¢
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted num-mono">
          <span>נפח {fmtUsd(m.volume24hr)}</span>
          <span>· נזילות {fmtUsd(m.liquidity)}</span>
          {dl != null && <span>· {dl <= 0 ? 'נסגר היום' : `${dl} ימים`}</span>}
        </div>
      </div>

      {/* probability capsule */}
      <div className="text-left shrink-0">
        <div className={`text-sm font-extrabold num-mono ${yes >= 0.5 ? 'text-profit' : 'text-loss'}`}>{pct(yes)}</div>
        <div className="text-[9px] text-text-muted truncate max-w-[72px]">{m.outcomes[0]}</div>
      </div>
      <div className="w-14 h-1.5 rounded-full bg-loss/25 overflow-hidden shrink-0" title={`${m.outcomes[0]} ${pct(yes)} · ${m.outcomes[1] || ''} ${pct(m.prices[1])}`}>
        <div className="h-full bg-profit" style={{ width: `${Math.min(100, yes * 100)}%` }} />
      </div>
    </div>
  );
}

// Markets explorer — browse the live Polymarket board: probabilities, volume,
// liquidity, closing time, mispricing badges. Click → in-app market page.
export default function MarketsExplorer() {
  const navigate = useNavigate();
  const { markets, loading, error, refetch } = usePolymarkets();
  const [sort, setSort] = useState('volume');
  const [query, setQuery] = useState('');

  const view = useMemo(() => {
    let list = markets;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((m) => m.question.toLowerCase().includes(q));
    const s = SORTS.find((x) => x.key === sort) || SORTS[0];
    return [...list].sort((a, b) => s.val(b) - s.val(a));
  }, [markets, sort, query]);

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 flex-1 min-w-[150px] focus-within:border-accent-primary/50 transition-colors">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חפש שוק…"
            className="bg-transparent text-sm text-text-primary placeholder-text-muted outline-none w-full" />
        </div>
        <div className="inline-flex bg-bg-secondary border border-border-primary rounded-lg p-0.5 gap-0.5 overflow-x-auto">
          {SORTS.map((s) => (
            <button key={s.key} onClick={() => setSort(s.key)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${sort === s.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>
              <s.icon className="w-3 h-3" /> {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary animate-pulse">
            <span className="w-9 h-9 rounded-lg bg-bg-tertiary shrink-0" />
            <div className="flex-1"><div className="h-3 w-40 bg-bg-tertiary rounded" /><div className="h-2 w-24 bg-bg-tertiary rounded mt-1.5" /></div>
            <div className="h-4 w-10 bg-bg-tertiary rounded" />
          </div>
        ))}</div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-10 rounded-2xl border border-loss/25 bg-loss/5 text-center">
          <AlertCircle className="w-6 h-6 text-loss" />
          <p className="text-sm text-text-secondary max-w-xs">{error}</p>
          <button onClick={refetch} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-xs font-semibold text-text-primary hover:text-accent-primary transition-colors cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
          </button>
        </div>
      ) : view.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 rounded-2xl border border-dashed border-border-primary text-text-muted">
          <Search className="w-7 h-7 opacity-60" />
          <span className="text-sm font-medium">לא נמצאו שווקים</span>
        </div>
      ) : (
        <motion.div className="space-y-2" variants={staggerContainer} initial="initial" animate="animate">
          {view.map((m) => (
            <motion.div key={m.conditionId} variants={staggerItem}>
              <MarketRow m={m} onOpen={() => navigate(`/polymarket/market/${m.conditionId}`, { state: { market: m, from: '/market?tab=polymarket&pm=markets' } })} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
