import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import { formatCurrency } from '../../utils/formatters';

const W = 320;
const H = 100;
const PADY = 10;
const pnlOf = (t) => (t.netPnl ?? t.pnl ?? 0);

// Build the SVG line + area from the cumulative-equity series.
function buildEquity(series) {
  const vals = (series || []).map((p) => (typeof p === 'number' ? p : p?.value)).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const x = (i) => (i / (vals.length - 1)) * W;
  const y = (v) => PADY + (H - 2 * PADY) * (1 - (v - min) / span);
  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return { line, area: `${line} L${W},${H} L0,${H} Z`, last: vals[vals.length - 1], peak: max, endX: x(vals.length - 1), endY: y(vals[vals.length - 1]) };
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
// app's accent colour, plus a spotlight of the best & worst closed trades.
export default function EquityGrowthCard({ series = [], trades = [], hidden = false }) {
  const eq = useMemo(() => buildEquity(series), [series]);
  const { best, worst } = useMemo(() => extremes(trades), [trades]);
  const mask = (v) => (hidden ? '•••' : v);

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-end justify-between mb-1.5">
        <div className="min-w-0">
          <div className="text-xs text-text-muted">צמיחת ההון</div>
          {eq && <div dir="ltr" className={`text-2xl font-bold leading-tight ${eq.last >= 0 ? 'text-profit' : 'text-loss'}`}>{mask(formatCurrency(eq.last))}</div>}
        </div>
        {eq && <div className="text-[11px] text-text-muted shrink-0">שיא <span dir="ltr" className="font-bold text-text-primary num-mono">{mask(formatCurrency(eq.peak))}</span></div>}
      </div>

      {eq ? (
        <div className="flex-1 min-h-[96px]">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--color-accent-primary)', stopOpacity: 0.3 }} />
                <stop offset="100%" style={{ stopColor: 'var(--color-accent-primary)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <motion.path d={eq.area} fill="url(#eqfill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.9 }} />
            <motion.path
              d={eq.line} fill="none" stroke="var(--color-accent-primary)" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: 'easeOut' }}
            />
            <motion.circle cx={eq.endX} cy={eq.endY} r="3.5" fill="var(--color-accent-primary)" vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} />
          </svg>
        </div>
      ) : (
        <div className="flex-1 min-h-[96px] flex items-center justify-center text-sm text-text-muted">אין מספיק נתונים לגרף</div>
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
