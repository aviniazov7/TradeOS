import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency } from '../../utils/formatters';

const tooltipStyle = {
  background: 'var(--color-bg-overlay)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-text-primary)',
};

export default function DayOfWeekChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-6">
      <h3 className="text-sm font-semibold text-text-primary mb-4">ביצועים לפי יום בשבוע</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <XAxis dataKey="name" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} reversed />
          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} orientation="right" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
            cursor={{ fill: 'var(--color-bg-tertiary)' }}
            formatter={(val) => [formatCurrency(val), 'רווח/הפסד']}
            labelFormatter={(label) => `יום ${label}`}
          />
          <Bar dataKey="pnl" radius={[4, 4, 0, 0]} animationDuration={800}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-3 text-[10px] text-text-muted">
        {data.map((d) => (
          <div key={d.name} className="text-center">
            <span className="block font-medium text-text-secondary">{d.name}</span>
            <span>{d.count} · {d.winRate.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
