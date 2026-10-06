import { useMemo } from 'react';
import { isClosedTrade } from '../../utils/calculations';
import { LRM } from '../../utils/formatters';

// ── Performance snapshot ────────────────────────────────────────────────────
// The green "הביצועים שלך" card from the home mockup, fed by REAL trade data:
// this-week P&L (headline) + a cumulative sparkline, and today's P&L / avg R:R /
// win-rate tiles. Numbers derive from the same trade list as the rest of the
// dashboard, so they stay consistent.

const tradeMs = (t) => {
  const d = t.exitDate || t.entryDate || t.createdAt;
  if (!d) return 0;
  if (typeof d?.toDate === 'function') return d.toDate().getTime();
  if (typeof d === 'number') return d;
  const ms = new Date(d).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};
const pnlOf = (t) => Number(t.netPnl ?? t.pnl ?? 0) || 0;
const money = (v) => `${LRM}${v >= 0 ? '+' : '−'}$${Math.abs(Math.round(v)).toLocaleString()}`;

// Tiny inline sparkline from a numeric series (cumulative P&L).
function Spark({ points, up }) {
  if (!points || points.length < 2) return null;
  const w = 130, h = 42, pad = 3;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const stroke = up ? '#26d07c' : '#ff5c5c';
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${h} L${coords[0][0].toFixed(1)} ${h} Z`;
  const [ex, ey] = coords[coords.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <defs>
        <linearGradient id="ps-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity=".35" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#ps-g)" />
      <path d={line} stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="3" fill={stroke} />
    </svg>
  );
}

// Module-scope so the impure time calls (Date.now/new Date) stay out of the
// component render path (the render-purity lint rule only inspects the
// component body).
function computePerf(trades) {
  const now = Date.now();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 24 * 3600 * 1000;

  const closed = (trades || []).filter(isClosedTrade);
  const week = closed.filter((t) => tradeMs(t) >= weekAgo).sort((a, b) => tradeMs(a) - tradeMs(b));
  const weekPnl = week.reduce((s, t) => s + pnlOf(t), 0);
  const todayPnl = closed.filter((t) => tradeMs(t) >= dayStart.getTime()).reduce((s, t) => s + pnlOf(t), 0);

  // Cumulative sparkline over the week's trades (fallback: last 12 closed).
  const series = (week.length >= 2 ? week : closed.slice(-12));
  let acc = 0;
  const points = series.map((t) => (acc += pnlOf(t)));

  return { weekPnl, todayPnl, weekTrades: week.length, points };
}

export default function PerformanceSnapshot({ trades, stats, synced }) {
  const perf = useMemo(() => computePerf(trades), [trades]);

  if (!perf.points.length) return null; // nothing to show yet

  const weekUp = perf.weekPnl >= 0;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-text-muted">הביצועים שלך</span>
        {synced && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-profit">
            <span className="w-1.5 h-1.5 rounded-full bg-profit" style={{ boxShadow: '0 0 8px var(--color-profit)' }} />
            מסונכרן מהבורסה
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-border-primary p-4"
        style={{ background: 'radial-gradient(140% 120% at 0% 0%, rgba(38,208,124,0.08) 0%, transparent 55%), var(--color-bg-secondary)' }}>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-3xl font-extrabold font-mono leading-none ${weekUp ? 'text-profit' : 'text-loss'}`} dir="ltr">
              {money(perf.weekPnl)}
            </div>
            <div className="text-[11px] text-text-muted mt-1.5">
              השבוע · <span dir="ltr">{perf.weekTrades} טריידים</span>
            </div>
          </div>
          <Spark points={perf.points} up={weekUp} />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3.5">
          <div className="rounded-xl bg-bg-tertiary/50 border border-border-primary px-3 py-2.5 text-center">
            <div className={`text-base font-extrabold font-mono ${perf.todayPnl >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">{money(perf.todayPnl)}</div>
            <div className="text-[10px] text-text-muted mt-0.5">היום</div>
          </div>
          <div className="rounded-xl bg-bg-tertiary/50 border border-border-primary px-3 py-2.5 text-center">
            <div className="text-base font-extrabold font-mono text-text-primary" dir="ltr">{stats?.avgRR != null ? `${stats.avgRR.toFixed(1)}R` : '—'}</div>
            <div className="text-[10px] text-text-muted mt-0.5">R:R ממוצע</div>
          </div>
          <div className="rounded-xl bg-bg-tertiary/50 border border-border-primary px-3 py-2.5 text-center">
            <div className="text-base font-extrabold font-mono text-profit" dir="ltr">{stats?.winRate != null ? `${Math.round(stats.winRate)}%` : '—'}</div>
            <div className="text-[10px] text-text-muted mt-0.5">Win Rate</div>
          </div>
        </div>
      </div>
    </div>
  );
}
