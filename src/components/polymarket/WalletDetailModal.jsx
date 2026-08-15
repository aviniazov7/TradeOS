import { ExternalLink, TrendingUp, ShieldCheck, AlertCircle } from 'lucide-react';
import Modal from '../shared/Modal';
import ScoreRing from './ScoreRing';
import { useWalletPositions } from '../../hooks/useWalletPositions';
import { pnlSplit, fmtUsd, fmtPct, shortWallet } from '../../utils/polymarketScore';
import { profileUrl } from '../../services/polymarketService';

function Metric({ label, value, tone }) {
  const color = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-text-primary';
  return (
    <div className="bg-bg-tertiary/50 rounded-lg px-3 py-2 min-w-0">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className={`text-sm font-extrabold num-mono mt-0.5 truncate ${color}`}>{value}</div>
    </div>
  );
}

function PositionRow({ p }) {
  const up = (p.cashPnl || 0) >= 0;
  const convPct = Math.round((p.conviction || 0) * 100);
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary">
      {p.icon
        ? <img src={p.icon} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" loading="lazy" />
        : <div className="w-7 h-7 rounded-lg bg-bg-tertiary shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-text-primary truncate">{p.title}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.outcome === 'Yes' ? 'bg-profit/10 text-profit' : p.outcome === 'No' ? 'bg-loss/10 text-loss' : 'bg-bg-tertiary text-text-muted'}`}>
            {p.outcome}
          </span>
          <div className="flex items-center gap-1 min-w-0 flex-1" title={`conviction — ${convPct}% מהתיק`}>
            <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden flex-1 max-w-[90px]">
              <div className="h-full rounded-full bg-accent-primary" style={{ width: `${convPct}%` }} />
            </div>
            <span className="text-[10px] text-text-muted num-mono shrink-0">{convPct}%</span>
          </div>
        </div>
      </div>
      <div className="text-left shrink-0">
        <div className="text-xs font-bold num-mono text-text-primary">{fmtUsd(p.currentValue)}</div>
        <div className={`text-[10px] font-semibold num-mono ${up ? 'text-profit' : 'text-loss'}`}>
          {fmtUsd(p.cashPnl)} · {fmtPct(p.percentPnl * 100)}
        </div>
      </div>
    </div>
  );
}

// Wallet drill-down: the smart-money wallet's live book — realized vs unrealized
// PnL and every position sized by conviction. Read-only.
export default function WalletDetailModal({ walletRow, isOpen, onClose }) {
  const { positions, loading, error } = useWalletPositions(isOpen && walletRow ? walletRow.wallet : null);
  if (!walletRow) return null;

  const split = pnlSplit(positions);
  const mag = Math.abs(split.realized) + Math.abs(split.unrealized) || 1;
  const realizedShare = (Math.abs(split.realized) / mag) * 100;
  const unrealizedShare = (Math.abs(split.unrealized) / mag) * 100;
  const title = walletRow.name || shortWallet(walletRow.wallet);
  const link = profileUrl(walletRow.wallet);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`ארנק · ${title}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {walletRow.profileImage
            ? <img src={walletRow.profileImage} alt="" className="w-9 h-9 rounded-full object-cover" loading="lazy" />
            : <div className="w-9 h-9 rounded-full bg-bg-tertiary" />}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-text-primary truncate">{title}</span>
              {walletRow.verified && <ShieldCheck className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
            </div>
            <span className="text-[11px] text-text-muted num-mono" dir="ltr">{shortWallet(walletRow.wallet)}</span>
          </div>
          <div className="ms-auto"><ScoreRing score={walletRow.smartScore} size="lg" /></div>
        </div>

        {/* Wallet-level metrics (30d, from the leaderboard) */}
        <div className="grid grid-cols-3 gap-2">
          <Metric label="PnL (30 יום)" value={fmtUsd(walletRow.pnl)} tone={walletRow.pnl >= 0 ? 'profit' : 'loss'} />
          <Metric label="ROI" value={fmtPct(walletRow.roi)} tone={walletRow.roi >= 0 ? 'profit' : 'loss'} />
          <Metric label="מחזור" value={fmtUsd(walletRow.volume)} />
        </div>

        {/* Realized vs unrealized — locked-in vs still-at-risk */}
        {positions.length > 0 && (
          <div className="rounded-xl bg-bg-tertiary/50 p-3">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-text-muted">ממומש</span>
              <span className={`num-mono font-bold ${split.realized >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtUsd(split.realized)}</span>
            </div>
            <div className="h-2 rounded-full bg-bg-tertiary overflow-hidden flex">
              <div className="h-full bg-profit" style={{ width: `${realizedShare}%` }} />
              <div className="h-full bg-profit/35" style={{ width: `${unrealizedShare}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] mt-1.5">
              <span className="text-text-muted">לא-ממומש (בסיכון)</span>
              <span className={`num-mono font-bold ${split.unrealized >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtUsd(split.unrealized)}</span>
            </div>
          </div>
        )}

        {/* Positions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-primary">פוזיציות פתוחות {positions.length > 0 && `(${positions.length})`}</span>
          </div>

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-bg-secondary animate-pulse" />)}</div>
          ) : error ? (
            <div className="py-6 text-center text-sm text-loss flex items-center justify-center gap-1.5"><AlertCircle className="w-4 h-4" />{error}</div>
          ) : positions.length === 0 ? (
            <div className="py-6 text-center text-sm text-text-muted">אין פוזיציות פתוחות כרגע</div>
          ) : (
            <div className="space-y-2 max-h-[42vh] overflow-y-auto pe-1">
              {positions.map((p) => <PositionRow key={`${p.conditionId}-${p.outcome}`} p={p} />)}
            </div>
          )}
        </div>

        {/* Profile link */}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-bg-tertiary/60 text-sm font-semibold text-text-secondary hover:text-accent-primary transition-colors">
            <TrendingUp className="w-4 h-4" /> פרופיל מלא ב-Polymarket <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </Modal>
  );
}
