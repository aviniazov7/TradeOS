import { motion } from 'framer-motion';
import { formatCurrency } from '../../utils/formatters';
import Card from '../shared/Card';
import RollingNumber from '../shared/RollingNumber';

/* ------------------------------------------------------------------ */
/* Animation variants                                                  */
/* ------------------------------------------------------------------ */

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05 },
  },
};

const card = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
};

// Layout only — the surface (bg/border/radius) comes from the shared Card.
const cardClass = 'p-4 h-full flex flex-col justify-between';

/* ------------------------------------------------------------------ */
/* Small gauges                                                        */
/* ------------------------------------------------------------------ */

/** Semicircle (180°) gauge: green arc = pct%, neutral track = rest. */
function SemicircleGauge({ pct = 0, size = 92 }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Half-circle path from left (180°) to right (0°), drawn as an arc.
  const start = { x: cx - r, y: cy };
  const end = { x: cx + r, y: cy };
  const semiLen = Math.PI * r; // arc length of the half circle
  const greenLen = (clamped / 100) * semiLen;

  const arc = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;

  return (
    <svg
      width={size}
      height={size / 2 + stroke}
      viewBox={`0 0 ${size} ${size / 2 + stroke}`}
      className="overflow-visible"
      dir="ltr"
    >
      {/* neutral track (remainder) */}
      <path
        d={arc}
        fill="none"
        stroke="var(--color-border-primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* green (covered) */}
      <path
        d={arc}
        fill="none"
        stroke="var(--color-profit)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${greenLen} ${semiLen}`}
      />
    </svg>
  );
}

/** Ring (donut) gauge: green portion = pct (0..1), neutral track = rest. */
function RingGauge({ pct = 0, size = 56, children }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const green = clamped * c;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} dir="ltr">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {/* neutral track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-border-primary)"
            strokeWidth={stroke}
          />
          {/* green portion */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-profit)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${green} ${c}`}
          />
        </g>
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function DashboardKpis({ kpi, hidden = false }) {
  const mask = (v) => (hidden ? '••••' : v);
  const {
    netPnl = 0,
    tradeCount = 0,
    winRate = 0,
    wins = 0,
    breakeven = 0,
    losses = 0,
    avgWin = 0,
    avgLoss = 0,
    avgWinLossRatio = 0,
    profitFactor = 0,
    streakDays = { current: 0, best: 0, win: true },
    streakTrades = { current: 0, best: 0, win: true },
  } = kpi || {};

  const netPositive = netPnl >= 0;

  // Diverging avg bar widths (guard divide-by-zero).
  const absLoss = Math.abs(avgLoss || 0);
  const totalAvg = (avgWin || 0) + absLoss;
  const greenPct = totalAvg > 0 ? ((avgWin || 0) / totalAvg) * 100 : 50;
  const redPct = totalAvg > 0 ? (absLoss / totalAvg) * 100 : 50;

  // Profit factor ring fraction.
  const pfFinite = Number.isFinite(profitFactor);
  const pf = pfFinite ? profitFactor : 0;
  const pfFraction = pfFinite ? (pf + 1 > 0 ? pf / (pf + 1) : 0) : 1;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 lg:grid-cols-5 gap-3"
    >
      {/* 1) Net P&L ---------------------------------------------------- */}
      <Card as={motion.div} variants={card} whileHover={{ y: -3 }} className={cardClass}>
        <span className="text-xs text-text-muted">רווח/הפסד נקי</span>
        <div>
          <div dir="ltr" className={`text-2xl font-bold text-right ${netPositive ? 'text-profit' : 'text-loss'}`}>
            <RollingNumber value={mask(formatCurrency(netPnl))} />
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">{tradeCount} עסקאות</div>
        </div>
      </Card>

      {/* 2) Win rate -------------------------------------------------- */}
      <Card as={motion.div} variants={card} whileHover={{ y: -3 }} className={cardClass}>
        <span className="text-xs text-text-muted">אחוז הצלחה</span>
        <div className="flex items-end justify-between gap-2">
          <div dir="ltr" className="text-2xl font-bold text-text-primary">
            <RollingNumber value={`${(Number.isFinite(winRate) ? winRate : 0).toFixed(2)}%`} />
          </div>
          <SemicircleGauge pct={winRate} />
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-profit/15 text-profit">
            {wins}
          </span>
          <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-breakeven/15 text-breakeven">
            {breakeven}
          </span>
          <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-loss/15 text-loss">
            {losses}
          </span>
        </div>
      </Card>

      {/* 3) Avg win/loss --------------------------------------------- */}
      <Card as={motion.div} variants={card} whileHover={{ y: -3 }} className={cardClass}>
        <span className="text-xs text-text-muted">ממוצע רווח/הפסד</span>
        <div dir="ltr" className="text-2xl font-bold text-text-primary text-right">
          <RollingNumber value={(Number.isFinite(avgWinLossRatio) ? avgWinLossRatio : 0).toFixed(2)} />
        </div>
        <div className="mt-2">
          <div className="h-2 rounded-full overflow-hidden flex bg-bg-tertiary" dir="ltr">
            <div
              className="h-full bg-profit"
              style={{ width: `${greenPct}%` }}
            />
            <div
              className="h-full bg-loss"
              style={{ width: `${redPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5" dir="ltr">
            <span className="text-[11px] font-semibold text-profit">
              {mask(formatCurrency(avgWin))}
            </span>
            <span className="text-[11px] font-semibold text-loss">
              {mask(formatCurrency(avgLoss))}
            </span>
          </div>
        </div>
      </Card>

      {/* 4) Profit factor -------------------------------------------- */}
      <Card as={motion.div} variants={card} whileHover={{ y: -3 }} className={cardClass}>
        <span className="text-xs text-text-muted">פקטור רווח</span>
        <div className="flex items-center justify-between gap-2">
          <div dir="ltr" className="text-2xl font-bold text-text-primary">
            <RollingNumber value={pfFinite ? pf.toFixed(2) : '∞'} />
          </div>
          <RingGauge pct={pfFraction} size={56} />
        </div>
      </Card>

      {/* 5) Current streak ------------------------------------------- */}
      <Card as={motion.div} variants={card} whileHover={{ y: -3 }} className={cardClass}>
        <span className="text-xs text-text-muted">רצף נוכחי</span>
        <div className="flex items-center justify-around gap-2">
          <StreakBadge label="ימים" data={streakDays} />
          <StreakBadge label="עסקאות" data={streakTrades} />
        </div>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Streak sub-component                                                */
/* ------------------------------------------------------------------ */

function StreakBadge({ label, data }) {
  const { current = 0, best = 0, win = true } = data || {};
  const tone = win ? 'border-profit text-profit' : 'border-loss text-loss';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-text-muted">{label}</span>
      <div
        className={`rounded-full border-2 flex items-center justify-center font-bold ${tone}`}
        style={{ width: 44, height: 44 }}
        dir="ltr"
      >
        {current}
      </div>
      <span className="text-[10px] text-text-muted" dir="ltr">
        שיא {best}
      </span>
    </div>
  );
}
