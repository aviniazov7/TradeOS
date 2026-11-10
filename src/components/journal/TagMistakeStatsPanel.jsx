import { useMemo, useState } from 'react';
import TabStrip from '../shared/TabStrip';
import { formatCurrency } from '../../utils/formatters';
import { computeMistakeStats, computeTagStats } from '../../utils/tagMistakeStats';
import { computeCustomFieldStats } from '../../utils/customTradeFields';

const pnlColor = (v) => (v >= 0 ? 'text-profit' : 'text-loss');

// Sub-tabs inside the analytics screen. Tags, mistakes and custom fields are
// all computed from the trades already on screen.
export default function TagMistakeStatsPanel({ trades, onFilterJump, customFields = [] }) {
  const [section, setSection] = useState('tags');
  const tagStats = useMemo(() => computeTagStats(trades), [trades]);
  const mistakeStats = useMemo(() => computeMistakeStats(trades), [trades]);
  const customGroups = useMemo(
    () => computeCustomFieldStats(trades, customFields),
    [trades, customFields],
  );
  const customCount = customGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const tagsOn = section === 'tags';
  const customOn = section === 'custom';
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
              { id: 'custom', label: 'שדות', count: customCount },
            ]}
          />
        </div>
      </div>

      {customOn ? (
        <CustomFieldStats groups={customGroups} defined={customFields.length} onFilterJump={onFilterJump} />
      ) : rows.length === 0 ? (
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

function CustomFieldStats({ groups, defined, onFilterJump }) {
  if (!defined) {
    return (
      <p data-testid="custom-stats-empty" className="text-xs text-text-secondary">
        אין שדות משלך. מוסיפים אותם בטופס העסקה, בכפתור «+ שדה משלך».
      </p>
    );
  }
  if (!groups.length) {
    return (
      <p data-testid="custom-stats-empty" className="text-xs text-text-secondary">
        אין ערכים לשדות המותאמים על העסקאות הסגורות בתקופה הזו.
      </p>
    );
  }
  return (
    <>
      <div data-testid="custom-stats-scroll" className="max-h-80 overflow-y-auto space-y-4">
        {groups.map((group) => (
          <div key={group.id}>
            <h4 className="text-xs font-semibold text-text-primary mb-1">{group.name}</h4>
            <table className="w-full text-xs sm:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-xs text-text-muted border-b border-border-primary">
                  <th className="text-right py-2 font-medium bg-[var(--modal-header-solid)]">ערך</th>
                  <th className="text-right py-2 font-medium bg-[var(--modal-header-solid)]">עסקאות</th>
                  <th className="text-right py-2 font-medium bg-[var(--modal-header-solid)]">% הצלחה</th>
                  <th className="text-right py-2 font-medium bg-[var(--modal-header-solid)]">רווח/הפסד</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, index) => (
                  <tr
                    key={row.key}
                    data-testid={`custom-row-${group.id}-${index}`}
                    onClick={() => onFilterJump?.({
                      customField: group.id,
                      customValue: String(row.value),
                      customLabel: `${group.name}: ${row.label}`,
                    })}
                    className="border-b border-border-primary/50 cursor-pointer hover:bg-accent-primary/5 transition-colors"
                  >
                    <td className="py-2 text-text-primary font-medium">
                      <span dir={group.type === 'number' ? 'ltr' : undefined}>{row.label}</span>
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
        ))}
      </div>
      <p className="text-[10px] text-text-muted mt-2 text-center">לחץ על שורה כדי לסנן את העסקאות</p>
    </>
  );
}
