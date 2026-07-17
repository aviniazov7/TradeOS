import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { isClosedTrade } from '../../utils/calculations';

const BUCKETS = [
  { label: '<1h',   minMs: 0,           maxMs: 3_600_000 },
  { label: '1–4h',  minMs: 3_600_000,   maxMs: 14_400_000 },
  { label: '4–24h', minMs: 14_400_000,  maxMs: 86_400_000 },
  { label: '1–3d',  minMs: 86_400_000,  maxMs: 259_200_000 },
  { label: '>3d',   minMs: 259_200_000, maxMs: Infinity },
];

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const mins  = ms / 60_000;
  const hours = ms / 3_600_000;
  const days  = ms / 86_400_000;
  if (mins  < 60)  return `${Math.round(mins)}m`;
  if (hours < 24)  return `${hours.toFixed(1)}h`;
  if (days  < 14)  return `${days.toFixed(1)}d`;
  return `${(days / 7).toFixed(1)}w`;
}

function toMs(t) {
  if (!t) return null;
  const d = t?.toDate ? t.toDate() : new Date(t);
  return isNaN(d.getTime()) ? null : d.getTime();
}

const tooltipStyle = {
  background: 'var(--color-bg-overlay)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: '10px',
  fontSize: '11px',
  color: 'var(--color-text-primary)',
  padding: '8px 12px',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const wins   = payload.find(p => p.dataKey === 'wins')?.value  ?? 0;
  const losses = payload.find(p => p.dataKey === 'losses')?.value ?? 0;
  const total  = wins + losses;
  const wr     = total > 0 ? ((wins / total) * 100).toFixed(0) : '—';
  return (
    <div style={tooltipStyle}>
      <p className="font-semibold text-text-primary mb-1">{label}</p>
      <p style={{ color: '#22c55e' }}>רווחים: {wins}</p>
      <p style={{ color: '#ef4444' }}>הפסדים: {losses}</p>
      <p className="text-text-muted mt-1">% הצלחה: <span className="font-bold text-text-primary">{wr}%</span></p>
    </div>
  );
};

export default function TradeDurationChart({ trades }) {
  const data = useMemo(() => {
    const closed = trades.filter(t => isClosedTrade(t) && t.entryDate && t.exitDate);
    let totalMs = 0, winMs = 0, lossMs = 0, count = 0, winCount = 0, lossCount = 0;
    const buckets = BUCKETS.map(b => ({ ...b, wins: 0, losses: 0 }));

    closed.forEach(t => {
      const entry = toMs(t.entryDate);
      const exit  = toMs(t.exitDate);
      if (!entry || !exit || exit <= entry) return;
      const dur = exit - entry;
      totalMs += dur; count++;
      if (t.result === 'win')  { winMs  += dur; winCount++; }
      if (t.result === 'loss') { lossMs += dur; lossCount++; }
      const bucket = buckets.find(b => dur >= b.minMs && dur < b.maxMs);
      if (bucket) {
        if (t.result === 'win')  bucket.wins++;
        if (t.result === 'loss') bucket.losses++;
      }
    });

    return {
      avgAll:   count      ? totalMs / count      : 0,
      avgWin:   winCount   ? winMs   / winCount   : 0,
      avgLoss:  lossCount  ? lossMs  / lossCount  : 0,
      winCount, lossCount, count,
      chartData: buckets.map(b => ({ label: b.label, wins: b.wins, losses: b.losses })),
    };
  }, [trades]);

  if (data.count === 0) return null;

  const insightColor = data.avgLoss > data.avgWin * 1.5 ? '#ef4444'
    : data.avgWin > data.avgLoss * 1.5 ? '#22c55e'
    : '#606070';
  const insightText = data.avgLoss > data.avgWin * 1.5
    ? '⚠ הפסדים נמשכים זמן ארוך יותר'
    : data.avgWin > data.avgLoss * 1.5
    ? '✓ הרווחים נמשכים זמן ארוך יותר'
    : 'משך רווחים והפסדים דומה';

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 flex flex-col gap-3">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-accent-primary shrink-0" />
          <h3 className="text-sm font-semibold text-text-primary">משך עסקה ממוצע</h3>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted">ממוצע כללי</span>
            <span className="text-sm font-bold text-text-primary">{fmtDuration(data.avgAll)}</span>
          </div>
          <div className="w-px h-6 bg-border-primary" />
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted">רווחים</span>
            <span className="text-sm font-bold text-profit">{fmtDuration(data.avgWin)}</span>
          </div>
          <div className="w-px h-6 bg-border-primary" />
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted">הפסדים</span>
            <span className="text-sm font-bold text-loss">{fmtDuration(data.avgLoss)}</span>
          </div>
          <div className="mr-auto flex items-center gap-2 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#22c55e' }} />
              רווח
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#ef4444' }} />
              הפסד
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data.chartData} barCategoryGap="28%" barGap={3}>
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg-tertiary)' }} />
          <Bar dataKey="wins" radius={[4, 4, 0, 0]} animationDuration={700} fill="#22c55e" fillOpacity={0.8} />
          <Bar dataKey="losses" radius={[4, 4, 0, 0]} animationDuration={700} fill="#ef4444" fillOpacity={0.8} />
        </BarChart>
      </ResponsiveContainer>

      {/* Insight */}
      {data.avgWin > 0 && data.avgLoss > 0 && (
        <p className="text-[10px] pt-2 border-t border-border-primary/40" style={{ color: insightColor }}>
          {insightText}
        </p>
      )}
    </div>
  );
}
