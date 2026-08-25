import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { isClosedTrade } from '../../utils/calculations';
import { groupWinRate } from '../../utils/calculations';

const tooltipStyle = {
  background: 'var(--color-bg-overlay)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-text-primary)',
};

export default function WinRateChart({ trades }) {
  const data = useMemo(() => {
    const closed = trades.filter((t) => isClosedTrade(t) && t.strategy);
    const groups = {};
    closed.forEach((t) => {
      if (!groups[t.strategy]) groups[t.strategy] = { wins: 0, losses: 0, total: 0 };
      groups[t.strategy].total++;
      if (t.result === 'win') groups[t.strategy].wins++;
      else if (t.result === 'loss') groups[t.strategy].losses++;
    });

    return Object.entries(groups)
      .map(([strategy, { wins, losses, total }]) => ({
        strategy: strategy.length > 14 ? strategy.slice(0, 14) + '…' : strategy,
        winRate: parseFloat(groupWinRate(wins, losses).toFixed(1)),
        count: total,
        wins,
        // Real losses, not "everything that is not a win" — the tooltip's
        // W/L label counted every breakeven as a loss.
        losses,
      }))
      .sort((a, b) => b.count - a.count); // sort by number of trades, not win rate
  }, [trades]);

  if (data.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 h-full flex items-center justify-center">
        <p className="text-text-muted text-sm">אין נתוני אסטרטגיה עדיין</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-1">אחוז הצלחה לפי אסטרטגיה</h3>
      <p className="text-[10px] text-text-muted mb-3">ממוין לפי מספר עסקאות</p>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data} margin={{ top: 18, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="strategy" tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} orientation="right" unit="%" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
            cursor={{ fill: 'var(--color-bg-tertiary)' }}
            formatter={(val, name, props) => [
              `${val}% (${props.payload.wins}W / ${props.payload.losses}L)`,
              'הצלחה',
            ]}
            labelFormatter={(label) => {
              const item = data.find(d => d.strategy === label);
              return item ? `${label} · ${item.count} עסקאות` : label;
            }}
          />
          <Bar dataKey="winRate" radius={[4, 4, 0, 0]} animationDuration={800}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.winRate >= 50 ? '#22c55e' : '#ef4444'} />
            ))}
            <LabelList
              content={({ x, y, width, value, index }) => {
                const item = data[index];
                return (
                  <text x={x + width / 2} y={y - 4} textAnchor="middle" fill="var(--color-text-muted)" fontSize={9}>
                    {item?.count} · {value}%
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
