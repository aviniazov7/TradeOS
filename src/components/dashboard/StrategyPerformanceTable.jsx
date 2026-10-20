import { formatCurrency } from '../../utils/formatters';

export default function StrategyPerformanceTable({ data, onStrategyClick }) {
  if (!data || !data.length) return null;

  const pnlColor = (v) => (v >= 0 ? 'text-profit' : 'text-loss');

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי אסטרטגיה</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-text-muted border-b border-border-primary">
              <th className="text-right pb-2 font-medium">אסטרטגיה</th>
              <th className="text-right pb-2 font-medium">עסקאות</th>
              <th className="text-right pb-2 font-medium">רווחים</th>
              <th className="text-right pb-2 font-medium">הפסדים</th>
              <th className="text-right pb-2 font-medium">% הצלחה</th>
              <th className="text-right pb-2 font-medium">רווח/הפסד</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr
                key={s.name}
                className={`border-b border-border-primary/50 transition-colors ${onStrategyClick ? 'cursor-pointer hover:bg-accent-primary/5' : ''}`}
                onClick={() => onStrategyClick?.(s.name)}
                title={onStrategyClick ? `לחץ לסינון עסקאות: ${s.name}` : undefined}
              >
                <td className="py-2 text-text-primary font-medium">
                  {s.name}
                  {onStrategyClick && <span className="text-text-muted text-[10px] mr-1 opacity-50">↗</span>}
                </td>
                <td dir="ltr" className="py-2 text-text-secondary num-ltr text-right">{s.count}</td>
                <td dir="ltr" className="py-2 text-profit num-ltr text-right">{s.wins}</td>
                <td dir="ltr" className="py-2 text-loss num-ltr text-right">{s.losses}</td>
                <td dir="ltr" className="py-2 text-text-secondary num-ltr text-right">{s.winRate.toFixed(1)}%</td>
                <td dir="ltr" className={`py-2 font-medium num-ltr text-right ${pnlColor(s.pnl)}`}>{formatCurrency(s.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onStrategyClick && (
        <p className="text-[10px] text-text-muted mt-2 text-center">לחץ על שורה לסינון עסקאות לפי אסטרטגיה</p>
      )}
    </div>
  );
}
