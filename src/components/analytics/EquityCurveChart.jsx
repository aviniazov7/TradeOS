import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/formatters';

const tooltipStyle = {
  background: 'var(--color-bg-overlay)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-text-primary)',
};

export default function EquityCurveChart({ data }) {
  if (!data || data.length < 2) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 h-full flex items-center justify-center">
        <p className="text-text-muted text-sm">נדרשות לפחות 2 עסקאות סגורות</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-3">עקומת הון</h3>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="equityGradAdv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-accent-primary)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-accent-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} orientation="right" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
            cursor={{ stroke: 'var(--color-border-primary)', strokeWidth: 1 }}
            formatter={(val) => [formatCurrency(val), 'הון']}
          />
          <Area type="monotone" dataKey="equity" stroke="var(--color-accent-primary)" strokeWidth={2} fill="url(#equityGradAdv)" animationDuration={800} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
