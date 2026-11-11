import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import AnimatedValue from '../shared/AnimatedValue';
import FitText from '../shared/FitText';
import { formatCurrency, formatCurrencyShort, LRM } from '../../utils/formatters';
import { summarizeSeries } from '../../utils/portfolioPerformance';

const PERIODS = [
  { id: 'week', label: 'השבוע', days: 7 },
  { id: 'month', label: 'החודש', days: 30 },
  { id: 'all', label: 'הכל', days: null },
];
const PERIOD_KEY = 'tradeos_home_period';

// Tiles are narrow on a phone: very large amounts switch to $1.12M.
const money = (v) => formatCurrencyShort(v);
const fmtDate = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };

const PAD = { top: 14, right: 54, bottom: 26, left: 10 };

function axisMoney(value) {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

// Cumulative P&L line + area for the chosen window. "All" keeps the account's
// running total; a week/month starts from 0 so it shows that period alone.
function buildChart(points, width, height) {
  if (!points || points.length < 2 || width < 8 || height < 8) return null;
  const vals = points.map((p) => p.value);
  const rawMax = Math.max(0, ...vals);
  const rawMin = Math.min(0, ...vals);
  const max = rawMax === 0 && rawMin === 0 ? 1 : rawMax * 1.06;
  const min = rawMin < 0 ? rawMin * 1.06 : 0;
  const span = max - min || 1;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = Math.max(1, height - PAD.top - PAD.bottom);
  const x = (i) => PAD.left + (i / (points.length - 1)) * plotW;
  const y = (v) => PAD.top + (1 - (v - min) / span) * plotH;
  const pts = points.map((p, i) => ({ ...p, x: x(i), y: y(p.value) }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const baseline = y(0);
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${baseline.toFixed(1)} L${pts[0].x.toFixed(1)},${baseline.toFixed(1)} Z`;
  const grids = [];
  for (let i = 0; i <= 4; i += 1) {
    const gy = PAD.top + (i / 4) * plotH;
    grids.push({ y: gy, value: max - (i / 4) * span });
  }
  const labelCount = width < 380 ? 3 : 4;
  const xLabels = [];
  for (let i = 0; i < labelCount; i += 1) {
    const index = Math.round((i / (labelCount - 1)) * (points.length - 1));
    xLabels.push({
      x: x(index),
      anchor: i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle',
      text: fmtDate(points[index].t),
    });
  }
  return { pts, line, area, zeroY: baseline, peak: Math.max(...vals, 0), grids, xLabels, plotW, width, height };
}

function rangeLabel(points) {
  const times = (points || []).map((p) => p.t).filter((t) => t);
  if (times.length < 2) return '';
  const a = new Date(Math.min(...times));
  const b = new Date(Math.max(...times));
  const fmt = (d) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
  return `${fmt(a)} — ${fmt(b)} ${b.getFullYear()}`;
}

function EquityChart({ points, hidden, tone }) {
  const shellRef = useRef(null);
  const [box, setBox] = useState({ w: 640, h: 220 });
  const [hi, setHi] = useState(null);
  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return undefined;
    const apply = () => setBox({ w: Math.max(280, el.clientWidth || 280), h: el.clientHeight || 220 });
    apply();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const chart = useMemo(() => buildChart(points, box.w, box.h), [points, box]);
  if (!chart) return null;
  const hoverAt = (clientX) => {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (px - PAD.left) / chart.plotW));
    setHi(Math.round(ratio * (chart.pts.length - 1)));
  };
  const hp = hi != null ? chart.pts[hi] : null;
  const onKey = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    setHi((cur) => {
      const start = cur == null ? chart.pts.length - 1 : cur;
      return Math.max(0, Math.min(chart.pts.length - 1, start + step));
    });
  };
  const end = chart.pts[chart.pts.length - 1];
  return (
    <div className="chart-block">
      <div className="chart-meta">
        <span>רווח מצטבר</span>
        <span>{rangeLabel(points)}</span>
      </div>
      <div
        ref={shellRef}
        dir="ltr"
        className="chart-shell"
        tabIndex={0}
        onPointerMove={(e) => hoverAt(e.clientX)}
        onPointerLeave={() => setHi(null)}
        onKeyDown={onKey}
        aria-label="גרף רווח מצטבר. חץ ימינה ושמאלה נעים בין נקודות."
      >
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="עקומת רווח מצטבר">
          <defs>
            <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {chart.grids.map((g, i) => (
            <line key={`grid-${i}`} x1={PAD.left} x2={chart.width - PAD.right} y1={g.y} y2={g.y} stroke="var(--chart-grid)" />
          ))}
          {!hidden && chart.grids.map((g, i) => (
            <text key={`tick-${i}`} x={chart.width - 6} y={g.y + 4} textAnchor="end" fill="var(--chart-tick)" fontSize="12" fontFamily="var(--font-mono)">{axisMoney(g.value)}</text>
          ))}
          {chart.xLabels.map((label, i) => (
            <text key={`x-${i}`} x={label.x} y={chart.height - 6} textAnchor={label.anchor} fill="var(--chart-tick)" fontSize="12" fontFamily="var(--font-mono)">{label.text}</text>
          ))}
          <line x1={PAD.left} x2={chart.width - PAD.right} y1={chart.zeroY} y2={chart.zeroY} stroke="var(--border-strong)" strokeDasharray="4 5" />
          <path d={chart.area} fill="url(#hero-fill)" />
          <path d={chart.line} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={end.x} cy={end.y} r="3.5" fill="var(--accent)" stroke="var(--bg-canvas)" strokeWidth="2" />
          {hp && (
            <>
              <line x1={hp.x} x2={hp.x} y1={PAD.top} y2={chart.height - PAD.bottom} stroke="var(--border-strong)" />
              <circle cx={hp.x} cy={hp.y} r="4" fill="var(--accent)" stroke="var(--bg-canvas)" strokeWidth="2" />
            </>
          )}
        </svg>
        {hp && (
          <div className="chart-tip" style={{ left: `${(hp.x / chart.width) * 100}%`, top: hp.y }}>
            <span className="block text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{fmtDate(hp.t)}</span>
            <strong className={tone(hp.value)}>{hidden ? '••••' : money(hp.value)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// The home page's first card: what the account is worth, how it got here
// (cumulative P&L for the chosen period) and the period's key numbers.
//   series: [{ t, pnl, value }] — closed trades oldest → newest, value = running total
//   declaredStart: sum of journal opening balances. The % is accountPeriodReturn
//   for this period — the same helper as the journal. A withdrawal changes
//   `balance` and is not part of the %. `trades` are the closed trades behind
//   `series` so a per-trade balance snapshot is part of that book.
export default function PortfolioHero({ balance, declaredStart = 0, series, trades = null, hidden, onSetBalance = null, journalCount = 0 }) {
  const [period, setPeriod] = useState(() => {
    try { return localStorage.getItem(PERIOD_KEY) || 'all'; } catch { return 'all'; }
  });
  const pick = (id) => {
    setPeriod(id);
    try { localStorage.setItem(PERIOD_KEY, id); } catch { /* private mode */ }
  };
  const s = useMemo(() => {
    const summary = summarizeSeries(series, period, { declaredStart, equity: balance, trades });
    const def = PERIODS.find((p) => p.id === period) || PERIODS[2];
    const peak = summary.points?.length ? Math.max(...summary.points.map((p) => p.value), 0) : null;
    return { ...summary, def, peak };
  }, [series, period, declaredStart, balance, trades]);
  const m = (v) => (hidden ? '••••' : v);

  // $0.00 with no opening balance is not a portfolio. P&L can still exist;
  // ask for the starting balance instead of printing a fake zero.
  const balanceKnown = Number(declaredStart) > 0 || (Number.isFinite(Number(balance)) && Math.abs(Number(balance)) >= 1);
  const hasPnl = (series || []).some((p) => Number(p?.pnl));
  const askForStart = !balanceKnown && hasPnl;

  const tone = (v) => (v > 0 ? 'profit text-profit' : v < 0 ? 'loss text-loss' : 'text-text-primary');
  const third = s.def.id === 'all'
    ? { label: 'שיא התיק', value: s.peak == null ? '—' : m(money(s.peak)), cls: s.peak > 0 ? 'profit text-profit' : 'text-text-primary' }
    : s.def.id === 'week'
      ? { label: 'היום', value: m(money(s.today)), cls: tone(s.today) }
      : { label: 'אחוז הצלחה', value: s.winRate == null ? '—' : `${s.winRate}%`, cls: 'text-text-primary' };
  const chartable = (s.points || []).length >= 2;

  return (
    <section className="panel hero" data-testid="home-hero" aria-labelledby="heroTitle">
      <div className="hero__head">
        <div className="min-w-0">
          <div className="hero__label" id="heroTitle">שווי תיקים כולל</div>
          <div className="hero__value-row">
            {askForStart ? (
              onSetBalance ? (
                <button type="button" onClick={onSetBalance} data-testid="set-opening-balance" className="hero__ask">
                  הגדר יתרה התחלתית
                </button>
              ) : (
                <p data-testid="set-opening-balance" className="hero__ask">הגדר יתרה התחלתית</p>
              )
            ) : (
              <FitText dir="ltr" min={22} className="hero__value num">
                <AnimatedValue value={m(formatCurrency(balance).replace('+', ''))} />
              </FitText>
            )}
            {!askForStart && s.percent != null && s.percent !== 0 && (
              <span dir="ltr" data-testid="portfolio-return" className={`chip hero__return ${s.percent >= 0 ? 'chip--profit text-profit' : 'chip--loss text-loss'}`}>
                {m(`${LRM}${s.percent > 0 ? '+' : ''}${s.percent.toFixed(1)}%`)}
              </span>
            )}
          </div>
          <div className="hero__note">
            {s.def.id === 'all' ? 'מתחילת הדרך' : s.def.label}
            {journalCount > 0 ? ` · ${journalCount} יומנים` : ''}
            {` · ${s.count} עסקאות סגורות`}
          </div>
        </div>
        <div className="tabs" role="group" aria-label="תקופה">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => pick(p.id)} aria-pressed={period === p.id}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hero__stats">
        <div className="hero-stat">
          <span title={s.def.id === 'all' ? 'רווח/הפסד נקי מתחילת התיק' : `רווח/הפסד נקי ${s.def.label}`}>רווח/הפסד</span>
          <FitText as="strong" className={tone(s.pnl)} dir="ltr">{m(money(s.pnl))}</FitText>
        </div>
        <div className="hero-stat">
          <span>עסקאות</span>
          <strong>{s.count}</strong>
        </div>
        <div className="hero-stat">
          <span>{third.label}</span>
          <FitText as="strong" className={third.cls} dir="ltr">{third.value}</FitText>
        </div>
      </div>

      {chartable ? (
        <EquityChart points={s.points} hidden={hidden} tone={tone} />
      ) : (
        <div className="chart-empty">
          {s.count === 0 ? `אין עסקאות סגורות ${s.def.id === 'all' ? 'עדיין' : s.def.label}` : 'צריך לפחות שתי עסקאות לגרף'}
        </div>
      )}
    </section>
  );
}
