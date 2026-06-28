import { useState } from 'react';
import { Flame, Snowflake, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useBacktestStats } from '../../hooks/useBacktestStats';
import { TIME_PERIODS, SESSION_COLORS } from '../../utils/constants';

const tooltipStyle = { background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-primary)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-primary)' };
const COLORS = ['#22c55e', '#ef4444', '#eab308'];

export default function BacktestAnalytics({ backtests }) {
  const [period, setPeriod] = useState('all');
  const stats = useBacktestStats(backtests, period);

  const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-4';
  const rColor = (v) => v >= 0 ? 'text-profit' : 'text-loss';

  const formatR = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`;

  return (
    <div>
      {/* Period filter */}
      <div className="flex items-center gap-1 mb-5">
        {TIME_PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              period === p.key
                ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/30'
                : 'bg-bg-tertiary text-text-muted border border-border-primary hover:border-border-hover'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Row 1: 4 main stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mb-4">
        <div className={cardClass}>
          <span className="text-[11px] md:text-xs text-text-muted block mb-1">אחוז הצלחה</span>
          <span className="text-base md:text-lg font-bold text-text-primary">{stats.winRate.toFixed(1)}%</span>
          <span className="text-[10px] md:text-xs text-text-muted block">{stats.wins}W / {stats.losses}L ({stats.total})</span>
        </div>
        <div className={cardClass}>
          <span className="text-[11px] md:text-xs text-text-muted block mb-1">סה"כ R</span>
          <span className={`text-base md:text-lg font-bold ${rColor(stats.totalR)}`}>{formatR(stats.totalR)}</span>
        </div>
        <div className={cardClass}>
          <span className="text-[11px] md:text-xs text-text-muted block mb-1">ממוצע R</span>
          <span className={`text-base md:text-lg font-bold ${rColor(stats.avgR)}`}>{formatR(stats.avgR)}</span>
        </div>
        <div className={cardClass}>
          <span className="text-[11px] md:text-xs text-text-muted block mb-1">Profit Factor (R)</span>
          <span className="text-base md:text-lg font-bold text-text-primary">
            {stats.profitFactorR === Infinity ? '∞' : stats.profitFactorR.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Row 2: 4 more stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mb-6">
        <div className={cardClass}>
          <span className="text-[11px] md:text-xs text-text-muted block mb-1">Best R</span>
          <span className="text-base md:text-lg font-bold text-profit">{formatR(stats.bestR)}</span>
        </div>
        <div className={cardClass}>
          <span className="text-[11px] md:text-xs text-text-muted block mb-1">Worst R</span>
          <span className="text-base md:text-lg font-bold text-loss">{formatR(stats.worstR)}</span>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-1 mb-1">
            <Flame className="w-3 h-3 text-profit" />
            <span className="text-[11px] md:text-xs text-text-muted">רצף רווחים</span>
          </div>
          <span className="text-base md:text-lg font-bold text-profit">{stats.maxWinStreak}</span>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-1 mb-1">
            <Snowflake className="w-3 h-3 text-loss" />
            <span className="text-[11px] md:text-xs text-text-muted">רצף הפסדים</span>
          </div>
          <span className="text-base md:text-lg font-bold text-loss">{stats.maxLossStreak}</span>
        </div>
      </div>

      {/* Charts row */}
      {stats.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Daily R bar chart */}
          {stats.dailyR.length > 0 && (
            <div className={`${cardClass} p-6`}>
              <h3 className="text-sm font-semibold text-text-primary mb-4">R Results יומי</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.dailyR}>
                  <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} reversed />
                  <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} orientation="right" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(val) => [`${val >= 0 ? '+' : ''}${val.toFixed(2)}R`, 'R Result']} />
                  <Bar dataKey="r" radius={[4, 4, 0, 0]} animationDuration={800}>
                    {stats.dailyR.map((entry, i) => (
                      <Cell key={i} fill={entry.r >= 0 ? '#22c55e' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Win/Loss pie */}
          {stats.pieData.some((d) => d.value > 0) && (
            <div className={`${cardClass} p-6`}>
              <h3 className="text-sm font-semibold text-text-primary mb-4">התפלגות תוצאות</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stats.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {stats.pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs mt-2">
                {stats.pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="text-text-muted">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Performance tables */}
      {stats.byStrategy.length > 0 && (
        <div className={`${cardClass} mb-4`}>
          <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי אסטרטגיה</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                <th className="text-right pb-2 font-medium">אסטרטגיה</th>
                <th className="text-right pb-2 font-medium">עסקאות</th>
                <th className="text-right pb-2 font-medium">Win Rate</th>
                <th className="text-right pb-2 font-medium">סה"כ R</th>
                <th className="text-right pb-2 font-medium">ממוצע R</th>
              </tr></thead>
              <tbody>
                {stats.byStrategy.map((s) => (
                  <tr key={s.strategy} className="border-b border-border-primary/50">
                    <td className="py-2 text-text-primary font-medium">{s.strategy}</td>
                    <td className="py-2 text-text-secondary">{s.count}</td>
                    <td className="py-2 text-text-secondary">{s.winRate.toFixed(1)}%</td>
                    <td className={`py-2 font-medium ${rColor(s.totalR)}`}>{formatR(s.totalR)}</td>
                    <td className={`py-2 ${rColor(s.avgR)}`}>{formatR(s.avgR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.byPair.length > 0 && (
        <div className={`${cardClass} mb-4`}>
          <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי זוג</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                <th className="text-right pb-2 font-medium">זוג</th>
                <th className="text-right pb-2 font-medium">עסקאות</th>
                <th className="text-right pb-2 font-medium">Win Rate</th>
                <th className="text-right pb-2 font-medium">סה"כ R</th>
                <th className="text-right pb-2 font-medium">ממוצע R</th>
              </tr></thead>
              <tbody>
                {stats.byPair.map((p) => (
                  <tr key={p.pair} className="border-b border-border-primary/50">
                    <td className="py-2 text-text-primary font-medium">{p.pair}</td>
                    <td className="py-2 text-text-secondary">{p.count}</td>
                    <td className="py-2 text-text-secondary">{p.winRate.toFixed(1)}%</td>
                    <td className={`py-2 font-medium ${rColor(p.totalR)}`}>{formatR(p.totalR)}</td>
                    <td className={`py-2 ${rColor(p.avgR)}`}>{formatR(p.avgR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.bySession.length > 0 && (
        <div className={`${cardClass} mb-4`}>
          <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי סשן</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                <th className="text-right pb-2 font-medium">סשן</th>
                <th className="text-right pb-2 font-medium">עסקאות</th>
                <th className="text-right pb-2 font-medium">Win Rate</th>
                <th className="text-right pb-2 font-medium">סה"כ R</th>
                <th className="text-right pb-2 font-medium">ממוצע R</th>
              </tr></thead>
              <tbody>
                {stats.bySession.map((s) => (
                  <tr key={s.session} className="border-b border-border-primary/50">
                    <td className="py-2 font-medium" style={{ color: SESSION_COLORS[s.session]?.hex || undefined }}>{s.session}</td>
                    <td className="py-2 text-text-secondary">{s.count}</td>
                    <td className="py-2 text-text-secondary">{s.winRate.toFixed(1)}%</td>
                    <td className={`py-2 font-medium ${rColor(s.totalR)}`}>{formatR(s.totalR)}</td>
                    <td className={`py-2 ${rColor(s.avgR)}`}>{formatR(s.avgR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.monthlyPerformance.length > 0 && (
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים חודשיים</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                <th className="text-right pb-2 font-medium">חודש</th>
                <th className="text-right pb-2 font-medium">עסקאות</th>
                <th className="text-right pb-2 font-medium">Win Rate</th>
                <th className="text-right pb-2 font-medium">סה"כ R</th>
                <th className="text-right pb-2 font-medium">R מצטבר</th>
              </tr></thead>
              <tbody>
                {stats.monthlyPerformance.map((m) => (
                  <tr key={m.month} className="border-b border-border-primary/50">
                    <td className="py-2 text-text-primary font-medium">{m.month}</td>
                    <td className="py-2 text-text-secondary">{m.count}</td>
                    <td className="py-2 text-text-secondary">{m.winRate.toFixed(1)}%</td>
                    <td className={`py-2 font-medium ${rColor(m.totalR)}`}>{formatR(m.totalR)}</td>
                    <td className={`py-2 ${rColor(m.cumulativeR)}`}>{formatR(m.cumulativeR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
