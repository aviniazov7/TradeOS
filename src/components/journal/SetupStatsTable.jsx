import { formatCurrency, LRM } from '../../utils/formatters';

function formatR(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${LRM}${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}

const pnlColor = (v) => (v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-primary');

// Per-setup stats. Empty when the period has closed trades but none are tagged
// — the hint is how a trader finds the feature. R columns use net R.
export default function SetupStatsTable({ stats, onSetupClick }) {
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 sm:p-5 mb-6">
      <h3 className="text-sm font-semibold text-text-primary mb-1">ביצועים לפי סטאפ</h3>
      <p className="text-[11px] text-text-muted mb-3">R ממוצע ותוחלת מחושבים מ-R נטו, כמו בכותרת היומן.</p>
      {!stats?.length ? (
        <p className="text-xs text-text-secondary">תייג עסקאות בסטאפ (LPS, Spring, פריצה…) כדי לראות כאן את הביצועים.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm min-w-[36rem]">
            <thead>
              <tr className="text-[11px] text-text-muted border-b border-border-primary">
                <th className="text-right pb-2 font-medium">סטאפ</th>
                <th className="text-right pb-2 font-medium">עסקאות</th>
                <th className="text-right pb-2 font-medium">% הצלחה</th>
                <th className="text-right pb-2 font-medium">R ממוצע</th>
                <th className="text-right pb-2 font-medium">תוחלת</th>
                <th className="text-right pb-2 font-medium">רווח/הפסד</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr
                  key={s.name}
                  onClick={() => onSetupClick?.(s.name)}
                  className={`border-b border-border-primary/50 ${onSetupClick ? 'cursor-pointer hover:bg-accent-primary/5' : ''}`}
                >
                  <td className="py-2 text-text-primary font-medium whitespace-nowrap">
                    {s.label}
                    {onSetupClick && <span className="text-text-muted text-[10px] opacity-50"> ↗</span>}
                  </td>
                  <td className="py-2 text-text-secondary whitespace-nowrap">{s.count}</td>
                  <td className="py-2 text-text-secondary whitespace-nowrap" dir="ltr">{s.winRate.toFixed(1)}%</td>
                  <td className={`py-2 font-medium whitespace-nowrap ${pnlColor(s.avgNetR)}`} dir="ltr">{formatR(s.avgNetR)}</td>
                  <td className={`py-2 font-medium whitespace-nowrap ${pnlColor(s.expectancy)}`} dir="ltr">{formatR(s.expectancy)}</td>
                  <td className={`py-2 font-medium whitespace-nowrap ${pnlColor(s.pnl)}`} dir="ltr">{formatCurrency(s.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
