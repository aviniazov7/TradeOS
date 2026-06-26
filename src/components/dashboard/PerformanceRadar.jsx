import { motion } from 'framer-motion';
import { Gauge } from 'lucide-react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts';

const TOOLTIP_STYLE = {
  background: '#141414',
  border: '1px solid #1a1a1a',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#f0f0f0',
};

function getScoreColorClass(score) {
  if (score >= 75) return 'text-profit';
  if (score >= 50) return 'text-accent-primary';
  return 'text-loss';
}

export default function PerformanceRadar({ metrics, score }) {
  const hasData = Array.isArray(metrics) && metrics.length > 0;
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const rounded = Math.round(safeScore);

  if (!hasData) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="w-4 h-4 text-accent-primary" />
          <span className="text-xs text-text-muted">ציון ביצועים</span>
        </div>
        <div className="flex items-center justify-center min-h-[180px]">
          <span className="text-sm text-text-muted">אין מספיק נתונים</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-bg-secondary border border-border-primary rounded-xl p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="w-4 h-4 text-accent-primary" />
        <span className="text-xs text-text-muted">ציון ביצועים</span>
      </div>

      {/* Score block */}
      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className={`text-4xl font-bold num-mono ${getScoreColorClass(safeScore)}`}>
            {rounded}
          </span>
          <span className="text-sm text-text-muted">/100</span>
        </div>
        <div className="mt-2 w-full h-1.5 rounded bg-bg-tertiary overflow-hidden">
          <div
            className="h-full rounded"
            style={{
              width: `${safeScore}%`,
              background:
                'linear-gradient(to right, var(--color-loss), var(--color-breakeven), var(--color-profit))',
            }}
          />
        </div>
      </div>

      {/* Radar chart */}
      <div className="w-full">
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={metrics}>
            <PolarGrid stroke="var(--color-border-primary)" />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              dataKey="value"
              stroke="var(--color-accent-primary)"
              fill="var(--color-accent-primary)"
              fillOpacity={0.35}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              itemStyle={{ color: '#f0f0f0' }}
              labelStyle={{ color: '#f0f0f0' }}
              formatter={(v) => Math.round(v)}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
