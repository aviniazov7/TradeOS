import { useMemo, useState, useRef } from 'react';
import { LRM } from '../../utils/formatters';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(value, max) {
  if (value === 0) return 'bg-bg-tertiary';
  const intensity = Math.min(Math.abs(value) / (max || 1), 1);
  if (value > 0) {
    if (intensity > 0.7) return 'bg-profit/80';
    if (intensity > 0.3) return 'bg-profit/40';
    return 'bg-profit/20';
  }
  if (intensity > 0.7) return 'bg-loss/80';
  if (intensity > 0.3) return 'bg-loss/40';
  return 'bg-loss/20';
}

export default function TradeHeatmap({ trades }) {
  const [tooltip, setTooltip] = useState(null); // { label, val, x, y }
  const containerRef = useRef(null);

  const { grid, maxVal, totalByDay, totalByHour } = useMemo(() => {
    const g = {};
    const byDay = {};
    const byHour = {};
    let max = 0;

    DAYS.forEach((_, d) => {
      g[d] = {};
      byDay[d] = 0;
      HOURS.forEach((h) => { g[d][h] = 0; });
    });
    HOURS.forEach((h) => { byHour[h] = 0; });

    trades.forEach((t) => {
      if (!t.exitDate || !t.exitPrice) return;
      const date = t.exitDate?.toDate ? t.exitDate.toDate() : new Date(t.exitDate);
      const day = date.getDay();
      const hour = date.getHours();
      const pnl = t.netPnl ?? t.pnl ?? 0;

      g[day][hour] += pnl;
      byDay[day] += pnl;
      byHour[hour] += pnl;
      max = Math.max(max, Math.abs(g[day][hour]));
    });

    return { grid: g, maxVal: max, totalByDay: byDay, totalByHour: byHour };
  }, [trades]);

  const hasData = trades.some((t) => t.exitDate && t.exitPrice);
  if (!hasData) return null;

  // Calculate position relative to container (fixes backdrop-filter stacking context bug in Safari)
  const getRelativePos = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  return (
    <div ref={containerRef} className="bg-bg-secondary border border-border-primary rounded-xl p-4 md:p-5 relative">
      <h3 className="text-sm font-semibold text-text-primary mb-4">מפת חום - ביצועים לפי יום ושעה</h3>

      {/* Tooltip — absolute (not fixed) to avoid Safari backdrop-filter stacking context bug */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none px-2.5 py-1.5 rounded-lg text-[11px] font-mono whitespace-nowrap"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 38,
            background: 'var(--color-bg-overlay)',
            border: '1px solid var(--color-border-primary)',
            color: tooltip.val > 0 ? '#22c55e' : tooltip.val < 0 ? '#ef4444' : '#606070',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          {tooltip.label} · {LRM}{tooltip.val >= 0 ? '+' : ''}${tooltip.val.toFixed(2)}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex items-center gap-0.5 mb-1 mr-14">
            {HOURS.filter((h) => h % 3 === 0).map((h) => (
              <div key={h} className="text-[9px] text-text-muted text-center" style={{ width: `${100 / 8}%` }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Grid */}
          {DAYS.map((dayName, d) => (
            <div key={d} className="flex items-center gap-0.5 mb-0.5">
              <span className="text-[10px] text-text-muted w-12 shrink-0 text-left">{dayName}</span>
              <div className="flex-1 flex gap-0.5">
                {HOURS.map((h) => {
                  const val = grid[d]?.[h] || 0;
                  return (
                    <div
                      key={h}
                      className={`flex-1 h-5 rounded-sm ${getColor(val, maxVal)} transition-colors cursor-default`}
                      onMouseEnter={(e) => { const p = getRelativePos(e); setTooltip({ label: `${dayName} ${String(h).padStart(2, '0')}:00`, val, x: p.x, y: p.y }); }}
                      onMouseMove={(e) => { const p = getRelativePos(e); setTooltip(t => t ? { ...t, x: p.x, y: p.y } : null); }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
              <span className={`text-[9px] w-12 text-left shrink-0 ${totalByDay[d] >= 0 ? 'text-profit' : 'text-loss'}`}>
                ${totalByDay[d].toFixed(0)}
              </span>
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-text-muted">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-loss/60" /> הפסד
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-bg-tertiary" /> ללא
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-profit/60" /> רווח
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
