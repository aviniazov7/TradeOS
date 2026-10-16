import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import EquityCurveChart from '../analytics/EquityCurveChart';
import TradeDurationChart from '../analytics/TradeDurationChart';
import { chartTick } from '../../utils/chartTicks';

// The journal's analytics charts. Split out so `recharts` (~414 kB) is only
// downloaded when the analytics tab is opened — it used to load eagerly on the
// trades tab, which is the default landing view.
export default function JournalCharts({
  analytics, stats, periodTrades, cardClass, tooltipStyle, pieColors, formatCurrency, onFilterJump,
}) {
  if (!analytics) return null;

  return (
    <div className="space-y-4 mb-6">
      <EquityCurveChart data={stats.equityChartData} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
      <div className={`${cardClass} p-5 h-full min-h-[280px] flex flex-col`}>
        <h3 className="text-sm font-semibold text-text-primary mb-3 shrink-0">התפלגות תוצאות</h3>
        <div className="flex-1 min-h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={analytics.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}>
              {analytics.pieData.map((d) => <Cell key={d.name} fill={pieColors[d.name]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--color-text-secondary)', fontSize: '12px' }} itemStyle={{ color: 'var(--color-text-primary)' }} cursor={{ fill: 'var(--color-bg-tertiary)' }} />
          </PieChart>
        </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-3 text-xs text-text-secondary mt-1 shrink-0 flex-wrap">
          {analytics.pieData.map((d) => {
            let resultKey = 'breakeven';
            if (d.name === 'רווח') resultKey = 'win';
            else if (d.name === 'הפסד') resultKey = 'loss';
            return (
              <div key={d.name} onClick={() => onFilterJump({ result: resultKey })}
                className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                <div className="w-2 h-2 rounded-full" style={{ background: pieColors[d.name] }} />
                <span className="text-text-muted">{d.name} ({d.value}) ↗</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`${cardClass} p-5 h-full min-h-[280px] flex flex-col`}>
        <h3 className="text-sm font-semibold text-text-primary mb-3 shrink-0">רווח/הפסד יומי</h3>
        <div className="flex-1 min-h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analytics.dailyPnL}>
            <XAxis dataKey="date" tick={chartTick} axisLine={false} tickLine={false} />
            <YAxis tick={chartTick} axisLine={false} tickLine={false} orientation="right" />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--color-text-secondary)', fontSize: '12px' }} itemStyle={{ color: 'var(--color-text-primary)' }} cursor={{ fill: 'var(--color-bg-tertiary)' }} formatter={(val) => [formatCurrency(val), 'רווח/הפסד']} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]} animationDuration={800}>
              {analytics.dailyPnL.map((entry) => (
                <Cell key={entry.key || entry.date} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>

      <TradeDurationChart trades={periodTrades} />
      </div>
    </div>
  );
}
