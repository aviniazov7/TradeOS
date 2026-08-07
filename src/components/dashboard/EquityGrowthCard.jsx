import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import { formatCurrency } from '../../utils/formatters';

const W = 320;
const H = 100;
const PADY = 8;
const CH = 150; // chart pixel height — kept low so the line reads clean, not stretched
const pnlOf = (t) => (t.netPnl ?? t.pnl ?? 0);
const fmtDate = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };

// Build the SVG geometry + the per-point list (used for the hover crosshair).
function buildEquity(series) {
  const raw = (series || []).map((p) => (typeof p === 'number' ? { value: p } : p)).filter((p) => Number.isFinite(p?.value));
  if (raw.length < 2) return null;
  const vals = raw.map((p) => p.value);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const x = (i) => (i / (raw.length - 1)) * W;
  const y = (v) => PADY + (H - 2 * PADY) * (1 - (v - min) / span);
  const pts = raw.map((p, i) => ({ i, x: x(i), y: y(p.value), value: p.value, t: p.t }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return { pts, line, area: `${line} L${W},${H} L0,${H} Z`, last: vals[vals.length - 1], peak: max };
}

function extremes(trades) {
  let best = null;
  let worst = null;
  for (const t of trades || []) {
    const p = pnlOf(t);
    if (p === 0) continue;
    if (best == null || p > pnlOf(best)) best = t;
    if (worst == null || p < pnlOf(worst)) worst = t;
  }
  return { best, worst };
}

// Animated equity-growth card — the line DRAWS in (framer pathLength) in the
// app's accent colour, with a hover crosshair + value tooltip, plus a spotlight
// of the best & worst closed trades.
export default function EquityGrowthCard({ series = [], trades = [], hidden = false }) {
  const eq = useMemo(() => buildEquity(series), [series]);
  const { best, worst } = useMemo(() => extremes(trades), [trades]);
  const mask = (v) => (hidden ? '•••' : v);
  const wrapRef = useRef(null);
  const [hi, setHi] = useState(null);

  const onMove = (e) => {
    if (!eq || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHi(Math.round(rel * (eq.pts.length - 1)));
  };
  const hp = hi != null && eq ? eq.pts[hi] : null;
  const leftPct = hp ? Math.max(9, Math.min(91, (hp.i / (eq.pts.length - 1)) * 100)) : 0;

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 flex flex-col">
      <div className="flex items-end justify-between mb-2">
        <div className="min-w-0">
          <div className="text-xs text-text-muted">צמיחת ההון</div>
          {eq && <div dir="ltr" className={`text-xl font-bold leading-tight ${eq.last >= 0 ? 'text-profit' : 'text-loss'}`}>{mask(formatCurrency(eq.last))}</div>}
        </div>
        {eq && <div className="text-[11px] text-text-muted shrink-0">שיא <span dir="ltr" className="font-bold text-text-primary num-mono">{mask(formatCurrency(eq.peak))}</span></div>}
      </div>

      {eq ? (
        <div ref={wrapRef} dir="ltr" className="relative" style={{ height: CH }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--color-accent-primary)', stopOpacity: 0.26 }} />
                <stop offset="100%" style={{ stopColor: 'var(--color-accent-primary)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <motion.path d={eq.area} fill="url(#eqfill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.9 }} />
            <motion.path
              d={eq.line} fill="none" stroke="var(--color-accent-primary)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }}
            />
            {hp && <line x1={hp.x} y1="0" x2={hp.x} y2={H} stroke="var(--color-accent-primary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" vectorEffect="non-scaling-stroke" />}
          </svg>

          {hp && (
            <>
              <div className="absolute w-2.5 h-2.5 rounded-full bg-accent-primary ring-2 ring-white/70 pointer-events-none"
                style={{ left: `${(hp.i / (eq.pts.length - 1)) * 100}%`, top: `${(hp.y / H) * CH}px`, transform: 'translate(-50%,-50%)' }} />
              <div className="absolute top-0 pointer-events-none px-2 py-1 rounded-lg bg-bg-overlay border border-border-primary text-[11px] whitespace-nowrap shadow-lg"
                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}>
                <span dir="ltr" className={`font-bold num-mono ${hp.value >= 0 ? 'text-profit' : 'text-loss'}`}>{mask(formatCurrency(hp.value))}</span>
                {hp.t ? <span className="text-text-muted"> · {fmtDate(hp.t)}</span> : null}
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ height: CH }} className="flex items-center justify-center text-sm text-text-muted">אין מספיק נתונים לגרף</div>
      )}

      {(best || worst) && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {best && (
            <div className="flex items-center gap-2 rounded-lg bg-profit/8 px-2.5 py-2 min-w-0">
              <CoinIcon pair={best.pair} className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-text-muted flex items-center gap-1"><TrendingUp className="w-3 h-3 text-profit" />הכי טוב</div>
                <div dir="ltr" className="text-sm font-bold text-profit truncate num-mono">{mask(formatCurrency(pnlOf(best)))}</div>
              </div>
            </div>
          )}
          {worst && (
            <div className="flex items-center gap-2 rounded-lg bg-loss/8 px-2.5 py-2 min-w-0">
              <CoinIcon pair={worst.pair} className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-text-muted flex items-center gap-1"><TrendingDown className="w-3 h-3 text-loss" />הכי גרוע</div>
                <div dir="ltr" className="text-sm font-bold text-loss truncate num-mono">{mask(formatCurrency(pnlOf(worst)))}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
