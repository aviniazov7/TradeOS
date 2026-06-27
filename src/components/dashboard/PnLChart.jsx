import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

const tooltipStyle = {
  background: 'var(--color-bg-overlay)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-text-primary)',
};

export default function PnLChart({ trades }) {
  const data = useMemo(() => {
    const closed = trades
      .filter((t) => t.status === 'closed' && t.exitDate)
      .sort((a, b) => {
        const da = a.exitDate?.toDate ? a.exitDate.toDate() : new Date(a.exitDate);
        const db = b.exitDate?.toDate ? b.exitDate.toDate() : new Date(b.exitDate);
        return da - db;
      });

    const result = [];
    let runningEquity = 0;
    for (const t of closed) {
      runningEquity += t.netPnl ?? t.pnl ?? 0;
      const d = t.exitDate?.toDate ? t.exitDate.toDate() : new Date(t.exitDate);
      result.push({ date: format(d, 'MMM d'), equity: parseFloat(runningEquity.toFixed(2)) });
    }
    return result;
  }, [trades]);

  if (data.length < 2) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-6 h-72 flex items-center justify-center">
        <p className="text-text-muted text-sm">נדרשות לפחות 2 עסקאות סגורות לגרף הון</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-6">
      <h3 className="text-sm font-semibold text-text-primary mb-4">עקומת הון</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} reversed />
          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} orientation="right" />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--color-border-primary)', strokeWidth: 1 }} />
          <Area type="monotone" dataKey="equity" stroke="#38bdf8" strokeWidth={2} fill="url(#equityGrad)" animationDuration={800} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
