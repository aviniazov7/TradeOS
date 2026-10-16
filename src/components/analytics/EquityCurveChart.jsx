import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import { chartTick } from '../../utils/chartTicks';

// Desktop Safari resolves `height: 100%` inside a flex child that only has
// min-height as 0, so ResponsiveContainer skips the plot. A pixel height
// gives the chart a definite box on WebKit and everywhere else.
const PLOT_HEIGHT = 260;

const tooltipStyle = {
  background: 'var(--color-bg-overlay)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-text-primary)',
};

// Compact axis labels ($1.2K) so the Y ticks stay narrow and don't crowd the
// plot / collide with the X axis.
const compactUsd = (v) => {
  const a = Math.abs(v);
  return a >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`;
};

export default function EquityCurveChart({ data }) {
  if (!data || data.length < 2) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 h-full min-h-[220px] flex items-center justify-center">
        <p className="text-text-muted text-sm">נדרשות לפחות 2 עסקאות סגורות</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 flex flex-col min-w-0">
      <h3 className="text-sm font-semibold text-text-primary mb-3 shrink-0">עקומת הון</h3>
      <div className="w-full min-w-0" data-testid="equity-curve-plot" style={{ height: PLOT_HEIGHT }}>
        <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="equityGradAdv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent-primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-accent-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* minTickGap keeps the date labels from crowding; the YAxis width
                reserves the right strip so the axes don't collide in the corner. */}
            <XAxis dataKey="date" tick={chartTick} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis tick={chartTick} axisLine={false} tickLine={false} orientation="right" width={56} tickFormatter={compactUsd} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}
              itemStyle={{ color: 'var(--color-text-primary)' }}
              cursor={{ stroke: 'var(--color-border-primary)', strokeWidth: 1 }}
              formatter={(val) => [formatCurrency(val), 'הון']}
            />
            <Area type="monotone" dataKey="equity" stroke="var(--color-accent-primary)" strokeWidth={2} fill="url(#equityGradAdv)" animationDuration={800} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
