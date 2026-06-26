import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

const tooltipStyle = {
  background: '#141414',
  border: '1px solid #1a1a1a',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#f0f0f0',
};

export default function WinLossDonut({ wins, losses }) {
  const total = (wins || 0) + (losses || 0);
  const winRate = total === 0 ? null : Math.round((wins / total) * 100);

  const data = [
    { name: 'רווחים', value: wins || 0, color: 'var(--color-profit)' },
    { name: 'הפסדים', value: losses || 0, color: 'var(--color-loss)' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-bg-secondary border border-border-primary rounded-xl p-5 h-full flex flex-col"
    >
      <div className="flex items-center gap-2 mb-3">
        <PieChartIcon className="w-4 h-4 text-accent-primary" />
        <span className="text-xs text-text-muted">רווחים מול הפסדים</span>
      </div>

      <div className="flex-1 min-h-[200px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              stroke="none"
              labelLine={false}
              label={false}
              isAnimationActive={total > 0}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            {total > 0 && (
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: '#f0f0f0' }}
                labelStyle={{ color: '#a0a0b8', fontSize: '11px' }}
                formatter={(val, name) => [val, name]}
              />
            )}
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-text-primary" dir="ltr">
            {winRate === null ? '—' : `${winRate}%`}
          </span>
          <span className="text-[10px] text-text-muted mt-0.5">אחוז הצלחה</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--color-profit)' }}
          />
          <span className="text-xs text-text-muted">
            רווחים <span className="text-profit" dir="ltr">{wins || 0}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--color-loss)' }}
          />
          <span className="text-xs text-text-muted">
            הפסדים <span className="text-loss" dir="ltr">{losses || 0}</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}
