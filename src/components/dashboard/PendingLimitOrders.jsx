import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Pencil, Check, X, ChevronRight, Plus, Minus } from 'lucide-react';

/* TradingView icon — real favicon fetched via Google's favicon service */
function TvIcon({ className = 'w-4 h-4' }) {
  return (
    <img
      src="https://www.google.com/s2/favicons?domain=tradingview.com&sz=32"
      className={className}
      style={{ borderRadius: 3 }}
      alt="TradingView"
    />
  );
}
import { arrayUnion } from 'firebase/firestore';
import toast from 'react-hot-toast';
import CoinIcon from '../shared/CoinIcon';
import { useJournalContext } from '../../contexts/JournalContext';
import { useAuth } from '../../contexts/AuthContext';
import { updateUserDocument } from '../../services/firestoreService';

function fmt(price) {
  if (!price && price !== 0) return '';
  const n = parseFloat(price);
  if (!isFinite(n)) return '';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(3);
}

function TrackBar({ trade, currentPrice, tpReached = [], onTpReached, onLimitTriggered, onSLHit, onUpdateSL, isActive, previewSL, rrBadge, timeSince, isEditMode, suppressBE = false }) {
  const { entryPrice, stopLoss, direction, tps = [], leverage = 1, positionSize } = trade;
  const entry = parseFloat(entryPrice);
  const sl = parseFloat(stopLoss);
  if (!entry || !sl) return null;

  const isLong = direction === 'long';

  const [flashingTps, setFlashingTps] = useState(new Set());
  const flashedRef = useRef(new Set());

  const executedExits = (trade.exits || [])
    .map(e => ({ price: parseFloat(e.price), percent: parseFloat(e.percent) }))
    .filter(e => e.price > 0);

  const plannedTps = (tps || []).map(p => parseFloat(p)).filter(p => p > 0);
  const tpPrices = [...executedExits.map(e => e.price), ...plannedTps];

  const limitFiredRef = useRef(false);
  const isLimitTriggered = trade.limitTriggered ||
    (trade.orderType === 'limit' && currentPrice != null &&
      (isLong ? currentPrice <= entry : currentPrice >= entry));

  const isMarketActive = trade.orderType !== 'limit' || isLimitTriggered;

  // Limit trigger side-effect — only in useEffect, never during render
  useEffect(() => {
    if (isLimitTriggered && !trade.limitTriggered && !limitFiredRef.current) {
      limitFiredRef.current = true;
      onLimitTriggered?.();
    }
  }, [isLimitTriggered, trade.limitTriggered, onLimitTriggered]);

  const slFiredRef = useRef(false);
  const slChangedAtRef = useRef(Date.now()); // start with NOW so cooldown is active on mount
  const prevSlRef = useRef(sl);

  // Reset cooldown whenever SL value changes
  useEffect(() => {
    if (prevSlRef.current !== sl) {
      prevSlRef.current = sl;
      slChangedAtRef.current = Date.now();
      slFiredRef.current = false;
    }
  }, [sl]);

  const SL_COOLDOWN = 6000;

  // SL hit detection — useEffect only, never during render
  useEffect(() => {
    if (trade.status === 'closed' || !isMarketActive || currentPrice == null) return;
    if (slFiredRef.current) return;
    if (Date.now() - slChangedAtRef.current < SL_COOLDOWN) return;
    const hit = isLong ? currentPrice <= sl : currentPrice >= sl;
    if (hit) {
      slFiredRef.current = true;
      onSLHit?.();
    }
  }, [currentPrice, isMarketActive, sl, isLong, trade.status, onSLHit]);


  // Pure check — safe to call during render (no side-effects)
  const isTpReached = (tp, idx) => {
    if (tpReached.includes(idx)) return true;
    return currentPrice != null && (isLong ? currentPrice >= tp : currentPrice <= tp);
  };

  // Side-effects (Firestore writes + flash animation) live in useEffect only
  useEffect(() => {
    if (!isMarketActive || currentPrice == null || trade.status === 'closed') return;
    plannedTps.forEach((tp, i) => {
      const tpIdx = executedExits.length + i;
      if (tpReached.includes(tpIdx)) return;
      const reached = isLong ? currentPrice >= tp : currentPrice <= tp;
      if (!reached) return;
      const isLast = tpIdx === tpPrices.length - 1;
      onTpReached?.(tpIdx, isLast);
      if (!flashedRef.current.has(tpIdx)) {
        flashedRef.current.add(tpIdx);
        setFlashingTps(prev => new Set([...prev, tpIdx]));
        setTimeout(() => setFlashingTps(prev => {
          const next = new Set(prev);
          next.delete(tpIdx);
          return next;
        }), 1200);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, isMarketActive, trade.status]);

  const furthestTp = tpPrices.length > 0
    ? (isLong ? Math.max(...tpPrices) : Math.min(...tpPrices))
    : null;
  const rightAnchor = furthestTp ?? (isLong
    ? entry + (entry - sl) * 2
    : entry - (sl - entry) * 2);

  if (isLong && rightAnchor <= sl) return null;
  if (!isLong && rightAnchor >= sl) return null;

  // Fixed-entry scale: entry is always at 25% — track never jumps when SL changes
  const entryPct = 25;
  const fixedRange = Math.abs(rightAnchor - entry);
  const toFixedScale = (p) => {
    if (!fixedRange) return entryPct;
    const offset = isLong ? (p - entry) : (entry - p);
    return entryPct + (offset / fixedRange) * (100 - entryPct);
  };
  const tpPcts = tpPrices.map(tp => Math.max(entryPct + 1, Math.min(100, toFixedScale(tp))));

  // Risk (SL→entry distance) — used for loss-zone & preview badge positioning only
  const risk = isLong ? (entry - sl) : (sl - entry);

  // Current price: loss zone (0→25%) uses SL ratio; profit zone uses fixed scale
  const currentVisual = currentPrice != null ? (() => {
    const inLoss = isLong ? currentPrice < entry : currentPrice > entry;
    if (inLoss && risk > 0) {
      const dist = isLong ? (entry - currentPrice) : (currentPrice - entry);
      return Math.max(0, Math.min(entryPct - 1, entryPct * (1 - dist / risk)));
    }
    return Math.max(0, Math.min(100, toFixedScale(currentPrice)));
  })() : null;

  let pnlPct = null;
  let pnlDollar = null;
  if (isMarketActive && currentPrice > 0 && entry > 0) {
    const lev = parseFloat(leverage) || 1;
    pnlPct = isLong
      ? ((currentPrice - entry) / entry) * lev * 100
      : ((entry - currentPrice) / entry) * lev * 100;
    const parsedSize = parseFloat(positionSize);
    if (parsedSize > 0) {
      const executedPct = executedExits.reduce((s, e) => s + e.percent, 0);
      const remainingFraction = Math.max(0, 1 - executedPct / 100);
      const qty = (parsedSize * remainingFraction) / entry;
      pnlDollar = isLong ? (currentPrice - entry) * qty : (entry - currentPrice) * qty;
    }
  }

  const isProfit = pnlPct != null && pnlPct > 0;
  const isLoss = pnlPct != null && pnlPct < 0;

  // Pending limit order — dimmed grey track
  if (!isActive) {
    return (
      <div dir="ltr" className="mt-3 opacity-50">
        <div className="relative h-1 rounded-full bg-text-muted/15">
          <div className="absolute top-0 bottom-0 bg-text-muted/20 rounded-full"
            style={{ left: '0%', width: `${entryPct}%` }} />
          {tpPrices.length > 0 && (
            <div className="absolute top-0 bottom-0 bg-text-muted/10 rounded-full"
              style={{ left: `${entryPct}%`, width: `${Math.max(0, 100 - entryPct)}%` }} />
          )}
          <div className="absolute top-1/2 w-2 h-2 rounded-full bg-text-muted/50 border border-bg-secondary"
            style={{ left: 0, transform: 'translateY(-50%)' }} />
          <div className="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-text-muted/30 bg-text-muted/20"
            style={{ left: `${entryPct}%`, transform: 'translate(-50%, -50%)' }} />
          {tpPcts.map((pct, i) => {
            const isLast = i === tpPcts.length - 1;
            return (
              <div key={i} className="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-text-muted/20 bg-text-muted/10"
                style={isLast
                  ? { right: 0, transform: 'translateY(-50%)' }
                  : { left: `${pct}%`, transform: 'translate(-50%, -50%)' }
                } />
            );
          })}
        </div>
        <div className="relative mt-2 h-6">
          <div className="absolute flex flex-col items-center text-text-muted/50" style={{ left: 0, transform: 'translateX(-50%)', top: 0 }}>
            <span className="text-[9px] font-semibold leading-none">SL</span>
            <span className="text-[9px] leading-none mt-0.5">{fmt(sl)}</span>
          </div>
          <div className="absolute flex flex-col items-center text-text-muted/50"
            style={{ left: `${entryPct}%`, transform: 'translateX(-50%)', top: 0 }}>
            <span className="text-[9px] font-semibold leading-none">Entry</span>
            <span className="text-[9px] leading-none mt-0.5">{fmt(entry)}</span>
          </div>
          {tpPrices.map((tp, i) => {
            const isLast = i === tpPrices.length - 1;
            return (
              <div key={i} className={`absolute flex flex-col items-center text-text-muted/40 ${isLast ? 'items-end' : ''}`}
                style={isLast ? { right: 0, top: 0 } : { left: `${tpPcts[i]}%`, transform: 'translateX(-50%)', top: 0 }}>
                <span className="text-[9px] font-semibold leading-none">TP{i + 1}</span>
                <span className="text-[9px] leading-none mt-0.5">{fmt(tp)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/5">
          <span className="text-[10px] text-text-muted/50">Waiting for entry at</span>
          <span className="text-[10px] font-mono font-semibold text-text-muted/70">{fmt(entry)}</span>
          {currentPrice && (
            <span className="text-[10px] text-text-muted/40 ml-auto">Current {fmt(currentPrice)}</span>
          )}
        </div>
      </div>
    );
  }

  // Active trade — full colored track
  // suppressBE: freeze BE detection for 3s after save so track doesn't change
  const isBreakEven = !suppressBE && entry > 0 && sl > 0 && Math.abs(sl - entry) / entry < 0.002;
  const hasPreview = previewSL > 0 && Math.abs(previewSL - sl) > 0.000001;
  // Preview badge position on fixed-entry scale (loss zone = 0-25%)
  const rawPreviewPct = hasPreview && risk > 0 ? (() => {
    const newDist = isLong ? (entry - previewSL) : (previewSL - entry);
    return entryPct * (1 - newDist / risk);
  })() : 0;
  const badgeLeft = hasPreview ? Math.max(0, Math.min(82, rawPreviewPct)) : 0;
  const badgeOffLeft = hasPreview && rawPreviewPct < 0;

  return (
    <div dir="ltr" className="mt-3">
      <div className="relative h-1 rounded-full bg-bg-tertiary">
        {/* Loss zone (SL → Entry) — hidden in BE mode */}
        {!isBreakEven && (
          <div className="absolute top-0 bottom-0 bg-loss/40 rounded-full"
            style={{ left: '0%', width: `${entryPct}%`, transition: 'width 0.45s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
        )}
        {tpPrices.length > 0 && (
          <div className="absolute top-0 bottom-0 bg-profit/40 rounded-full"
            style={{ left: isBreakEven ? '0%' : `${entryPct}%`, width: `${Math.max(0, 100 - (isBreakEven ? 0 : entryPct))}%`, transition: 'left 0.45s cubic-bezier(0.25,0.46,0.45,0.94), width 0.45s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
        )}

        {/* SL dot — hidden in BE mode (entry dot replaces it) */}
        {!isBreakEven && (
          <div className="absolute top-1/2 w-2 h-2 rounded-full bg-loss border border-bg-secondary"
            style={{ left: 0, transform: 'translateY(-50%)' }} />
        )}

        {/* Entry dot / BE dot */}
        <div
          className={`absolute top-1/2 rounded-full border border-bg-secondary flex items-center justify-center ${
            isBreakEven
              ? 'w-3 h-3 bg-accent-primary shadow-[0_0_8px_3px_rgba(100,200,255,0.5)]'
              : 'w-2.5 h-2.5 bg-profit shadow-[0_0_6px_2px_rgba(34,197,94,0.4)]'
          }`}
          style={{ left: isBreakEven ? 0 : `${entryPct}%`, transform: isBreakEven ? 'translateY(-50%)' : 'translate(-50%, -50%)', transition: 'left 0.45s cubic-bezier(0.25,0.46,0.45,0.94)' }}
        >
          {!isBreakEven && <span className="text-[6px] text-white font-black leading-none select-none">✓</span>}
        </div>

        {executedExits.map((exit, i) => {
          const tpIdx = i;
          const pct = tpPcts[tpIdx];
          const isLast = tpIdx === tpPrices.length - 1;
          return (
            <div key={`ex-${i}`}
              className="absolute top-1/2 w-3 h-3 rounded-full bg-profit border-2 border-bg-secondary shadow-[0_0_8px_3px_rgba(34,197,94,0.6)]"
              style={isLast
                ? { right: 0, transform: 'translateY(-50%)' }
                : { left: `${pct}%`, transform: 'translate(-50%, -50%)' }
              }
            />
          );
        })}

        {plannedTps.map((tp, i) => {
          const tpIdx = executedExits.length + i;
          const pct = tpPcts[tpIdx];
          const isLast = tpIdx === tpPrices.length - 1;
          const reached = isTpReached(tp, tpIdx);
          const isFlashing = flashingTps.has(tpIdx);
          return (
            <div key={`pl-${i}`}
              className="absolute top-1/2"
              style={isLast
                ? { right: 0, transform: 'translateY(-50%)', transition: 'right 0.45s cubic-bezier(0.25,0.46,0.45,0.94)' }
                : { left: `${pct}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.45s cubic-bezier(0.25,0.46,0.45,0.94)' }
              }
            >
              {reached && isFlashing && (
                <div className="absolute w-5 h-5 rounded-full bg-profit animate-ping opacity-70"
                  style={{ top: '-5px', left: '-5px' }} />
              )}
              <div className={`w-2.5 h-2.5 rounded-full border-2 border-bg-secondary transition-all duration-500 ${
                reached
                  ? 'bg-profit shadow-[0_0_6px_2px_rgba(34,197,94,0.5)]'
                  : 'bg-text-muted/30'
              }`} />
            </div>
          );
        })}

        {/* ── New SL preview dot — stays inside track bounds, no clipping ── */}
        {hasPreview && (
          <div
            className="absolute top-1/2"
            style={{
              left: `${Math.max(2, Math.min(98, rawPreviewPct))}%`,
              transform: 'translate(-50%, -50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              border: '2px solid #ef4444',
              background: 'rgba(239,68,68,0.25)',
              boxShadow: '0 0 8px 4px rgba(239,68,68,0.55)',
              zIndex: 15,
            }}
          />
        )}

        {currentVisual != null && (
          <div
            className="absolute z-20"
            style={{
              left: `${currentVisual}%`,
              top: '50%',
              width: 0,
              height: 0,
              transition: 'left 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            <div className="absolute w-5 h-5 rounded-full bg-white/20 animate-ping"
              style={{ top: '-10px', left: '-10px' }} />
            <div className="absolute w-3 h-3 rounded-full bg-white shadow-[0_0_10px_4px_rgba(255,255,255,0.55)]"
              style={{ top: '-6px', left: '-6px' }} />
          </div>
        )}
        </div>{/* end track */}

      {/* ── New SL badge: paddingLeft trick — correct x-position, no z-index issues ── */}
      {hasPreview && (
        <div
          dir="ltr"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            marginTop: 5,
            paddingLeft: `${Math.max(0, Math.min(82, rawPreviewPct))}%`,
          }}
        >
          <div style={{
            transform: rawPreviewPct < 4 ? 'translateX(0)' : rawPreviewPct > 80 ? 'translateX(-100%)' : 'translateX(-50%)',
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            padding: '4px 10px',
            borderRadius: 999,
            letterSpacing: '0.04em',
            boxShadow: '0 0 18px 6px rgba(239,68,68,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 8 }}>▼</span>
            <span>New SL · {fmt(previewSL)}</span>
          </div>
        </div>
      )}

      <div className="relative mt-2 h-8">

        {isBreakEven ? (
          /* Break Even mode: single combined label */
          <div className="absolute flex flex-col items-start text-accent-primary" style={{ left: 0, top: 0 }}>
            <span className="text-[9px] font-bold leading-none whitespace-nowrap">BE</span>
            <span className="text-[9px] leading-none whitespace-nowrap mt-0.5 opacity-70">{fmt(entry)}</span>
          </div>
        ) : (
          <>
            {/* SL label */}
            <div className="absolute flex flex-col items-center text-loss" style={{ left: 0, transform: 'translateX(-50%)', top: 0 }}>
              <span className="text-[9px] font-semibold leading-none">SL</span>
              <span className="text-[9px] leading-none mt-0.5 opacity-70">{fmt(sl)}</span>
            </div>
            {/* Entry label */}
            <div className="absolute flex flex-col items-center text-profit"
              style={{ left: `${entryPct}%`, transform: 'translateX(-50%)', top: 0, transition: 'left 0.45s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
              <span className="text-[9px] font-semibold leading-none whitespace-nowrap">Entry</span>
              <span className="text-[9px] leading-none whitespace-nowrap mt-0.5 opacity-70">{fmt(entry)}</span>
            </div>
          </>
        )}

        {executedExits.map((exit, i) => {
          const tpIdx = i;
          const isLast = tpIdx === tpPrices.length - 1;
          return (
            <div key={`exl-${i}`}
              className={`absolute flex flex-col text-profit ${isLast ? 'items-end' : 'items-center'}`}
              style={isLast
                ? { right: 0, top: 0 }
                : { left: `${tpPcts[tpIdx]}%`, transform: 'translateX(-50%)', top: 0 }
              }>
              <span className="text-[9px] font-semibold leading-none whitespace-nowrap">✓ TP{tpIdx + 1}</span>
              <span className="text-[9px] leading-none whitespace-nowrap mt-0.5 opacity-80">{fmt(exit.price)}</span>
              <span className="text-[9px] font-bold leading-none whitespace-nowrap mt-0.5 bg-profit/20 px-1 rounded">{exit.percent}%</span>
            </div>
          );
        })}

        {plannedTps.map((tp, i) => {
          const tpIdx = executedExits.length + i;
          const isLast = tpIdx === tpPrices.length - 1;
          const reached = isTpReached(tp, tpIdx);
          return (
            <div key={`pll-${i}`}
              className={`absolute flex flex-col transition-colors duration-500 ${isLast ? 'items-end' : 'items-center'} ${reached ? 'text-profit' : 'text-text-muted/50'}`}
              style={isLast
                ? { right: 0, top: 0, transition: 'right 0.45s cubic-bezier(0.25,0.46,0.45,0.94)' }
                : { left: `${tpPcts[tpIdx]}%`, transform: 'translateX(-50%)', top: 0, transition: 'left 0.45s cubic-bezier(0.25,0.46,0.45,0.94)' }
              }>
              <span className="text-[9px] font-semibold leading-none whitespace-nowrap">
                {reached ? '✓ ' : ''}TP{tpIdx + 1}
              </span>
              <span className="text-[9px] leading-none whitespace-nowrap mt-0.5 opacity-80">{fmt(tp)}</span>
            </div>
          );
        })}
      </div>

      {(pnlPct !== null || currentPrice || timeSince || rrBadge) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5 flex-wrap" dir="ltr">
          {pnlPct !== null && (
            <span className={`text-xs font-bold font-mono ${isProfit ? 'text-profit' : isLoss ? 'text-loss' : 'text-text-muted'}`}>
              {pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(2)}%
            </span>
          )}
          {pnlDollar !== null && (
            <span className={`text-[10px] font-semibold font-mono ${pnlDollar > 0 ? 'text-profit/80' : 'text-loss/80'}`}>
              {pnlDollar > 0 ? '+' : ''}${Math.abs(pnlDollar).toFixed(2)}
            </span>
          )}
          {timeSince && (
            <>
              <span className="text-text-muted/25 text-[10px]">·</span>
              <div className="flex items-center gap-1 text-[10px] text-text-muted/60">
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
                {timeSince}
              </div>
            </>
          )}
          {rrBadge && (
            <>
              <span className="text-text-muted/25 text-[10px]">·</span>
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-text-muted/50">R:R</span>
                <span className="font-bold text-text-primary">{rrBadge}</span>
              </div>
            </>
          )}
          {parseFloat(leverage) > 1 && (
            <>
              <span className="text-text-muted/25 text-[10px]">·</span>
              <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-primary/40">
                {leverage}x
              </span>
            </>
          )}
          {currentPrice && (
            <span className="text-[10px] text-text-muted ml-auto">
              Current {fmt(currentPrice)}
            </span>
          )}
        </div>
      )}

    </div>
  );
}

function getTimeSince(trade) {
  const raw = trade.entryDate || trade.createdAt;
  if (!raw) return null;
  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function getStep(price) {
  if (price >= 10000) return 1;
  if (price >= 1000) return 0.5;
  if (price >= 10) return 0.01;
  if (price >= 1) return 0.001;
  return 0.0001;
}

export default function PendingLimitOrders({ trades, livePrices }) {
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editSL, setEditSL] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedFlash, setSavedFlash] = useState({}); // { [tradeId]: price } — persists 2s after save
  const navigate = useNavigate();
  const { setActiveJournalId } = useJournalContext();
  const { user } = useAuth();

  const workerUrl = import.meta.env.VITE_WORKER_URL || '';

  const sendNotification = useCallback((type, trade, price, pnlDollar = null, extra = {}) => {
    if (!user?.uid || !workerUrl) return;
    fetch(`${workerUrl}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: user.uid,
        type,
        pair: trade.pair || trade.symbol,
        direction: trade.direction,
        price,
        pnl: pnlDollar,
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
        leverage: trade.leverage,
        positionSize: trade.positionSize,
        tps: trade.tps || [],
        ...extra,
      }),
    }).catch(() => {});
  }, [user?.uid, workerUrl]);

  const handleTpReached = useCallback((trade, tpIdx, currentPrice, isLastTp) => {
    if (!user?.uid) return;
    const pnl = (() => {
      const entry = parseFloat(trade.entryPrice);
      const posSize = parseFloat(trade.positionSize);
      if (!currentPrice || !entry || !posSize) return null;
      const qty = posSize / entry;
      return trade.direction === 'long' ? (currentPrice - entry) * qty : (entry - currentPrice) * qty;
    })();
    const updates = { tpReached: arrayUnion(tpIdx) };
    if (isLastTp) {
      updates.status = 'closed';
      updates.exitPrice = parseFloat(currentPrice);
      updates.result = pnl >= 0 ? 'win' : 'loss';
      if (pnl !== null) updates.netPnl = pnl;
    }
    updateUserDocument(user.uid, 'trades', trade.id, updates).catch(() => {});
    sendNotification('tp', trade, currentPrice, pnl, { tpIndex: tpIdx, isLastTp });
  }, [user?.uid, sendNotification]);

  const handleLimitTriggered = useCallback((trade, currentPrice) => {
    if (!user?.uid) return;
    updateUserDocument(user.uid, 'trades', trade.id, {
      limitTriggered: true,
      orderType: 'market',
      status: 'open',
    }).catch(() => {});
    sendNotification('entry', trade, currentPrice);
  }, [user?.uid, sendNotification]);

  const handleUpdateSL = useCallback((trade, newSL) => {
    if (!user?.uid || !newSL || isNaN(newSL)) return;
    updateUserDocument(user.uid, 'trades', trade.id, { stopLoss: String(newSL) }).catch(() => {});
  }, [user?.uid]);

  const handleSaveSL = useCallback(async (trade, newSLVal) => {
    const n = parseFloat(newSLVal);
    if (!user?.uid || !n || isNaN(n) || n <= 0) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateUserDocument(user.uid, 'trades', trade.id, { stopLoss: n });
      toast.success(`SL עודכן ל-${fmt(n)} ✓`, {
        style: { background: '#141414', color: '#f0f0f0', border: '1px solid rgba(34,197,94,0.35)', borderRadius: '8px', fontSize: '13px' },
        duration: 2500,
      });
      // Flash badge for 2 seconds after save — independent of Firestore/hasPreview
      setSavedFlash(v => ({ ...v, [trade.id]: n }));
      setTimeout(() => setSavedFlash(v => { const x = { ...v }; delete x[trade.id]; return x; }), 3000);
      setEditingId(null);
      setEditSL('');
    } catch {
      setSaveError('שגיאה בשמירה, נסה שוב');
    } finally {
      setIsSaving(false);
    }
  }, [user?.uid]);

  const handleSLHit = useCallback((trade, currentPrice) => {
    if (!user?.uid) return;
    const entry = parseFloat(trade.entryPrice);
    const posSize = parseFloat(trade.positionSize);
    let pnl = null;
    if (currentPrice && entry && posSize) {
      const qty = posSize / entry;
      pnl = trade.direction === 'long' ? (currentPrice - entry) * qty : (entry - currentPrice) * qty;
    }
    updateUserDocument(user.uid, 'trades', trade.id, {
      status: 'closed',
      exitPrice: parseFloat(currentPrice),
      result: 'loss',
      ...(pnl !== null ? { netPnl: pnl } : {}),
    }).catch(() => {});
    sendNotification('sl', trade, currentPrice, pnl);
  }, [user?.uid, sendNotification]);

  const openTrades = trades
    .filter(t => t.status !== 'closed')
    .filter(t => parseFloat(t.entryPrice) > 0)
    .sort((a, b) => {
      const aActive = a.orderType !== 'limit' || a.limitTriggered ? 1 : 0;
      const bActive = b.orderType !== 'limit' || b.limitTriggered ? 1 : 0;
      return bActive - aActive;
    });

  if (openTrades.length === 0) return null;

  const limitCount = openTrades.filter(t => t.orderType === 'limit' && !t.limitTriggered).length;
  const marketCount = openTrades.length - limitCount;
  const visible = showAll ? openTrades : openTrades.slice(0, 1);

  // Combined P&L + % across all active trades
  let totalPnlDollar = 0;
  let totalPositionDollar = 0;
  for (const trade of openTrades) {
    const pair = trade.pair || trade.symbol || '';
    const cp = livePrices[pair];
    const entry = parseFloat(trade.entryPrice);
    const isTradeActive = trade.orderType !== 'limit' || trade.limitTriggered;
    if (!cp || !(cp > 0) || !(entry > 0) || !isTradeActive) continue;
    const posSize = parseFloat(trade.positionSize);
    if (!(posSize > 0)) continue;
    const qty = posSize / entry;
    totalPnlDollar += trade.direction === 'long' ? (cp - entry) * qty : (entry - cp) * qty;
    totalPositionDollar += posSize;
  }
  const totalPnlPct = totalPositionDollar > 0 ? (totalPnlDollar / totalPositionDollar) * 100 : null;
  const hasPnl = totalPositionDollar > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-4 mb-4 relative overflow-hidden"
      style={{
        background: 'rgba(43,120,255,0.04)',
        border: '1px solid rgba(43,120,255,0.2)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* subtle top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-16 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(43,120,255,0.15) 0%, transparent 70%)' }} />
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">Positions</span>
            <span className="text-sm font-bold text-text-primary">{openTrades.length}</span>
          </div>
          {hasPnl && (
            <>
              <span className="text-text-muted/30 text-xs">|</span>
              <div className="flex items-center gap-1.5" dir="ltr">
                <span className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">P&L</span>
                <span className={`text-sm font-bold font-mono ${totalPnlDollar >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {totalPnlDollar >= 0 ? '+' : '−'}${Math.abs(totalPnlDollar).toFixed(2)}
                </span>
                {totalPnlPct !== null && (
                  <span className={`text-[10px] font-semibold font-mono ${totalPnlPct >= 0 ? 'text-profit/70' : 'text-loss/70'}`}>
                    · {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {marketCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-profit/10 text-profit border border-profit/20">
              <span className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse inline-block" />
              {marketCount} Active
            </span>
          )}
          {limitCount > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted border border-border-primary/50">
              {limitCount} Pending
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {visible.map((trade) => {
            const pair = trade.pair || trade.symbol || '';
            const currentPrice = livePrices[pair];
            const isLimit = trade.orderType === 'limit';
            const isTriggered = trade.limitTriggered ||
              (isLimit && currentPrice != null && parseFloat(trade.entryPrice) > 0 &&
                (trade.direction === 'long'
                  ? currentPrice <= parseFloat(trade.entryPrice)
                  : currentPrice >= parseFloat(trade.entryPrice)));
            const isTradeActive = !isLimit || isTriggered;

            // Per-card live P&L for background color
            const entry = parseFloat(trade.entryPrice);
            const posSize = parseFloat(trade.positionSize);
            let cardPnl = null;
            if (isTradeActive && currentPrice && entry > 0 && posSize > 0) {
              const qty = posSize / entry;
              cardPnl = trade.direction === 'long' ? (currentPrice - entry) * qty : (entry - currentPrice) * qty;
            }

            // Card border + bg based on P&L
            const cardStyle = cardPnl !== null && cardPnl > 0
              ? 'border-profit/30 bg-profit/5 hover:border-profit/50'
              : cardPnl !== null && cardPnl < 0
              ? 'border-loss/25 bg-loss/5 hover:border-loss/40'
              : isTradeActive
              ? 'border-accent-primary/20 bg-bg-secondary/80 hover:border-accent-primary/40'
              : 'border-border-primary/25 bg-bg-secondary/40 hover:border-border-primary/50';

            // R:R badge
            const sl = parseFloat(trade.stopLoss);
            const allTps = [
              ...(trade.exits || []).map(e => parseFloat(e.price)).filter(p => p > 0),
              ...(tps => tps.map(p => parseFloat(p)).filter(p => p > 0))(trade.tps || []),
            ];
            const firstTp = allTps[0];
            let rrBadge = null;
            if (entry > 0 && sl > 0 && firstTp > 0) {
              const risk = Math.abs(entry - sl);
              const reward = Math.abs(firstTp - entry);
              if (risk > 0) rrBadge = (reward / risk).toFixed(1) + 'R';
            }

            const isEditing = editingId === trade.id;
            const slNum = parseFloat(trade.stopLoss) || 0;
            const entryNum = parseFloat(trade.entryPrice) || 0;
            const step = getStep(slNum || entryNum);
            const newSLNum = parseFloat(editSL) || 0;
            const wouldClose = isEditing && newSLNum > 0 && currentPrice != null && (
              trade.direction === 'long' ? currentPrice <= newSLNum : currentPrice >= newSLNum
            );

            return (
              <motion.div
                key={trade.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                transition={{ duration: 0.2 }}
              >
                <div className={`w-full border rounded-xl px-3 py-2.5 transition-colors text-right ${cardStyle}`}>
                  {/* Card header — coin + direction always left, actions right */}
                  <div className="flex items-center gap-2" dir="ltr">
                    <CoinIcon pair={pair} className={`w-4 h-4 shrink-0 ${!isTradeActive ? 'opacity-50' : ''}`} />
                    <span className={`text-sm font-bold ${isTradeActive ? 'text-text-primary' : 'text-text-muted'}`}>{pair}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${trade.direction === 'long' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'} ${!isTradeActive ? 'opacity-50' : ''}`}>
                      {trade.direction === 'long' ? 'Long' : 'Short'}
                    </span>

                    <div className="flex items-center gap-1.5 ml-auto">
                      <a
                        href={`https://www.tradingview.com/chart/?symbol=BINANCE:${pair}.P`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="פתח בTradingView"
                        className="p-0.5 rounded border bg-bg-tertiary border-border-primary/40 text-text-muted hover:border-[#2962FF]/50 transition-colors"
                      >
                        <TvIcon className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => { setActiveJournalId(trade.journalId); navigate('/journal'); }}
                        className="text-text-muted hover:text-text-primary transition-colors p-0.5"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* ── Saved SL badge — 3s after save, track frozen, completely independent ── */}
                  <AnimatePresence>
                    {savedFlash[trade.id] > 0 && (
                      <motion.div
                        key={`saved-${trade.id}`}
                        initial={{ opacity: 0, scale: 0.85, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: -4 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        dir="ltr"
                        style={{ display: 'flex', marginTop: 8 }}
                      >
                        <div style={{
                          background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 800,
                          padding: '5px 14px',
                          borderRadius: 999,
                          letterSpacing: '0.05em',
                          boxShadow: '0 0 20px 8px rgba(239,68,68,0.5), 0 2px 8px rgba(0,0,0,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          whiteSpace: 'nowrap',
                        }}>
                          <span style={{ fontSize: 10 }}>✓</span>
                          <span>SL · {fmt(savedFlash[trade.id])}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <TrackBar
                    trade={trade}
                    currentPrice={currentPrice}
                    tpReached={trade.tpReached || []}
                    isActive={isTradeActive}
                    onTpReached={(idx, isLast) => handleTpReached(trade, idx, currentPrice, isLast)}
                    onLimitTriggered={() => handleLimitTriggered(trade, currentPrice)}
                    onSLHit={() => handleSLHit(trade, currentPrice)}
                    onUpdateSL={(newSL) => handleUpdateSL(trade, newSL)}
                    previewSL={0}
                    isEditMode={false}
                    suppressBE={!!savedFlash[trade.id]}
                    rrBadge={isTradeActive ? rrBadge : null}
                    timeSince={isTradeActive ? getTimeSince(trade) : null}
                  />

                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {openTrades.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowAll((v) => !v); }}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer mt-1"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`} />
            {showAll ? 'Hide' : `Show ${openTrades.length - 1} more`}
          </button>
        )}
      </div>
    </motion.div>
  );
}
