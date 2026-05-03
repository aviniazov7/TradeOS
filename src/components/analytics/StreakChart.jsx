import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const tooltipStyle = {
  background: '#141414',
  border: '1px solid #1a1a1a',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#f0f0f0',
};

export default function StreakChart({ data }) {
  if (!data || data.length < 2) return null;

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-6">
      <h3 className="text-sm font-semibold text-text-primary mb-4">רצפי ניצחון / הפסד</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fill: '#606070', fontSize: 10 }} axisLine={false} tickLine={false} reversed />
          <YAxis tick={{ fill: '#606070', fontSize: 11 }} axisLine={false} tickLine={false} orientation="right" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: '#a0a0b8', fontSize: '11px' }}
            itemStyle={{ color: '#f0f0f0' }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(val) => [
              `${Math.abs(val)} עסקאות`,
              val > 0 ? 'רצף רווחים' : 'רצף הפסדים',
            ]}
          />
          <Bar dataKey="length" radius={[4, 4, 4, 4]} animationDuration={800}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.length > 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-text-muted">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-profit/60" /> רצף רווחים</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-loss/60" /> רצף הפסדים</div>
      </div>
    </div>
  );
}
