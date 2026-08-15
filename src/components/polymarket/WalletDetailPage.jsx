import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { ArrowRight, ExternalLink, ShieldCheck, AlertCircle, Wallet } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWalletPositions } from '../../hooks/useWalletPositions';
import ScoreRing from './ScoreRing';
import { pnlSplit, fmtUsd, fmtPct, shortWallet } from '../../utils/polymarketScore';
import { profileUrl } from '../../services/polymarketService';
import { pageVariants, pageTransition } from '../../utils/animations';

const SORTS = [
  { key: 'value', label: 'שווי', val: (p) => p.currentValue },
  { key: 'pnl', label: 'רווח', val: (p) => p.cashPnl },
  { key: 'conviction', label: 'שכנוע', val: (p) => p.conviction },
];

function cents(p) {
  const v = Number(p) || 0;
  return `${Math.round(v * 100)}¢`;
}

function fmtShares(n) {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

function Stat({ label, value, tone }) {
  const color = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : tone === 'accent' ? 'text-accent-primary' : 'text-text-primary';
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl px-3 py-2.5 min-w-0">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className={`text-sm font-extrabold num-mono mt-0.5 truncate ${color}`}>{value}</div>
    </div>
  );
}

function Field({ label, value, tone }) {
  const color = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-text-primary';
  return (
    <div className="min-w-0">
      <div className="text-[9px] text-text-muted">{label}</div>
      <div className={`text-xs font-bold num-mono truncate ${color}`}>{value}</div>
    </div>
  );
}

function PositionCard({ p }) {
  const up = (p.cashPnl || 0) >= 0;
  const convPct = Math.round((p.conviction || 0) * 100);
  const marketUrl = p.eventSlug ? `https://polymarket.com/event/${p.eventSlug}` : null;
  return (
    <div className="rounded-xl bg-bg-secondary border border-border-primary p-3">
      {/* top: market + outcome */}
      <div className="flex items-center gap-2.5">
        {p.icon
          ? <img src={p.icon} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" loading="lazy" />
          : <div className="w-8 h-8 rounded-lg bg-bg-tertiary shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-text-primary truncate">{p.title}</span>
            {marketUrl && (
              <a href={marketUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                className="text-text-muted hover:text-accent-primary transition-colors shrink-0" title="פתח את השוק ב-Polymarket"><ExternalLink className="w-3 h-3" /></a>
            )}
          </div>
          <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${p.outcome === 'Yes' ? 'bg-profit/10 text-profit' : p.outcome === 'No' ? 'bg-loss/10 text-loss' : 'bg-bg-tertiary text-text-muted'}`}>
            {p.outcome}
          </span>
        </div>
        <div className="text-left shrink-0">
          <div className="text-sm font-extrabold num-mono text-text-primary">{fmtUsd(p.currentValue)}</div>
          <div className={`text-[11px] font-bold num-mono ${up ? 'text-profit' : 'text-loss'}`}>{fmtUsd(p.cashPnl)} · {fmtPct(p.percentPnl * 100)}</div>
        </div>
      </div>

      {/* detail grid */}
      <div className="grid grid-cols-4 gap-2 mt-2.5 pt-2.5 border-t border-border-primary">
        <Field label="כמות" value={fmtShares(p.size)} />
        <Field label="כניסה" value={cents(p.avgPrice)} />
        <Field label="נוכחי" value={cents(p.curPrice)} />
        <Field label="הושקע" value={fmtUsd(p.initialValue)} />
      </div>

      {/* conviction */}
      <div className="flex items-center gap-2 mt-2" title={`${convPct}% מהתיק`}>
        <span className="text-[9px] text-text-muted shrink-0">שכנוע</span>
        <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden flex-1">
          <div className="h-full rounded-full bg-accent-primary" style={{ width: `${convPct}%` }} />
        </div>
        <span className="text-[10px] text-text-muted num-mono shrink-0">{convPct}%</span>
      </div>
    </div>
  );
}

// Full wallet page — every position the wallet holds, in detail. Opened by
// clicking a wallet on the leaderboard (passes its 30d stats via router state).
export default function WalletDetailPage() {
  const { isPremium } = useAuth();
  const { address } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [sort, setSort] = useState('value');

  const row = state?.row || null;
  const { positions, loading, error } = useWalletPositions(address, 500);

  const split = pnlSplit(positions);
  const bookValue = useMemo(() => positions.reduce((s, p) => s + (p.currentValue || 0), 0), [positions]);
  const sorted = useMemo(() => {
    const f = SORTS.find((s) => s.key === sort)?.val || SORTS[0].val;
    return [...positions].sort((a, b) => f(b) - f(a));
  }, [positions, sort]);

  if (!isPremium) return <Navigate to="/polymarket" replace />;

  const name = row?.name || shortWallet(address);
  const link = profileUrl(address);

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} className="max-w-3xl mx-auto">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-3 cursor-pointer">
        <ArrowRight className="w-4 h-4" /> חזרה לדירוג
      </button>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-accent-primary/20 bg-[#070b12] p-4 mb-4">
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-accent-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          {row?.profileImage
            ? <img src={row.profileImage} alt="" className="w-12 h-12 rounded-full object-cover" loading="lazy" />
            : <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center"><Wallet className="w-5 h-5 text-accent-primary" /></div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-white truncate">{name}</span>
              {row?.verified && <ShieldCheck className="w-4 h-4 text-accent-primary shrink-0" />}
            </div>
            <span className="text-[11px] text-white/50 num-mono" dir="ltr">{shortWallet(address)}</span>
          </div>
          {row?.smartScore != null && <ScoreRing score={row.smartScore} size="xl" />}
        </div>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="relative inline-flex items-center gap-1.5 mt-3 text-[11px] font-semibold text-accent-primary hover:text-accent-hover transition-colors">
            פרופיל מלא ב-Polymarket <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {row ? (
          <>
            <Stat label="PnL (30 יום)" value={fmtUsd(row.pnl)} tone={row.pnl >= 0 ? 'profit' : 'loss'} />
            <Stat label="ROI" value={fmtPct(row.roi)} tone={row.roi >= 0 ? 'profit' : 'loss'} />
            <Stat label="מחזור" value={fmtUsd(row.volume)} />
          </>
        ) : (
          <>
            <Stat label="שווי תיק" value={fmtUsd(bookValue)} tone="accent" />
            <Stat label="ממומש" value={fmtUsd(split.realized)} tone={split.realized >= 0 ? 'profit' : 'loss'} />
            <Stat label="לא-ממומש" value={fmtUsd(split.unrealized)} tone={split.unrealized >= 0 ? 'profit' : 'loss'} />
          </>
        )}
      </div>

      {/* Positions header + sort */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-bold text-text-primary">
          פוזיציות {positions.length > 0 && <span className="text-text-muted font-normal">({positions.length})</span>}
        </h2>
        {positions.length > 1 && (
          <div className="inline-flex bg-bg-secondary border border-border-primary rounded-lg p-0.5 gap-0.5">
            {SORTS.map((s) => (
              <button key={s.key} onClick={() => setSort(s.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${sort === s.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Positions */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-bg-secondary animate-pulse" />)}</div>
      ) : error ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-loss"><AlertCircle className="w-4 h-4" />{error}</div>
      ) : positions.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-muted">אין פוזיציות פתוחות כרגע</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((p) => <PositionCard key={`${p.conditionId}-${p.outcome}`} p={p} />)}
        </div>
      )}
    </motion.div>
  );
}
