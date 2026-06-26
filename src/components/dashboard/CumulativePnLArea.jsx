import { motion } from 'framer-motion';
import { LineChart } from 'lucide-react';
import {
  AreaChart,
  Area,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../../utils/formatters';

const tooltipStyle = {
  background: '#141414',
  border: '1px solid #1a1a1a',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#f0f0f0',
};

export default function CumulativePnLArea({ equity }) {
  if (!equity || equity.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-bg-secondary border border-border-primary rounded-xl p-5"
      >
        <div className="h-[230px] flex items-center justify-center">
          <span className="text-text-muted text-sm">אין מספיק נתונים</span>
        </div>
      </motion.div>
    );
  }

  const data = equity.map((v, i) => ({ i, value: v }));
  const last = equity[equity.length - 1];
  const positive = last >= 0;
  const color = positive ? 'var(--color-profit)' : 'var(--color-loss)';
  const gradId = 'cumulativePnlGrad';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-bg-secondary border border-border-primary rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm font-semibold ${positive ? 'text-profit' : 'text-loss'}`}>
          {formatCurrency(last)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">עקומת הון (P&amp;L מצטבר)</span>
          <LineChart className="w-4 h-4 text-accent-primary" />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="i" hide />
          <YAxis hide />
          <ReferenceLine y={0} stroke="var(--color-border-primary)" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
            labelFormatter={() => ''}
            formatter={(value) => [formatCurrency(value), '']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
