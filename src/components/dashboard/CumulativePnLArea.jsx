import { motion } from 'framer-motion';
import { LineChart } from 'lucide-react';
import {
  AreaChart,
  Area,
  CartesianGrid,
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

const compactUsd = (v) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`;
  return s;
};

export default function CumulativePnLArea({ series, hidden = false }) {
  if (!series || series.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-bg-secondary border border-border-primary rounded-xl p-5 h-full flex flex-col"
      >
        <div className="flex-1 min-h-[240px] flex flex-col items-center justify-center gap-1 text-center px-4">
          <span className="text-text-secondary text-sm">עקומת ההון שלך תופיע כאן</span>
          <span className="text-text-muted text-xs">אחרי שתתעד את העסקה הסגורה הראשונה</span>
        </div>
      </motion.div>
    );
  }

  const data = series.map((p, i) => ({ i, t: p.t || 0, value: p.value }));
  const hasDates = data.some((d) => d.t > 0);
  const last = data[data.length - 1].value;
  const positive = last >= 0;
  const color = positive ? 'var(--color-profit)' : 'var(--color-loss)';
  const gradId = 'cumulativePnlGrad';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-bg-secondary border border-border-primary rounded-xl p-5 h-full flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm font-semibold ${positive ? 'text-profit' : 'text-loss'}`}>
          {hidden ? '••••' : formatCurrency(last)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">P&amp;L מצטבר יומי</span>
          <LineChart className="w-4 h-4 text-accent-primary" />
        </div>
      </div>

      <div className="flex-1 min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border-primary)"
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey={hasDates ? 't' : 'i'}
              type="number"
              scale={hasDates ? 'time' : 'auto'}
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => (hasDates ? new Date(v).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : '')}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border-primary)' }}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={hidden ? () => '' : compactUsd}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={46}
            />
            <ReferenceLine y={0} stroke="var(--color-border-primary)" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
              labelFormatter={(v) => (hasDates ? new Date(v).toLocaleDateString('he-IL') : '')}
              formatter={(value) => [hidden ? '••••' : formatCurrency(value), 'P&L מצטבר']}
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
      </div>
    </motion.div>
  );
}
