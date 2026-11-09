import { useMemo, useState } from 'react';
import TabStrip from '../shared/TabStrip';
import { formatCurrency } from '../../utils/formatters';
import { computeMistakeStats, computeTagStats } from '../../utils/tagMistakeStats';

const pnlColor = (v) => (v >= 0 ? 'text-profit' : 'text-loss');

// Sub-tabs inside the analytics screen. Tags and mistakes are free for every
// plan. Custom fields stay out until their own stage.
export default function TagMistakeStatsPanel({ trades, onFilterJump }) {
  const [section, setSection] = useState('tags');
  const tagStats = useMemo(() => computeTagStats(trades), [trades]);
  const mistakeStats = useMemo(() => computeMistakeStats(trades), [trades]);
  const tagsOn = section === 'tags';
  const rows = tagsOn ? tagStats : mistakeStats;

  return (
    <section
      data-testid="tag-mistake-stats"
      className="bg-bg-secondary border border-border-primary rounded-xl p-4 sm:p-5 mb-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">לפי תגיות וטעויות</h3>
        <div className="inline-flex self-start rounded-xl bg-bg-tertiary border border-border-primary p-0.5">
          <TabStrip
            value={section}
            onChange={setSection}
            tabs={[
              { id: 'tags', label: 'תגיות', count: tagStats.length },
              { id: 'mistakes', label: 'טעויות', count: mistakeStats.length },
            ]}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p data-testid="tag-mistake-empty" className="text-xs text-text-secondary">
          {tagsOn
            ? 'אין תגיות על העסקאות הסגורות בתקופה הזו.'
            : 'אין טעויות על העסקאות הסגורות בתקופה הזו.'}
        </p>
      ) : (
        <>
          <div data-testid="tag-mistake-scroll" className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-xs text-text-muted border-b border-border-primary">
                  <th className="text-right py-2 font-medium bg-[var(--modal-header-solid)]">{tagsOn ? 'תגית' : 'טעות'}</th>
                  <th className="text-right py-2 font-medium bg-[var(--modal-header-solid)]">עסקאות</th>
                  <th className="text-right py-2 font-medium bg-[var(--modal-header-solid)]">% הצלחה</th>
                  <th className="text-right py-2 font-medium bg-[var(--modal-header-solid)]">רווח/הפסד</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    data-testid={`stat-row-${row.id}`}
                    onClick={() => onFilterJump?.(tagsOn ? { tag: row.id } : { mistake: row.id })}
                    className="border-b border-border-primary/50 cursor-pointer hover:bg-accent-primary/5 transition-colors"
                  >
                    <td className="py-2 text-text-primary font-medium">
                      {row.label}
                      <span className="text-text-muted text-[10px] opacity-50"> ↗</span>
                    </td>
                    <td className="py-2 text-text-secondary">{row.count}</td>
                    <td className="py-2 text-text-secondary">{row.winRate.toFixed(1)}%</td>
                    <td className={`py-2 font-medium ${pnlColor(row.pnl)}`}>{formatCurrency(row.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-text-muted mt-2 text-center">לחץ על שורה כדי לסנן את העסקאות</p>
        </>
      )}
    </section>
  );
}
