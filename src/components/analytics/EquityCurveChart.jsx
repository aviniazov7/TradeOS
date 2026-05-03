import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/formatters';

const tooltipStyle = {
  background: '#141414',
  border: '1px solid #1a1a1a',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#f0f0f0',
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
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: '#606070', fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#606070', fontSize: 10 }} axisLine={false} tickLine={false} orientation="right" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: '#a0a0b8', fontSize: '11px' }}
            itemStyle={{ color: '#f0f0f0' }}
            cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
            formatter={(val) => [formatCurrency(val), 'הון']}
          />
          <Area type="monotone" dataKey="equity" stroke="#38bdf8" strokeWidth={2} fill="url(#equityGradAdv)" animationDuration={800} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
