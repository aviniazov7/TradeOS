import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { ArrowRight, ExternalLink, ShieldCheck, AlertCircle, Wallet, Clock, BrainCircuit } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWalletPositions } from '../../hooks/useWalletPositions';
import { useWalletActivity } from '../../hooks/useWalletActivity';
import ScoreRing from './ScoreRing';
import WalletAnalystModal from './WalletAnalystModal';
import { pnlSplit, fmtUsd, fmtPct, shortWallet } from '../../utils/polymarketScore';
import { profileUrl, marketUrl } from '../../services/polymarketService';
import { timeAgoEn, sideLabelEn } from '../../utils/polymarketLabels';
import { pageVariants, pageTransition } from '../../utils/animations';

const SORTS = [
  { key: 'value', label: 'שווי', val: (p) => p.currentValue },
  { key: 'pnl', label: 'רווח', val: (p) => p.cashPnl },
  { key: 'conviction', label: 'נתח מהתיק', val: (p) => p.conviction },
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
  const link = marketUrl(p.eventSlug, p.slug); // service helper — encoded, fixed origin
  return (
    <div className="rounded-xl bg-bg-secondary border border-border-primary p-3">
      {/* top: market + outcome */}
      <div className="flex items-center gap-2.5">
        {p.icon
          ? <img src={p.icon} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" loading="lazy" />
          : <div className="w-8 h-8 rounded-lg bg-bg-tertiary shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-text-primary truncate" dir="auto">{p.title}</span>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                className="text-text-muted hover:text-accent-primary transition-colors shrink-0" title="פתח את השוק ב-Polymarket"><ExternalLink className="w-3 h-3" /></a>
            )}
          </div>
          <span className="inline-flex items-center gap-1 mt-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.outcome === 'Yes' ? 'bg-profit/10 text-profit' : p.outcome === 'No' ? 'bg-loss/10 text-loss' : 'bg-bg-tertiary text-text-muted'}`}>
              {p.outcome}
            </span>
            {p.redeemable && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400"
                title="השוק הוכרע והזכייה ממתינה למימוש (Claim) ב-Polymarket">
                ניתן למימוש 🏆
              </span>
            )}
          </span>
        </div>
        <div className="text-left shrink-0">
          <div className="text-sm font-extrabold num-mono text-text-primary">{fmtUsd(p.currentValue)}</div>
          {/* API already returns percentPnl AS a percent — no ×100 */}
          <div className={`text-[11px] font-bold num-mono ${up ? 'text-profit' : 'text-loss'}`}>{fmtUsd(p.cashPnl)} · {fmtPct(p.percentPnl)}</div>
        </div>
      </div>

      {/* detail grid */}
      <div className="grid grid-cols-4 gap-2 mt-2.5 pt-2.5 border-t border-border-primary">
        <Field label="כמות" value={fmtShares(p.size)} />
        <Field label="כניסה" value={cents(p.avgPrice)} />
        <Field label="נוכחי" value={cents(p.curPrice)} />
        <Field label="הושקע" value={fmtUsd(p.initialValue)} />
      </div>

      {/* conviction = share of the wallet's live book in this one position */}
      <div className="flex items-center gap-2 mt-2" title={`הפוזיציה הזו היא ${convPct}% מכל התיק של הארנק — נתח גדול = ביטחון גבוה`}>
        <span className="text-[9px] text-text-muted shrink-0">נתח מהתיק</span>
        <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden flex-1">
          <div className="h-full rounded-full bg-accent-primary" style={{ width: `${convPct}%` }} />
        </div>
        <span className="text-[10px] text-text-muted num-mono shrink-0">{convPct}%</span>
      </div>
    </div>
  );
}

function ActivityRow({ a }) {
  const isBuy = a.side === 'BUY';
  const label = sideLabelEn(a.side, a.type);
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary">
      {a.icon
        ? <img src={a.icon} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" loading="lazy" />
        : <div className="w-7 h-7 rounded-lg bg-bg-tertiary shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-text-primary truncate" dir="auto">{a.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.side ? (isBuy ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss') : 'bg-bg-tertiary text-text-muted'}`}>{label}</span>
          {a.outcome && <span className="text-[10px] text-text-muted">{a.outcome}</span>}
          <span className="text-[10px] text-text-muted num-mono">· {timeAgoEn(a.timestamp)}</span>
        </div>
      </div>
      <div className="text-left shrink-0">
        <div className="text-xs font-bold num-mono text-text-primary">{fmtUsd(a.usdcSize)}</div>
        <div className="text-[10px] num-mono text-text-muted">{Math.round(a.price * 100)}¢</div>
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
  const [tab, setTab] = useState('positions');
  const [analystOpen, setAnalystOpen] = useState(false);

  const row = state?.row || null;
  const { positions, loading, error } = useWalletPositions(address, 500);
  // History loads lazily — only when the tab is opened.
  const { activity, loading: actLoading, error: actError } = useWalletActivity(address, { limit: 100, enabled: tab === 'history' });

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
      <button onClick={() => navigate(state?.from || '/polymarket')} className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-3 cursor-pointer">
        <ArrowRight className="w-4 h-4" /> חזרה לדירוג
      </button>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-accent-primary/20 p-4 mb-4" style={{ background: 'var(--pm-hero-bg)' }}>
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-accent-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          {row?.profileImage
            ? <img src={row.profileImage} alt="" className="w-12 h-12 rounded-full object-cover" loading="lazy" />
            : <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center"><Wallet className="w-5 h-5 text-accent-primary" /></div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold truncate" dir="auto" style={{ color: 'var(--pm-hero-fg)' }}>{name}</span>
              {row?.verified && <ShieldCheck className="w-4 h-4 text-accent-primary shrink-0" />}
            </div>
            <span className="text-[11px] num-mono" dir="ltr" style={{ color: 'var(--pm-hero-fg-faint)' }}>{shortWallet(address)}</span>
          </div>
          {row?.smartScore != null && <ScoreRing score={row.smartScore} size="xl" />}
        </div>
        <div className="relative flex items-center justify-between gap-2 mt-3 flex-wrap">
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent-primary hover:text-accent-hover transition-colors">
              פרופיל מלא ב-Polymarket <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {/* "האנליסט הפרטי" — AI read of this wallet's public book */}
          <button onClick={() => setAnalystOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent-primary text-bg-primary text-xs font-bold hover:bg-accent-hover transition-colors cursor-pointer">
            <BrainCircuit className="w-3.5 h-3.5" /> נתח ארנק (AI)
          </button>
        </div>
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

      {/* Tabs: positions | history */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="inline-flex bg-bg-secondary border border-border-primary rounded-lg p-0.5 gap-0.5">
          <button onClick={() => setTab('positions')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${tab === 'positions' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>
            פוזיציות {positions.length > 0 && `(${positions.length})`}
          </button>
          <button onClick={() => setTab('history')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${tab === 'history' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>
            <Clock className="w-3.5 h-3.5" /> היסטוריה
          </button>
        </div>
        {tab === 'positions' && positions.length > 1 && (
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

      {/* Positions tab */}
      {tab === 'positions' && (
        loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-bg-secondary animate-pulse" />)}</div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-loss"><AlertCircle className="w-4 h-4" />{error}</div>
        ) : positions.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-muted">אין פוזיציות פתוחות כרגע</div>
        ) : (
          <div className="space-y-2">
            {sorted.map((p) => <PositionCard key={`${p.conditionId}-${p.outcome}`} p={p} />)}
          </div>
        )
      )}

      {/* History tab */}
      {tab === 'history' && (
        actLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-bg-secondary animate-pulse" />)}</div>
        ) : actError ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-loss"><AlertCircle className="w-4 h-4" />{actError}</div>
        ) : activity.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-muted">אין היסטוריית מסחר</div>
        ) : (
          <div className="space-y-2">
            {activity.map((a, i) => <ActivityRow key={`${a.id}-${i}`} a={a} />)}
          </div>
        )
      )}

      <WalletAnalystModal isOpen={analystOpen} onClose={() => setAnalystOpen(false)} row={row} positions={positions} split={split} />
    </motion.div>
  );
}
