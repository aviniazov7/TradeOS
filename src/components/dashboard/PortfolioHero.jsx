import { useMemo, useRef, useState } from 'react';
import Card from '../shared/Card';
import AnimatedValue from '../shared/AnimatedValue';
import { formatCurrency, LRM } from '../../utils/formatters';

const W = 600;
const H = 170;
const PADY = 12;
const DAY = 86400000;

const PERIODS = [
  { id: 'week', label: 'השבוע', days: 7 },
  { id: 'month', label: 'החודש', days: 30 },
  { id: 'all', label: 'הכל', days: null },
];
const PERIOD_KEY = 'tradeos_home_period';

const money = (v) => formatCurrency(v);
const fmtDate = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };

// Cumulative P&L line + area for the chosen window. "All" keeps the account's
// running total; a week/month starts from 0 so it shows that period alone.
function buildChart(points) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const x = (i) => (i / (points.length - 1)) * W;
  const y = (v) => PADY + (H - 2 * PADY) * (1 - (v - min) / span);
  const pts = points.map((p, i) => ({ ...p, x: x(i), y: y(p.value) }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return { pts, line, area: `${line} L${W},${H} L0,${H} Z`, zeroY: y(0), peak: max };
}

// Pure (module scope) so the render stays free of Date.now().
function summarize(series, period) {
  const now = Date.now();
  const def = PERIODS.find((p) => p.id === period) || PERIODS[2];
  const from = def.days ? now - def.days * DAY : 0;
  const inRange = series.filter((p) => p.t >= from);
  let points;
  if (def.days) {
    let acc = 0;
    points = [{ t: from, value: 0 }, ...inRange.map((p) => ({ t: p.t, value: (acc += p.pnl) }))];
  } else {
    points = series.length ? [{ t: series[0].t, value: 0 }, ...series.map((p) => ({ t: p.t, value: p.value }))] : [];
  }
  const pnl = inRange.reduce((s, p) => s + p.pnl, 0);
  const wins = inRange.filter((p) => p.pnl > 0).length;
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const today = series.filter((p) => p.t >= dayStart.getTime()).reduce((s, p) => s + p.pnl, 0);
  return {
    def,
    pnl,
    count: inRange.length,
    winRate: inRange.length ? Math.round((wins / inRange.length) * 100) : null,
    today,
    chart: buildChart(points),
  };
}

// The home page's first card: what the account is worth, how it got here
// (cumulative P&L for the chosen period) and the period's key numbers.
//   series: [{ t, pnl, value }] — closed trades oldest → newest, value = running total
export default function PortfolioHero({ balance, pnlPercent, series, hidden }) {
  const [period, setPeriod] = useState(() => {
    try { return localStorage.getItem(PERIOD_KEY) || 'all'; } catch { return 'all'; }
  });
  const pick = (id) => {
    setPeriod(id);
    try { localStorage.setItem(PERIOD_KEY, id); } catch { /* private mode */ }
  };
  const s = useMemo(() => summarize(series, period), [series, period]);
  const m = (v) => (hidden ? '••••' : v);

  const wrapRef = useRef(null);
  const [hi, setHi] = useState(null);
  const onMove = (e) => {
    if (!s.chart || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setHi(Math.round(rel * (s.chart.pts.length - 1)));
  };
  const hp = hi != null && s.chart ? s.chart.pts[hi] : null;
  const hpLeft = hp ? Math.max(8, Math.min(92, (hi / (s.chart.pts.length - 1)) * 100)) : 0;

  const tile = 'rounded-xl bg-bg-tertiary border border-border-primary px-3.5 py-3 flex flex-col gap-1 min-w-0';
  const tone = (v) => (v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-primary');
  const third = s.def.id === 'all'
    ? { label: 'שיא התיק', value: s.chart ? m(money(s.chart.peak)) : '—', cls: s.chart && s.chart.peak > 0 ? 'text-profit' : 'text-text-primary' }
    : s.def.id === 'week'
      ? { label: 'היום', value: m(money(s.today)), cls: tone(s.today) }
      : { label: 'אחוז הצלחה', value: s.winRate == null ? '—' : `${s.winRate}%`, cls: 'text-text-primary' };

  return (
    <Card className="rounded-2xl p-4 md:p-5 flex flex-col gap-4 h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[13px] font-medium text-text-secondary">שווי תיקים כולל</span>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span dir="ltr">
              <AnimatedValue value={m(formatCurrency(balance).replace('+', ''))} className="num-mono text-3xl md:text-[40px] font-extrabold text-text-primary leading-none" />
            </span>
            {pnlPercent !== 0 && (
              <span dir="ltr" className={`text-[13px] font-bold px-2 py-0.5 rounded-lg ${pnlPercent >= 0 ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}`}>
                {m(`${LRM}${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`)}
              </span>
            )}
          </div>
        </div>
        <div role="group" aria-label="תקופה" className="flex gap-0.5 p-[3px] rounded-xl bg-bg-tertiary border border-border-primary">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => pick(p.id)} aria-pressed={period === p.id}
              className={`h-9 px-3.5 rounded-[9px] text-[13px] font-bold transition-colors cursor-pointer ${period === p.id ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className={tile}>
          <span className="text-xs text-text-secondary truncate" title={s.def.id === 'all' ? 'רווח/הפסד נקי מתחילת התיק' : `רווח/הפסד נקי ${s.def.label}`}>רווח/הפסד</span>
          <b className={`num-mono text-base md:text-xl ${tone(s.pnl)}`} dir="ltr" style={{ textAlign: 'right' }}>{m(money(s.pnl))}</b>
        </div>
        <div className={tile}>
          <span className="text-xs text-text-secondary">עסקאות</span>
          <b className="num-mono text-base md:text-xl text-text-primary">{s.count}</b>
        </div>
        <div className={tile}>
          <span className="text-xs text-text-secondary truncate">{third.label}</span>
          <b className={`num-mono text-base md:text-xl ${third.cls}`} dir="ltr" style={{ textAlign: 'right' }}>{third.value}</b>
        </div>
      </div>

      {s.chart ? (
        <div ref={wrapRef} dir="ltr" className="relative h-[150px] md:h-[170px]" onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="עקומת רווח מצטבר">
            <defs>
              <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--color-accent-primary)', stopOpacity: 0.3 }} />
                <stop offset="100%" style={{ stopColor: 'var(--color-accent-primary)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <line x1="0" x2={W} y1={s.chart.zeroY} y2={s.chart.zeroY} stroke="var(--color-border-hover)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
            <path d={s.chart.area} fill="url(#hero-fill)" />
            <path d={s.chart.line} fill="none" stroke="var(--color-accent-primary)" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {hp && <line x1={hp.x} x2={hp.x} y1="0" y2={H} stroke="var(--color-border-hover)" vectorEffect="non-scaling-stroke" />}
          </svg>
          {hp && (
            <div className="absolute top-1 -translate-x-1/2 px-2 py-1 rounded-lg bg-bg-overlay border border-border-primary text-[11px] whitespace-nowrap pointer-events-none"
              style={{ left: `${hpLeft}%` }}>
              <span className={`num-mono font-bold ${tone(hp.value)}`}>{m(money(hp.value))}</span>
              {hp.t ? <span className="text-text-secondary"> · {fmtDate(hp.t)}</span> : null}
            </div>
          )}
        </div>
      ) : (
        <div className="h-[120px] rounded-xl border border-dashed border-border-primary grid place-items-center text-sm text-text-secondary">
          {s.count === 0 ? `אין עסקאות סגורות ${s.def.id === 'all' ? 'עדיין' : s.def.label}` : 'צריך לפחות שתי עסקאות לגרף'}
        </div>
      )}
    </Card>
  );
}
