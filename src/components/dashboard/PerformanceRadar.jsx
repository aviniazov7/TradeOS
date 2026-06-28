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
  background: 'var(--color-bg-overlay)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-text-primary)',
};

const PURPLE = 'var(--color-chart-purple)';

export default function PerformanceRadar({ metrics, score }) {
  const hasData = Array.isArray(metrics) && metrics.length > 0;
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));

  if (!hasData) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="w-4 h-4 text-accent-primary" />
          <span className="text-xs text-text-muted">ציון ביצועים</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center min-h-[180px] gap-1 text-center px-4">
          <span className="text-sm text-text-secondary">ציון הביצועים שלך יופיע כאן</span>
          <span className="text-xs text-text-muted">תעד עסקאות כדי לראות את הניתוח</span>
        </div>
      </div>
    );
  }

  const data = metrics.map((mtr) => ({ ...mtr, full: 100 }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-bg-secondary border border-border-primary rounded-xl p-5 h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Gauge className="w-4 h-4 text-accent-primary" />
        <span className="text-xs text-text-muted">ציון ביצועים</span>
      </div>

      {/* Radar chart */}
      <div className="w-full flex-1 min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="var(--color-border-primary)" />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {/* dark outer boundary */}
            <Radar
              dataKey="full"
              stroke="var(--color-border-primary)"
              strokeWidth={3}
              fill="transparent"
              isAnimationActive={false}
              activeDot={false}
            />
            {/* actual score */}
            <Radar
              dataKey="value"
              stroke={PURPLE}
              fill={PURPLE}
              fillOpacity={0.45}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              itemStyle={{ color: 'var(--color-text-primary)' }}
              labelStyle={{ color: 'var(--color-text-secondary)' }}
              formatter={(v) => Math.round(v)}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Score scale (TradeZella-style) */}
      <div className="mt-2 pt-3 border-t border-border-primary flex items-center gap-4">
        <div className="shrink-0">
          <div className="text-[11px] text-text-muted mb-0.5">הציון שלך</div>
          <div className="text-xl font-bold text-text-primary leading-none" dir="ltr">
            {safeScore.toFixed(1)}
          </div>
        </div>
        <div className="flex-1">
          <div className="relative h-2 rounded-full" style={{
            background: 'linear-gradient(to right, #ef4444, #f59e0b, #eab308, #22c55e, var(--color-accent-primary))',
          }}>
            <div
              className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-bg-secondary shadow"
              style={{ left: `${safeScore}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-text-muted" dir="ltr">
            <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
