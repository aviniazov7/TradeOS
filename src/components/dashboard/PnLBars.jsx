import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

const tooltipStyle = {
  background: '#141414',
  border: '1px solid #1a1a1a',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#f0f0f0',
};

export default function PnLBars({ data, title }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-bg-secondary border border-border-primary rounded-xl p-5 h-full flex flex-col"
    >
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-accent-primary" />
        <span className="text-xs text-text-muted">{title}</span>
      </div>

      {!data || data.length === 0 ? (
        <div className="flex-1 min-h-[200px] flex items-center justify-center">
          <span className="text-sm text-text-muted">אין נתונים</span>
        </div>
      ) : (
        <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--color-border-primary)' }}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: '#f0f0f0' }}
                labelStyle={{ color: '#a0a0b8', fontSize: '11px' }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(v) => [formatCurrency(v), '']}
              />
              <ReferenceLine y={0} stroke="var(--color-border-primary)" />
              <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.pnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
