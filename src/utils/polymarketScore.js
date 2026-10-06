// Smart-money scoring — the whole value of the radar is here, not in the raw feed.
//
// MVP scope: the leaderboard only exposes PnL + volume, so we score on what
// separates skill from churn *today* — ROI efficiency (PnL per $ traded) blended
// with absolute PnL, gated by an eligibility floor. The FULL score
// (win_rate × consistency × hold_quality) needs per-wallet resolved-market
// history and time-series snapshots — that arrives with server ingestion
// (phase 2). Everything here is a pure function so it's trivial to extend.
import { POLYMARKET as C } from '../config/polymarket';
import { LRM } from './formatters';

/** ROI as a percentage: PnL per dollar of volume. The luck-vs-skill separator. */
export function roiPct(w) {
  return w.volume > 0 ? (w.pnl / w.volume) * 100 : 0;
}

/** Enough skin in the game to be worth scoring (not a lucky one-off). */
export function isEligible(w) {
  return w.volume >= C.MIN_VOLUME && w.pnl > 0;
}

/**
 * Attach a preliminary 0–100 "smart score" to each row, normalized within the
 * fetched cohort. Blends absolute PnL (50%) with ROI efficiency (50%) so a
 * high-volume / low-PnL churner ranks below an efficient winner — the spec's
 * core principle. Ineligible wallets get score = null (shown but not ranked).
 */
export function scoreLeaderboard(rows) {
  const eligible = rows.filter(isEligible);
  if (eligible.length === 0) return rows.map((w) => ({ ...w, roi: roiPct(w), eligible: false, smartScore: null }));

  const maxPnl = Math.max(...eligible.map((w) => w.pnl), 1);
  const rois = eligible.map(roiPct);
  const maxRoi = Math.max(...rois);
  const minRoi = Math.min(...rois);
  const roiSpan = maxRoi - minRoi || 1;

  return rows.map((w) => {
    const roi = roiPct(w);
    const elig = isEligible(w);
    if (!elig) return { ...w, roi, eligible: false, smartScore: null, sizeShare: 0, effShare: 0 };
    const pnlN = Math.max(0, w.pnl) / maxPnl;          // 0..1 — size component
    const roiN = (roi - minRoi) / roiSpan;             // 0..1 — efficiency component
    const smartScore = Math.round((pnlN * 0.5 + roiN * 0.5) * 100);
    // Expose the two halves so the UI can show WHY a wallet ranks (big vs efficient).
    return { ...w, roi, eligible: true, smartScore, sizeShare: pnlN, effShare: roiN };
  });
}

/** Tier label from a wallet's rank (Core / Extended / Discovery). */
export function tierOf(rank) {
  if (!rank) return null;
  if (rank <= C.TIER1_TOP) return 'core';
  if (rank <= C.TIER2_TOP) return 'extended';
  return 'discovery';
}

/**
 * Conviction = each position's share of the wallet's live portfolio value.
 * A 40%-of-book position is a strong signal; a 2% dust position is noise.
 */
export function withConviction(positions) {
  const total = positions.reduce((s, p) => s + Math.max(0, p.currentValue), 0) || 1;
  return positions
    .map((p) => ({ ...p, conviction: Math.max(0, p.currentValue) / total }))
    .sort((a, b) => b.currentValue - a.currentValue);
}

/** Split a wallet's positions into realized vs unrealized PnL (different risk). */
export function pnlSplit(positions) {
  let realized = 0;
  let unrealized = 0;
  for (const p of positions) {
    realized += p.realizedPnl || 0;
    unrealized += (p.cashPnl || 0) - (p.realizedPnl || 0);
  }
  return { realized, unrealized, total: realized + unrealized };
}

// ── formatting helpers (shared by the page + the modal) ──

export function fmtUsd(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

export function fmtPct(n, digits = 1) {
  const v = Number(n) || 0;
  const sign = `${LRM}${v >= 0 ? '+' : '-'}`;
  const a = Math.abs(v);
  // ROI here reaches five digits (a +94,581% wallet is real), which overflowed
  // the stat tiles — abbreviate the big ones the same way money is abbreviated.
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)}M%`;
  if (a >= 10_000) return `${sign}${(a / 1_000).toFixed(1)}K%`;
  if (a >= 1_000) return `${sign}${Math.round(a)}%`;
  return `${sign}${a.toFixed(digits)}%`;
}

export function shortWallet(w) {
  return w ? `${w.slice(0, 6)}…${w.slice(-4)}` : '';
}
