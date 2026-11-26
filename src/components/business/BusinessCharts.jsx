import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '../shared/Card';
import { chartTick } from '../../utils/chartTicks';
import { formatBusinessAmount } from './businessView';

// Same chart surface as the journal analytics (bar + pie, theme tooltip).
// One currency per chart. Slices and bars never mix USD, ILS, and USDT.

const COLORS = {
  challenge_fee: '#f97316',
  reset: '#ef4444',
  subscription: '#a855f7',
  payout: '#22c55e',
  withdrawal: '#38bdf8',
  other: '#94a3b8',
};

const tooltipStyle = {
  background: 'var(--color-bg-overlay)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-text-primary)',
};

export default function BusinessCharts({ series, currency }) {
  if (!series?.length) return null;
  const pie = series.filter((row) => row.magnitude > 0);
  const money = (value) => formatBusinessAmount(value, currency, { signed: true });

  return (
    <div data-testid="business-chart" data-currency={currency} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card className="flex flex-col p-3">
        <h2 className="mb-2 text-[13px] font-semibold text-text-primary">נטו לפי קטגוריה</h2>
        <div className="h-[168px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <XAxis dataKey="name" tick={chartTick} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={chartTick} axisLine={false} tickLine={false} orientation="right" width={48} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'var(--color-bg-tertiary)' }}
                formatter={(value) => [money(value), 'נטו']}
              />
              <Bar dataKey="net" radius={[4, 4, 0, 0]} animationDuration={800}>
                {series.map((row) => (
                  <Cell key={row.key} fill={row.net >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="flex flex-col p-3">
        <h2 className="mb-1 text-[13px] font-semibold text-text-primary">הרכב לפי קטגוריה</h2>
        {pie.length > 0 && (
          <div className="h-[148px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="magnitude" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3}>
                  {pie.map((row) => <Cell key={row.key} fill={COLORS[row.key] || COLORS.other} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatBusinessAmount(value, currency), name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap justify-center gap-x-2.5 gap-y-1 text-[11px] text-text-secondary">
          {series.map((row) => (
            <span key={row.key} className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: COLORS[row.key] || COLORS.other }} />
              {row.name}
              {row.cashOnly ? ' · מזומן' : ''}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
