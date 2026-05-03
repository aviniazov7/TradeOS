import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import { SESSION_COLORS } from '../../utils/constants';

const tooltipStyle = {
  background: '#141414',
  border: '1px solid #1a1a1a',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#f0f0f0',
};

export default function SessionAnalysisChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-6">
      <h3 className="text-sm font-semibold text-text-primary mb-4">ביצועים לפי סשן</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <XAxis dataKey="name" tick={{ fill: '#606070', fontSize: 11 }} axisLine={false} tickLine={false} reversed />
          <YAxis tick={{ fill: '#606070', fontSize: 11 }} axisLine={false} tickLine={false} orientation="right" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: '#a0a0b8', fontSize: '11px' }}
            itemStyle={{ color: '#f0f0f0' }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(val, name) => [formatCurrency(val), 'רווח/הפסד']}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="pnl" radius={[4, 4, 0, 0]} animationDuration={800}>
            {data.map((entry, i) => (
              <Cell key={i} fill={SESSION_COLORS[entry.name]?.hex || (entry.pnl >= 0 ? '#22c55e' : '#ef4444')} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
        {data.map((s) => (
          <div key={s.name} className="text-center text-[10px] text-text-muted">
            <span className="block font-medium" style={{ color: SESSION_COLORS[s.name]?.hex || '#a0a0b0' }}>{s.name}</span>
            <span>{s.count} עסקאות · {s.winRate.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
